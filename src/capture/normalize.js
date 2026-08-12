import { createHash } from "node:crypto";
import { redactCredentials } from "../privacy/redact.js";
import { computeMessageId } from "../lore/records.js";

export const LIVE_CAPTURE_SCHEMA = "continuity-bridge/live-capture-v1";
const MAX_MESSAGE_CHARS = 1_000_000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

function iso(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function sanitizeSourceUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function normalizedProvider(value) {
  const provider = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(provider)) {
    throw new Error("live capture source must be a short provider identifier");
  }
  return provider;
}

function normalizedConversation(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("live capture payload must be an object");
  }
  if (payload.schema !== LIVE_CAPTURE_SCHEMA) {
    throw new Error(`unsupported live capture schema: ${String(payload.schema ?? "missing")}`);
  }
  const source = normalizedProvider(payload.source);
  const conversation = payload.conversation;
  if (!conversation || typeof conversation !== "object" || Array.isArray(conversation)) {
    throw new Error("live capture payload requires conversation metadata");
  }
  const id = String(conversation.id ?? "").trim();
  if (!id || id.length > 512) throw new Error("live capture conversation.id is required");
  const title = String(conversation.title ?? "Untitled live conversation").trim().slice(0, 500);
  if (!Array.isArray(conversation.messages) || conversation.messages.length === 0) {
    throw new Error("live capture conversation.messages must contain at least one message");
  }
  if (conversation.messages.length > 20_000) {
    throw new Error("live capture payload exceeds the 20,000-message safety bound");
  }
  return { source, conversation, id, title };
}

export function inspectLiveCapture(payload) {
  const { source, conversation, id, title } = normalizedConversation(payload);
  let usable = 0;
  for (const [index, message] of conversation.messages.entries()) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new Error(`live capture message ${index + 1} must be an object`);
    }
    if (!["user", "assistant", "system"].includes(message.role)) {
      throw new Error(`live capture message ${index + 1} has unsupported role: ${String(message.role)}`);
    }
    if (typeof message.text !== "string") {
      throw new Error(`live capture message ${index + 1}.text must be a string`);
    }
    if (message.text.trim()) usable += 1;
  }
  if (usable === 0) throw new Error("live capture payload contains no non-empty messages");
  return {
    schema: LIVE_CAPTURE_SCHEMA,
    source,
    conversationId: id,
    title,
    messageCount: usable,
    sourceUrl: sanitizeSourceUrl(conversation.sourceUrl),
  };
}

export function liveCaptureToLoreBatch(payload, options = {}) {
  const summary = inspectLiveCapture(payload);
  const conversation = payload.conversation;
  const source = String(options.source ?? `${summary.source}-live`).trim();
  if (!source) throw new Error("live capture Lore source cannot be empty");
  const sourceFileId = `live:${source}:${summary.conversationId}`;
  const sessionId = sourceFileId;
  const project = String(
    options.project ?? payload.project ?? `live://${summary.source}/${slug(summary.title)}`,
  ).trim();
  const messages = [];
  let previousUuid = null;

  for (const message of conversation.messages) {
    if (!message.text.trim()) continue;
    const seq = messages.length;
    const uuid = String(message.id ?? message.uuid ?? `live-${seq}`).trim() || `live-${seq}`;
    const parentUuid = message.parentId === null
      ? null
      : String(message.parentId ?? previousUuid ?? "").trim() || null;
    const rawText = message.text;
    const scrubbed = options.redact === false ? rawText : redactCredentials(rawText);
    const textTruncated = scrubbed.length > MAX_MESSAGE_CHARS;
    const text = textTruncated
      ? `${scrubbed.slice(0, MAX_MESSAGE_CHARS)}\n[message truncated by ContinuityBridge]`
      : scrubbed;
    messages.push({
      messageId: computeMessageId(sourceFileId, uuid, seq),
      sourceFileId,
      sessionId,
      uuid,
      parentUuid,
      seq,
      role: message.role,
      timestamp: iso(message.timestamp),
      project,
      branch: null,
      model: message.model ? String(message.model).slice(0, 200) : null,
      agent: null,
      skill: null,
      text,
      textTruncated,
    });
    previousUuid = uuid;
  }

  const stablePayload = {
    schema: LIVE_CAPTURE_SCHEMA,
    source: summary.source,
    conversationId: summary.conversationId,
    title: summary.title,
    sourceUrl: summary.sourceUrl,
    messages: messages.map((message) => ({
      uuid: message.uuid,
      parentUuid: message.parentUuid,
      seq: message.seq,
      role: message.role,
      timestamp: message.timestamp,
      model: message.model,
      text: message.text,
    })),
  };
  const payloadHash = sha256(JSON.stringify(stablePayload));
  const lastTimestamp = messages.map((message) => message.timestamp).filter(Boolean).at(-1) ?? null;
  return {
    sourceFile: {
      sourceFileId,
      source,
      sessionId,
      kind: "primary",
      agentFile: null,
      path: `live-capture://${summary.source}/${encodeURIComponent(summary.conversationId)}`,
      byteOffset: 0,
      lineCount: messages.length,
      prefixSha256: payloadHash,
      mtime: lastTimestamp,
      resumeToken: { kind: "hash", value: payloadHash },
      indexedAt: new Date().toISOString(),
    },
    messages,
    toolCalls: [],
  };
}
