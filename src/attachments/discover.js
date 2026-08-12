import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { chatGptConversationId } from "../chatgpt/parse-export.js";
import { claudeConversationId } from "../claude/parse-export.js";

const POINTER_KEYS = [
  "asset_pointer",
  "audio_asset_pointer",
  "image_url",
  "file_id",
  "download_url",
  "url",
  "remote_url",
];
const NAME_KEYS = ["file_name", "filename", "name", "title"];
const MIME_KEYS = ["mime_type", "media_type", "content_type"];
const LOCAL_PATH_KEYS = ["path", "file_path", "filepath", "local_path", "relative_path"];
const ATTACHMENT_TYPES = new Set(["attachment", "file", "image", "audio", "video", "document"]);
const ATTACHMENT_COLLECTIONS = new Set(["attachments", "files"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function firstString(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function attachmentLike(value, collectionName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (ATTACHMENT_COLLECTIONS.has(collectionName)) return true;
  if (POINTER_KEYS.some((key) => typeof value[key] === "string" && value[key].trim())) return true;
  const type = String(value.type ?? "").toLowerCase();
  if (ATTACHMENT_TYPES.has(type)) return true;
  return Boolean(firstString(value, NAME_KEYS) && firstString(value, MIME_KEYS));
}

function collectAttachmentObjects(value, collectionName = null, output = [], seen = new Set()) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentObjects(item, collectionName, output, seen);
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);

  if (attachmentLike(value, collectionName)) output.push(value);
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") collectAttachmentObjects(child, key, output, seen);
  }
  return output;
}

function normalizedRelativePath(path) {
  return path.split(sep).join("/");
}

function safeRelativeCandidate(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\0")) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) return null;
  if (/^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    return null;
  }
  const normalized = trimmed.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((part) => part === "..")) return null;
  return segments.join("/");
}

function pointerFingerprint(object) {
  const values = POINTER_KEYS.flatMap((key) => {
    const value = object?.[key];
    return typeof value === "string" && value.trim() ? [`${key}:${value.trim()}`] : [];
  }).sort();
  return values.length > 0 ? sha256(values.join("\n")) : null;
}

function localCandidates(object) {
  const values = [];
  for (const key of [...LOCAL_PATH_KEYS, ...NAME_KEYS]) {
    const candidate = safeRelativeCandidate(object?.[key]);
    if (candidate && !values.includes(candidate)) values.push(candidate);
  }
  return values;
}

async function walkExportFiles(directory, output = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walkExportFiles(absolute, output);
    } else if (entry.isFile()) {
      output.push(absolute);
    }
  }
  return output;
}

async function buildFileIndex(rootDirectory, excludedPaths = []) {
  const root = resolve(rootDirectory);
  const excluded = new Set(excludedPaths.map((path) => resolve(path)));
  const files = (await walkExportFiles(root)).filter((path) => !excluded.has(resolve(path)));
  const byRelative = new Map();
  const byBasename = new Map();

  for (const absolutePath of files) {
    const relativePath = normalizedRelativePath(relative(root, absolutePath));
    const entry = {
      absolutePath,
      relativePath,
      size: (await stat(absolutePath)).size,
    };
    byRelative.set(relativePath.toLowerCase(), entry);
    const key = basename(relativePath).toLowerCase();
    const matches = byBasename.get(key) ?? [];
    matches.push(entry);
    byBasename.set(key, matches);
  }
  return { root, byRelative, byBasename };
}

function resolveLocalArtifact(index, candidates) {
  for (const candidate of candidates) {
    const exact = index.byRelative.get(candidate.toLowerCase());
    if (exact) return { status: "available", entry: exact, reason: null };
  }

  const basenameMatches = new Map();
  for (const candidate of candidates) {
    const key = basename(candidate).toLowerCase();
    for (const match of index.byBasename.get(key) ?? []) {
      basenameMatches.set(match.absolutePath, match);
    }
  }
  const matches = [...basenameMatches.values()];
  if (matches.length === 1) return { status: "available", entry: matches[0], reason: null };
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      entry: null,
      reason: `multiple files in the selected export match this attachment name (${matches.length})`,
    };
  }
  return {
    status: "missing",
    entry: null,
    reason: "no matching local artifact was found inside the selected export",
  };
}

