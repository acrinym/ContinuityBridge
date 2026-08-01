import test from "node:test";
import assert from "node:assert/strict";
import { resolveClaudeExport } from "../src/claude/resolve-export.js";

test("finds Claude conversations in an export directory", async () => {
  const handle = await resolveClaudeExport("test/fixtures/claude-export");
  assert.match(handle.conversationPaths[0], /conversations\.json$/);
  await handle.cleanup();
});

test("accepts a Claude conversations JSON file directly", async () => {
  const handle = await resolveClaudeExport("test/fixtures/claude-export/conversations.json");
  assert.match(handle.conversationPaths[0], /conversations\.json$/);
  await handle.cleanup();
});

test("prefers conversation files over unrelated JSON in the same export", async () => {
  const { mkdtemp, writeFile, cp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const directory = await mkdtemp(join(tmpdir(), "continuity-bridge-claude-resolve-"));
  try {
    await cp("test/fixtures/claude-export/conversations.json", join(directory, "conversations.json"));
    await writeFile(join(directory, "settings.json"), "not valid json");
    const handle = await resolveClaudeExport(directory);
    assert.equal(handle.conversationPaths.length, 1);
    assert.match(handle.conversationPaths[0], /conversations\.json$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
