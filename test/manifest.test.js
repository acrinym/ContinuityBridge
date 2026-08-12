import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  emptyManifest,
  loadManifest,
  loreDestinationKey,
  markBatchImported,
  saveManifest,
  selectPendingBatches,
} from "../src/incremental/manifest.js";

function batch(id, token, messageCount = 1) {
  return {
    sourceFile: {
      sourceFileId: id,
      sessionId: id,
      resumeToken: token,
    },
    messages: Array.from({ length: messageCount }, (_, index) => ({ index })),
  };
}

test("missing manifests start empty and round-trip atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-manifest-"));
  const path = join(directory, "state", "manifest.json");
  try {
    const manifest = await loadManifest(path);
    assert.deepEqual(manifest, emptyManifest());

    const destination = loreDestinationKey({ source: "chatgpt", project: "demo" });
    markBatchImported(manifest, destination, batch("chatgpt:alpha", "token-a", 4));
    const written = await saveManifest(path, manifest);
    assert.equal(written, path);

    const loaded = await loadManifest(path);
    assert.equal(
      loaded.destinations[destination].conversations["chatgpt:alpha"].resumeToken,
      "token-a",
    );
    assert.equal(
      loaded.destinations[destination].conversations["chatgpt:alpha"].messageCount,
      4,
    );
    assert.match(await readFile(path, "utf8"), /"version": 1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("unchanged conversations skip while changed and new conversations remain pending", () => {
  const manifest = emptyManifest();
  const destination = loreDestinationKey({ source: "chatgpt", project: "demo" });
  markBatchImported(manifest, destination, batch("chatgpt:alpha", "token-a"));

  const selection = selectPendingBatches(
    [
      batch("chatgpt:alpha", "token-a"),
      batch("chatgpt:beta", "token-b"),
      batch("chatgpt:alpha", "token-a-updated"),
    ],
    manifest,
    destination,
  );

  assert.deepEqual(selection.skipped.map((item) => item.sourceFile.sourceFileId), ["chatgpt:alpha"]);
  assert.deepEqual(selection.pending.map((item) => item.sourceFile.resumeToken), [
    "token-b",
    "token-a-updated",
  ]);
});

test("checkpoints remain isolated by Lore destination", () => {
  const manifest = emptyManifest();
  const first = loreDestinationKey({ source: "chatgpt", project: "first" });
  const second = loreDestinationKey({ source: "chatgpt", project: "second" });
  const conversation = batch("chatgpt:alpha", "same-token");
  markBatchImported(manifest, first, conversation);

  assert.equal(selectPendingBatches([conversation], manifest, first).skipped.length, 1);
  assert.equal(selectPendingBatches([conversation], manifest, second).pending.length, 1);
});

test("reimport bypasses matching checkpoints", () => {
  const manifest = emptyManifest();
  const destination = loreDestinationKey({ source: "claude", project: "" });
  const conversation = batch("claude:alpha", "token-a");
  markBatchImported(manifest, destination, conversation);

  const selection = selectPendingBatches([conversation], manifest, destination, {
    reimport: true,
  });
  assert.equal(selection.pending.length, 1);
  assert.equal(selection.skipped.length, 0);
});

test("malformed and unsupported manifests fail closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-manifest-invalid-"));
  const path = join(directory, "manifest.json");
  try {
    await writeFile(path, "not-json", "utf8");
    await assert.rejects(() => loadManifest(path), /invalid incremental manifest JSON/);

    await writeFile(path, JSON.stringify({ version: 99, destinations: {} }), "utf8");
    await assert.rejects(() => loadManifest(path), /unsupported incremental manifest version/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
