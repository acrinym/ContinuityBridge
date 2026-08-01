import test from "node:test";
import assert from "node:assert/strict";
import { resolveChatGptExport } from "../src/chatgpt/resolve-export.js";

test("finds conversations.json in an export directory", async () => {
  const handle = await resolveChatGptExport("test/fixtures/chatgpt-export");
  assert.match(handle.conversationPaths[0], /conversations\.json$/);
  await handle.cleanup();
});

test("accepts conversations.json directly", async () => {
  const handle = await resolveChatGptExport("test/fixtures/chatgpt-export/conversations.json");
  assert.match(handle.conversationPaths[0], /conversations\.json$/);
  await handle.cleanup();
});

test("discovers numbered conversation files in natural order", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const directory = await mkdtemp(join(tmpdir(), "continuity-bridge-numbered-"));
  try {
    await writeFile(join(directory, "conversations-010.json"), "[]");
    await writeFile(join(directory, "conversations-002.json"), "[]");
    const handle = await resolveChatGptExport(directory);
    assert.deepEqual(
      handle.conversationPaths.map((path) => path.match(/conversations-\d+\.json$/)[0]),
      ["conversations-002.json", "conversations-010.json"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
