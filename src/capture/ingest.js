import { resolve } from "node:path";
import {
  defaultManifestPath,
  loadManifest,
  loreDestinationKey,
  markBatchImported,
  saveManifest,
  selectPendingBatches,
} from "../incremental/manifest.js";
import { pushBatchToLore } from "../lore/push.js";
import { liveCaptureToLoreBatch } from "./normalize.js";

export async function ingestLiveCapture(payload, options = {}) {
  const batch = liveCaptureToLoreBatch(payload, options);
  if (options.dryRun) {
    return {
      status: "planned",
      batch,
      messageCount: batch.messages.length,
      sourceFileId: batch.sourceFile.sourceFileId,
    };
  }

  const manifestEnabled = options.manifestEnabled !== false;
  let manifest = null;
  let manifestPath = null;
  let destinationKey = null;
  if (manifestEnabled) {
    manifestPath = resolve(options.manifestPath ?? defaultManifestPath());
    manifest = await loadManifest(manifestPath);
    destinationKey = loreDestinationKey({
      source: batch.sourceFile.source,
      project: batch.messages[0]?.project ?? "",
    });
    const selection = selectPendingBatches([batch], manifest, destinationKey, {
      reimport: options.reimport === true,
    });
    if (selection.pending.length === 0) {
      return {
        status: "unchanged",
        sourceFileId: batch.sourceFile.sourceFileId,
        messageCount: batch.messages.length,
        manifestPath,
      };
    }
  }

  const push = options.pushBatch ?? pushBatchToLore;
  const pushResult = await push(batch, { command: options.loreCommand ?? "lore" });
  if (manifest && manifestPath && destinationKey) {
    markBatchImported(manifest, destinationKey, batch);
    await saveManifest(manifestPath, manifest);
  }
  return {
    status: "imported",
    sourceFileId: batch.sourceFile.sourceFileId,
    messageCount: batch.messages.length,
    manifestPath,
    pushResult,
  };
}
