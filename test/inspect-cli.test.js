import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(args) {
  return spawnSync(process.execPath, ["bin/continuity-bridge.js", ...args], {
    encoding: "utf8",
  });
}

test("inspect-chatgpt emits machine-readable summaries", () => {
  const result = run(["inspect-chatgpt", "test/fixtures/chatgpt-export", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.provider, "chatgpt");
  assert.equal(payload.conversationCount, 2);
  assert.equal(payload.conversations[0].provider, "chatgpt");
});

test("inspect-claude emits searchable previews", () => {
  const result = run(["inspect-claude", "test/fixtures/claude-export", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.provider, "claude");
  assert.equal(payload.conversationCount, 2);
  assert.match(payload.conversations[0].preview, /desktop importer/i);
});

test("conversation selection imports only requested IDs", () => {
  const result = run([
    "import-claude",
    "test/fixtures/claude-export",
    "--conversation-id",
    "claude-conversation-beta",
    "--dry-run",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Parsed 1 Claude conversations and 1 messages/);
});