function chatGptMessages(conversation) {
  return Object.entries(conversation.mapping ?? {})
    .map(([key, node]) => ({ key, node, message: node?.message }))
    .filter((item) => item.message)
    .sort((a, b) => String(a.key).localeCompare(String(b.key), undefined, { numeric: true }));
}

function claudeMessages(conversation) {
  const messages = conversation.chat_messages ?? conversation.messages ?? [];
  return Array.isArray(messages)
    ? messages.map((message, index) => ({ key: String(index), node: null, message }))
    : [];
}

function providerConversationId(provider, conversation, index) {
  return provider === "chatgpt"
    ? chatGptConversationId(conversation, index)
    : claudeConversationId(conversation, index);
}

function providerConversationTitle(conversation) {
  return String(
    conversation.title ?? conversation.name ?? conversation.summary ?? "Untitled conversation",
  );
}

function providerMessageId(provider, item, conversationId, index) {
  if (provider === "chatgpt") {
    return String(item.message.id ?? item.node?.id ?? item.key ?? `${conversationId}:${index}`);
  }
  return String(
    item.message.uuid ??
      item.message.id ??
      item.message.message_id ??
      `${conversationId}:${index}`,
  );
}

function providerMessageRole(provider, message) {
  if (provider === "chatgpt") return String(message.author?.role ?? "unknown");
  return String(message.sender ?? message.role ?? message.author?.role ?? "unknown");
}

function attachmentName(object, ordinal) {
  return firstString(object, NAME_KEYS) ?? `attachment-${ordinal + 1}`;
}

function attachmentMime(object) {
  const mime = firstString(object, MIME_KEYS);
  if (!mime || mime.toLowerCase() === "text") return null;
  return mime;
}

export function publicAttachmentRecord(attachment) {
  const { sourceAbsolutePath: _sourceAbsolutePath, ...safe } = attachment;
  return safe;
}

export async function discoverAttachments({
  provider,
  conversations,
  rootDirectory,
  conversationPaths = [],
}) {
  if (!new Set(["chatgpt", "claude"]).has(provider)) {
    throw new Error(`unsupported attachment provider: ${provider}`);
  }
  const fileIndex = await buildFileIndex(rootDirectory, conversationPaths);
  const attachments = [];

  conversations.forEach((conversation, conversationIndex) => {
    const conversationId = providerConversationId(provider, conversation, conversationIndex);
    const conversationTitle = providerConversationTitle(conversation);
    const messages = provider === "chatgpt" ? chatGptMessages(conversation) : claudeMessages(conversation);

    messages.forEach((item, messageIndex) => {
      const messageId = providerMessageId(provider, item, conversationId, messageIndex);
      const role = providerMessageRole(provider, item.message);
      const objects = collectAttachmentObjects(item.message);

      objects.forEach((object, attachmentIndex) => {
        const name = attachmentName(object, attachmentIndex);
        const mimeType = attachmentMime(object);
        const candidates = localCandidates(object);
        const resolution = resolveLocalArtifact(fileIndex, candidates);
        const attachmentId = sha256(
          [provider, conversationId, messageId, String(attachmentIndex), name, mimeType ?? ""].join("\0"),
        ).slice(0, 24);

        attachments.push({
          id: attachmentId,
          name,
          mimeType,
          status: resolution.status,
          sourceRelativePath: resolution.entry?.relativePath ?? null,
          size: resolution.entry?.size ?? null,
          providerReferenceSha256: pointerFingerprint(object),
          missingReason: resolution.reason,
          provenance: {
            provider,
            conversationId,
            conversationTitle,
            messageId,
            role,
            attachmentIndex,
          },
          sourceAbsolutePath: resolution.entry?.absolutePath ?? null,
        });
      });
    });
  });

  return attachments;
}
