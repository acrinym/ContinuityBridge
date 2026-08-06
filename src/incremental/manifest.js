import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const MANIFEST_VERSION = 1;

export function defaultManifestPath() {
  return resolve(homedir(), ".continuity-bridge", "import-manifest.json");
}

export function emptyManifest() {
  return {
    version: MANIFEST_VERSION,
    updatedAt: null,
    destinations: {},
  };
}

export async function loadManifest(path = defaultManifestPath()) {
  const absolute = resolve(path);
  let text;
  try {
    text = await readFile(absolute, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return emptyManifest();
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid incremental manifest JSON at ${absolute}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`invalid incremental manifest at ${absolute}: root must be an object`);
  }
  if (parsed.version !== MANIFEST_VERSION) {
    throw new Error(
      `unsupported incremental manifest version at ${absolute}: ${String(parsed.version)}`,
    );
  }
  if (!parsed.destinations || typeof parsed.destinations !== "object") {
    throw new Error(`invalid incremental manifest at ${absolute}: destinations must be an object`);
  }
  return parsed;
}

export function loreDestinationKey(options = {}) {
  const source = options.source ?? "unknown";
  const project = options.project ?? "";
  const database = options.database ?? process.env.LORE_DB ?? "~/.lore/lore.db";
  return JSON.stringify({ kind: "lore", source, project, database });
}

export function batchResumeToken(batch) {
  const exported = batch?.sourceFile?.resumeToken;
  if (typeof exported === "string" && exported.length > 0) return exported;
  if (
    exported &&
    typeof exported === "object" &&
    typeof exported.value === "string" &&
    exported.value.length > 0
  ) {
    return `${exported.kind ?? "token"}:${exported.value}`;
  }

  const stableFallback = {
    sourceFileId: batch?.sourceFile?.sourceFileId ?? null,
    sessionId: batch?.sourceFile?.sessionId ?? null,
    source: batch?.sourceFile?.source ?? null,
    path: batch?.sourceFile?.path ?? null,
    prefixSha256: batch?.sourceFile?.prefixSha256 ?? null,
    messages: Array.isArray(batch?.messages)
      ? batch.messages.map((message) => ({
          messageId: message.messageId ?? null,
          uuid: message.uuid ?? null,
          parentUuid: message.parentUuid ?? null,
          seq: message.seq ?? null,
          role: message.role ?? null,
          timestamp: message.timestamp ?? null,
          project: message.project ?? null,
          model: message.model ?? null,
          text: message.text ?? "",
        }))
      : [],
  };
  return createHash("sha256").update(JSON.stringify(stableFallback)).digest("hex");
}

export function batchManifestId(batch) {
  const id = batch?.sourceFile?.sourceFileId ?? batch?.sourceFile?.sessionId;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("cannot checkpoint Lore batch without sourceFileId or sessionId");
  }
  return id;
}

function destinationRecord(manifest, destinationKey) {
  const current = manifest.destinations[destinationKey];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    if (!current.conversations || typeof current.conversations !== "object") {
      current.conversations = {};
    }
    return current;
  }
  const created = {
    updatedAt: null,
    conversations: {},
  };
  manifest.destinations[destinationKey] = created;
  return created;
}

export function selectPendingBatches(batches, manifest, destinationKey, options = {}) {
  if (options.reimport) {
    return { pending: [...batches], skipped: [] };
  }
  const destination = destinationRecord(manifest, destinationKey);
  const pending = [];
  const skipped = [];
  for (const batch of batches) {
    const id = batchManifestId(batch);
    const token = batchResumeToken(batch);
    const previous = destination.conversations[id];
    if (previous?.resumeToken === token) skipped.push(batch);
    else pending.push(batch);
  }
  return { pending, skipped };
}

export function markBatchImported(manifest, destinationKey, batch, importedAt = new Date()) {
  const destination = destinationRecord(manifest, destinationKey);
  const id = batchManifestId(batch);
  const timestamp = importedAt.toISOString();
  destination.conversations[id] = {
    resumeToken: batchResumeToken(batch),
    messageCount: Array.isArray(batch.messages) ? batch.messages.length : 0,
    importedAt: timestamp,
    sessionId: batch?.sourceFile?.sessionId ?? null,
  };
  destination.updatedAt = timestamp;
  manifest.updatedAt = timestamp;
  return manifest;
}

export async function saveManifest(path, manifest) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, absolute);
  return absolute;
}
