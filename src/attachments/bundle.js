import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { resolveChatGptExport } from "../chatgpt/resolve-export.js";
import { readChatGptConversations } from "../chatgpt/parse-export.js";
import { resolveClaudeExport } from "../claude/resolve-export.js";
import { readClaudeConversations } from "../claude/parse-export.js";
import { discoverAttachments, publicAttachmentRecord } from "./discover.js";

const PROVIDERS = {
  chatgpt: {
    label: "ChatGPT",
    resolve: resolveChatGptExport,
    read: readChatGptConversations,
  },
  claude: {
    label: "Claude",
    resolve: resolveClaudeExport,
    read: readClaudeConversations,
  },
};

function providerAdapter(provider) {
  const adapter = PROVIDERS[provider];
  if (!adapter) throw new Error(`attachment provider must be chatgpt or claude (received ${provider})`);
  return adapter;
}

function safeFileName(name) {
  const cleaned = String(name ?? "attachment")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 140);
  return cleaned || "attachment";
}

async function hashFile(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function selectAttachments(attachments, options = {}) {
  const requestedIds = [...new Set(options.attachmentIds ?? [])];
  if (options.all === true && requestedIds.length > 0) {
    throw new Error("choose explicit --attachment-id values or --all, not both");
  }
  if (options.all !== true && requestedIds.length === 0) {
    throw new Error("select at least one attachment ID or use --all");
  }
  if (options.all === true) return attachments;

  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  const missingIds = requestedIds.filter((id) => !byId.has(id));
  if (missingIds.length > 0) {
    throw new Error(`attachment IDs not found in selected export: ${missingIds.join(", ")}`);
  }
  return requestedIds.map((id) => byId.get(id));
}

async function withExport(provider, input, callback) {
  const adapter = providerAdapter(provider);
  const handle = await adapter.resolve(input);
  try {
    const conversations = await adapter.read(handle.conversationPaths);
    const attachments = await discoverAttachments({
      provider,
      conversations,
      rootDirectory: handle.rootDirectory,
      conversationPaths: handle.conversationPaths,
    });
    return await callback({ adapter, handle, attachments });
  } finally {
    await handle.cleanup();
  }
}

export async function inspectExportAttachments(provider, input) {
  return withExport(provider, input, async ({ adapter, handle, attachments }) => ({
    schema: "continuity-bridge/attachment-inspection-v1",
    provider,
    providerLabel: adapter.label,
    source: {
      kind: handle.inputKind,
      name: handle.sourceDisplayName,
    },
    attachmentCount: attachments.length,
    availableCount: attachments.filter((item) => item.status === "available").length,
    unavailableCount: attachments.filter((item) => item.status !== "available").length,
    attachments: attachments.map(publicAttachmentRecord),
  }));
}

export async function planExportAttachments(provider, input, options = {}) {
  return withExport(provider, input, async ({ adapter, handle, attachments }) => {
    const selected = selectAttachments(attachments, options);
    return {
      schema: "continuity-bridge/attachment-plan-v1",
      provider,
      providerLabel: adapter.label,
      source: {
        kind: handle.inputKind,
        name: handle.sourceDisplayName,
      },
      selectedCount: selected.length,
      attachments: selected.map((item) => ({
        ...publicAttachmentRecord(item),
        status: item.status === "available" ? "available-not-copied" : item.status,
      })),
    };
  });
}

async function copySelectedArtifact(attachment, attachmentsDirectory, options) {
  const safeName = safeFileName(attachment.name);
  const relativePath = `attachments/${attachment.id}-${safeName}`;
  const destination = join(attachmentsDirectory, `${attachment.id}-${safeName}`);
  const sourceHash = await hashFile(attachment.sourceAbsolutePath);
  const existing = await stat(destination).catch(() => null);

  if (existing) {
    const existingHash = await hashFile(destination);
    if (existingHash !== sourceHash) {
      if (options.overwrite !== true) {
        throw new Error(
          `bundle artifact already exists with different content: ${relativePath}; use --overwrite to replace it`,
        );
      }
      await copyFile(attachment.sourceAbsolutePath, destination);
    }
  } else {
    await copyFile(attachment.sourceAbsolutePath, destination);
  }

  const destinationHash = await hashFile(destination);
  if (destinationHash !== sourceHash) {
    await rm(destination, { force: true });
    throw new Error(`copied attachment failed SHA-256 verification: ${attachment.name}`);
  }
  const info = await stat(destination);
  return {
    ...publicAttachmentRecord(attachment),
    status: "copied",
    relativePath,
    sha256: destinationHash,
    size: info.size,
    missingReason: null,
  };
}

async function writeManifest(path, manifest) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

export async function bundleExportAttachments(provider, input, bundleDirectory, options = {}) {
  const absoluteBundle = resolve(bundleDirectory);
  return withExport(provider, input, async ({ adapter, handle, attachments }) => {
    const selected = selectAttachments(attachments, options);
    const attachmentsDirectory = join(absoluteBundle, "attachments");
    await mkdir(attachmentsDirectory, { recursive: true });

    const bundled = [];
    for (const attachment of selected) {
      if (attachment.status === "available" && attachment.sourceAbsolutePath) {
        bundled.push(await copySelectedArtifact(attachment, attachmentsDirectory, options));
      } else {
        bundled.push({
          ...publicAttachmentRecord(attachment),
          relativePath: null,
          sha256: null,
        });
      }
    }

    const manifest = {
      schema: "continuity-bridge/attachment-bundle-v1",
      createdAt: new Date().toISOString(),
      provider,
      providerLabel: adapter.label,
      source: {
        kind: handle.inputKind,
        name: handle.sourceDisplayName,
      },
      selectedCount: bundled.length,
      copiedCount: bundled.filter((item) => item.status === "copied").length,
      unavailableCount: bundled.filter((item) => item.status !== "copied").length,
      attachments: bundled,
    };
    const manifestPath = join(absoluteBundle, "attachments.json");
    await writeManifest(manifestPath, manifest);
    return { bundleDirectory: absoluteBundle, manifestPath, manifest };
  });
}

export async function readAttachmentBundleManifest(path) {
  const absolute = resolve(path);
  const parsed = JSON.parse(await readFile(absolute, "utf8"));
  if (parsed?.schema !== "continuity-bridge/attachment-bundle-v1" || !Array.isArray(parsed.attachments)) {
    throw new Error(`unsupported ContinuityBridge attachment manifest: ${basename(absolute)}`);
  }
  return parsed;
}
