import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extractMessageText } from "./content.js";
import { redactCredentials } from "../privacy/redact.js";
import { computeMessageId } from "../lore/records.js";

const MAX_MESSAGE_CHARS = 1_000_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function timestampValue(message) {
  const raw = message?.create_time ?? message?.update_time;
  if (raw === null || raw === undefined) return Number.POSITIVE_INFINITY;
  if (typeof raw === "number") return raw;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed / 1000;
}

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function stableNodeOrder(mapping) {
  const nodes = Object.entries(mapping ?? {}).map(([key, node]) => ({
    ...node,
    id: node.id ?? key,
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set();
  const output = [];
  const compare = (a, b) => {
    const delta = timestampValue(a.message) - timestampValue(b.message);
    return delta || String(a.id).localeCompare(String(b.id));
  };

  const visit = (node) => {
    if (!node || visited.has(node.id)) return;
    visited.add(node.id);
    if (node.message) output.push(node);
    const children = (node.children ?? [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort(compare);
    for (const child of children) visit(child);
  };

  const roots = nodes
    .filter((node) => !node.parent || !byId.has(node.parent))
    .sort(compare);
  for (const root of roots) visit(root);
  for (const node of nodes.sort(compare)) visit(node);
  return output;
}

function parentMessageUuid(mapping, node) {
  let parentId = node.parent;
  const visited = new Set();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = mapping[parentId];
    if (!parent) return String(parentId);
    if (parent.message) return String(parent.message.id ?? parent.id ?? parentId);
    parentId = parent.parent;
  }
  return null;
}

function normalizeRole(authorRole) {
  if (authorRole === "user" || authorRole === "assistant" || authorRole === "system") {
    return { role: authorRole, prefix: "" };
  }
  const label = authorRole || "unknown";
  return { role: "system", prefix: `[${label}]\n` };
}

function titleSlug(value) {
  const slug = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled";
}

function conversationId(conversation, index) {
  return String(
    conversation.id ??
      conversation.conversation_id ??
      sha256(`${conversation.title ?? "untitled"}\u0000${conversation.create_time ?? index}`),
  );
}

function modelName(conversation, message) {
  return (
    message?.metadata?.model_slug ??
    message?.metadata?.default_model_slug ??
    conversation.default_model_slug ??
    conversation.metadata?.model_slug ??
    null
  );
}

function truncate(text) {
  if (text.length <= MAX_MESSAGE_CHARS) return { text, textTruncated: false };
  return {
    text: `${text.slice(0, MAX_MESSAGE_CHARS)}\n[message truncated by ContinuityBridge]`,
    textTruncated: true,
  };
}

export async function readChatGptConversations(paths) {
  const inputPaths = Array.isArray(paths) ? paths : [paths];
  const merged = [];
  const indexById = new Map();

  for (const path of inputPaths) {
    const raw = JSON.parse(await readFile(path, "utf8"));
    const conversations = Array.isArray(raw) ? raw : raw.conversations;
    if (!Array.isArray(conversations)) {
      throw new Error(`${path} did not contain an array of conversations`);
    }

    for (const conversation of conversations) {
      const id = conversation.id ?? conversation.conversation_id;
      if (!id || !indexById.has(String(id))) {
        if (id) indexById.set(String(id), merged.length);
        merged.push(conversation);
        continue;
      }

      // If an export contains the same conversation in more than one numbered
      // file, retain the newest copy rather than importing duplicate sessions.
      const existingIndex = indexById.get(String(id));
      const existing = merged[existingIndex];
      const existingTime = timestampValue({
        create_time: existing.update_time ?? existing.create_time,
      });
      const candidateTime = timestampValue({
        create_time: conversation.update_time ?? conversation.create_time,
      });
      if (candidateTime >= existingTime) merged[existingIndex] = conversation;
    }
  }

  return merged;
}

export function conversationToLoreBatch(conversation, options = {}, index = 0) {
  const id = conversationId(conversation, index);
  const source = options.source ?? "chatgpt";
  const sourceFileId = `${source}:${id}`;
  const sessionId = sourceFileId;
  const title = String(conversation.title ?? "Untitled conversation");
  const project = options.project ?? `chatgpt://${titleSlug(title)}`;
  const nodes = stableNodeOrder(conversation.mapping);
  const mapping = conversation.mapping ?? {};
  const messages = [];

  for (const node of nodes) {
    const message = node.message;
    const rawText = extractMessageText(message);
    if (!rawText.trim()) continue;
    const { role, prefix } = normalizeRole(message.author?.role);
    const scrubbed = options.redact === false ? rawText : redactCredentials(rawText);
    const bounded = truncate(`${prefix}${scrubbed}`);
    const uuid = String(message.id ?? node.id ?? `${id}:${messages.length}`);
    const seq = messages.length;

    messages.push({
      messageId: computeMessageId(sourceFileId, uuid, seq),
      sourceFileId,
      sessionId,
      uuid,
      parentUuid: parentMessageUuid(mapping, node),
      seq,
      role,
      timestamp: toIso(message.create_time ?? message.update_time),
      project,
      branch: null,
      model: modelName(conversation, message),
      agent: null,
      skill: null,
      text: bounded.text,
      textTruncated: bounded.textTruncated,
    });
  }

  const payloadHash = sha256(JSON.stringify(conversation));
  const indexedAt = new Date().toISOString();
  return {
    sourceFile: {
      sourceFileId,
      source,
      sessionId,
      kind: "primary",
      agentFile: null,
      path: `chatgpt-export://conversation/${id}`,
      byteOffset: 0,
      lineCount: messages.length,
      prefixSha256: payloadHash,
      mtime: toIso(conversation.update_time ?? conversation.create_time),
      resumeToken: { kind: "hash", value: payloadHash },
      indexedAt,
    },
    messages,
    toolCalls: [],
  };
}

export function toLoreBatches(conversations, options = {}) {
  return conversations
    .map((conversation, index) => conversationToLoreBatch(conversation, options, index))
    .filter((batch) => batch.messages.length > 0);
}
