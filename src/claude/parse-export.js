import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extractClaudeMessageText } from "./content.js";
import { redactCredentials } from "../privacy/redact.js";
import { computeMessageId } from "../lore/records.js";

const MAX_MESSAGE_CHARS = 1_000_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toIso(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function timestampValue(value) {
  const iso = toIso(value);
  return iso ? Date.parse(iso) : Number.POSITIVE_INFINITY;
}

function rootConversations(raw) {
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === "object");
  if (!raw || typeof raw !== "object") return [];
  for (const key of ["conversations", "chats", "items"]) {
    if (Array.isArray(raw[key])) return raw[key].filter((item) => item && typeof item === "object");
  }
  if (Array.isArray(raw.chat_messages) || Array.isArray(raw.messages)) return [raw];
  return [];
}

function conversationMessages(conversation) {
  const messages = conversation.chat_messages ?? conversation.messages ?? [];
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message === "object")
    .map((message, index) => ({ ...message, __index: index }))
    .sort((a, b) => {
      const delta =
        timestampValue(a.created_at ?? a.create_time ?? a.timestamp) -
        timestampValue(b.created_at ?? b.create_time ?? b.timestamp);
      return delta || a.__index - b.__index;
    });
}

function normalizeRole(sender) {
  const value = String(sender ?? "").toLowerCase();
  if (["human", "user"].includes(value)) return { role: "user", prefix: "" };
  if (["assistant", "bot", "ai"].includes(value)) return { role: "assistant", prefix: "" };
  if (value === "system") return { role: "system", prefix: "" };
  return { role: "system", prefix: `[${value || "unknown"}]\n` };
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

export function claudeConversationId(conversation, _index = 0) {
  return String(
    conversation.uuid ??
      conversation.id ??
      conversation.conversation_id ??
      sha256(
        `${conversation.name ?? conversation.title ?? "untitled"}\u0000${
          conversation.created_at ??
          conversation.updated_at ??
          JSON.stringify(conversation.chat_messages ?? conversation.messages ?? [])
        }`,
      ),
  );
}

function conversationTitle(conversation) {
  return String(
    conversation.name ?? conversation.title ?? conversation.summary ?? "Untitled conversation",
  );
}

function messageUuid(message, conversationId, index) {
  return String(message.uuid ?? message.id ?? message.message_id ?? `${conversationId}:${index}`);
}

function explicitParentUuid(message) {
  const parent =
    message.parent_uuid ??
    message.parent_id ??
    message.parent_message_uuid ??
    message.parent_message_id;
  return parent === null || parent === undefined ? null : String(parent);
}

function modelName(conversation, message) {
  return (
    message.model ??
    message.model_name ??
    message.metadata?.model ??
    conversation.model ??
    conversation.model_name ??
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

export async function readClaudeConversations(paths) {
  const inputPaths = Array.isArray(paths) ? paths : [paths];
  const merged = [];
  const indexById = new Map();

  for (const path of inputPaths) {
    let raw;
    try {
      raw = JSON.parse(await readFile(path, "utf8"));
    } catch {
      continue;
    }
    const conversations = rootConversations(raw);
    if (conversations.length === 0) continue;

    for (const conversation of conversations) {
      if (!Array.isArray(conversation.chat_messages) && !Array.isArray(conversation.messages)) {
        continue;
      }
      const id = claudeConversationId(conversation, merged.length);
      if (!indexById.has(id)) {
        indexById.set(id, merged.length);
        merged.push(conversation);
        continue;
      }

      const existingIndex = indexById.get(id);
      const existing = merged[existingIndex];
      const existingTime = timestampValue(existing.updated_at ?? existing.created_at);
      const candidateTime = timestampValue(conversation.updated_at ?? conversation.created_at);
      if (candidateTime >= existingTime) merged[existingIndex] = conversation;
    }
  }

  if (merged.length === 0) {
    throw new Error("the selected JSON did not contain recognizable Claude conversations");
  }
  return merged;
}

export function claudeConversationToLoreBatch(conversation, options = {}, index = 0) {
  const id = claudeConversationId(conversation, index);
  const source = options.source ?? "claude";
  const sourceFileId = `${source}:${id}`;
  const sessionId = sourceFileId;
  const title = conversationTitle(conversation);
  const project = options.project ?? `claude://${titleSlug(title)}`;
  const rawMessages = conversationMessages(conversation);
  const messages = [];
  let previousUuid = null;

  for (const rawMessage of rawMessages) {
    const rawText = extractClaudeMessageText(rawMessage);
    if (!rawText.trim()) continue;
    const { role, prefix } = normalizeRole(
      rawMessage.sender ?? rawMessage.role ?? rawMessage.author?.role ?? rawMessage.author?.name,
    );
    const scrubbed = options.redact === false ? rawText : redactCredentials(rawText);
    const bounded = truncate(`${prefix}${scrubbed}`);
    const uuid = messageUuid(rawMessage, id, rawMessage.__index);
    const seq = messages.length;
    const parentUuid = explicitParentUuid(rawMessage) ?? previousUuid;

    messages.push({
      messageId: computeMessageId(sourceFileId, uuid, seq),
      sourceFileId,
      sessionId,
      uuid,
      parentUuid,
      seq,
      role,
      timestamp: toIso(
        rawMessage.created_at ?? rawMessage.create_time ?? rawMessage.timestamp ?? rawMessage.updated_at,
      ),
      project,
      branch: null,
      model: modelName(conversation, rawMessage),
      agent: null,
      skill: null,
      text: bounded.text,
      textTruncated: bounded.textTruncated,
    });
    previousUuid = uuid;
  }

  const payloadHash = sha256(JSON.stringify(conversation));
  return {
    sourceFile: {
      sourceFileId,
      source,
      sessionId,
      kind: "primary",
      agentFile: null,
      path: `claude-export://conversation/${id}`,
      byteOffset: 0,
      lineCount: messages.length,
      prefixSha256: payloadHash,
      mtime: toIso(conversation.updated_at ?? conversation.created_at),
      resumeToken: { kind: "hash", value: payloadHash },
      indexedAt: new Date().toISOString(),
    },
    messages,
    toolCalls: [],
  };
}

export function toClaudeLoreBatches(conversations, options = {}) {
  return conversations
    .map((conversation, index) => claudeConversationToLoreBatch(conversation, options, index))
    .filter((batch) => batch.messages.length > 0);
}

export function summarizeClaudeConversations(conversations, options = {}) {
  return conversations.map((conversation, index) => {
    const batch = claudeConversationToLoreBatch(conversation, options, index);
    const first = batch.messages[0]?.timestamp ?? null;
    const last = batch.messages.at(-1)?.timestamp ?? null;
    const preview = batch.messages
      .slice(0, 6)
      .map((message) => `${message.role}: ${message.text}`)
      .join("\n\n")
      .slice(0, 4_000);
    return {
      id: claudeConversationId(conversation, index),
      title: conversationTitle(conversation),
      provider: "claude",
      messageCount: batch.messages.length,
      createdAt: toIso(conversation.created_at) ?? first,
      updatedAt: toIso(conversation.updated_at) ?? last,
      preview,
    };
  });
}
