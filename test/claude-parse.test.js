import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  claudeConversationToLoreBatch,
  readClaudeConversations,
  summarizeClaudeConversations,
  toClaudeLoreBatches,
} from "../src/claude/parse-export.js";
import { assertLoreBatch } from "../src/lore/records.js";

const fixture = resolve("test/fixtures/claude-export/conversations.json");

test("reads Claude exports and emits one Lore batch per conversation", async () => {
  const conversations = await readClaudeConversations(fixture);
  const batches = toClaudeLoreBatches(conversations);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].sourceFile.source, "claude");
  assert.equal(batches[0].sourceFile.sessionId, "claude:claude-conversation-alpha");
  assert.equal(batches[0].messages.length, 3);
  assertLoreBatch(batches[0]);
});

test("maps Claude senders and linear parent relationships", async () => {
  const [conversation] = await readClaudeConversations(fixture);
  const batch = claudeConversationToLoreBatch(conversation);
  assert.deepEqual(
    batch.messages.map((message) => message.role),
    ["user", "assistant", "user"],
  );
  assert.equal(batch.messages[0].parentUuid, null);
  assert.equal(batch.messages[1].parentUuid, "claude-human-1");
  assert.equal(batch.messages[2].parentUuid, "claude-assistant-1");
});

test("redacts secrets and suppresses signed attachment pointers", async () => {
  const [conversation] = await readClaudeConversations(fixture);
  const batch = claudeConversationToLoreBatch(conversation);
  assert.match(batch.messages[0].text, /password=\[REDACTED\]/);
  assert.match(batch.messages[1].text, /architecture\.md/);
  assert.doesNotMatch(batch.messages[1].text, /private-file-id/);
  assert.match(batch.messages[2].text, /sample\.json/);
  assert.doesNotMatch(batch.messages[2].text, /example\.invalid/);
});

test("summarizes Claude conversations for the desktop viewer", async () => {
  const conversations = await readClaudeConversations(fixture);
  const summaries = summarizeClaudeConversations(conversations);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].title, "Desktop bridge planning");
  assert.equal(summaries[0].messageCount, 3);
  assert.match(summaries[0].preview, /provider adapter/);
});
