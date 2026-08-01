import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  conversationToLoreBatch,
  readChatGptConversations,
  toLoreBatches,
} from "../src/chatgpt/parse-export.js";
import { assertLoreBatch, computeMessageId } from "../src/lore/records.js";

const fixture = resolve("test/fixtures/chatgpt-export/conversations.json");

test("reads a ChatGPT export and emits one Lore batch per conversation", async () => {
  const conversations = await readChatGptConversations(fixture);
  const batches = toLoreBatches(conversations);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].sourceFile.source, "chatgpt");
  assert.equal(batches[0].sourceFile.sessionId, "chatgpt:conversation-alpha");
  assert.equal(batches[0].messages.length, 4);
  assertLoreBatch(batches[0]);
});

test("preserves branch relationships and deterministic traversal", async () => {
  const [conversation] = await readChatGptConversations(fixture);
  const first = conversationToLoreBatch(conversation);
  const second = conversationToLoreBatch(conversation);
  assert.deepEqual(
    first.messages.map((message) => message.uuid),
    ["message-user-1", "message-assistant-1", "message-tool-1", "message-assistant-branch"],
  );
  assert.equal(first.messages[0].parentUuid, null);
  assert.equal(first.messages[1].parentUuid, "message-user-1");
  assert.deepEqual(
    first.messages.map((message) => message.messageId),
    second.messages.map((message) => message.messageId),
  );
});

test("matches Lore's stable synthetic message ID algorithm", () => {
  assert.equal(
    computeMessageId("chatgpt:one", "message-one", 7),
    "56d06edbb40cb52321fc92fb42dc2f9cddbe6dae8cb376b23feb33bc725c08d8",
  );
});

test("maps nonstandard roles safely and does not leak attachment pointers", async () => {
  const [conversation] = await readChatGptConversations(fixture);
  const batch = conversationToLoreBatch(conversation);
  const toolMessage = batch.messages.find((message) => message.uuid === "message-tool-1");
  assert.equal(toolMessage.role, "system");
  assert.match(toolMessage.text, /^\[tool\]/);
  assert.match(toolMessage.text, /diagram\.png/);
  assert.doesNotMatch(toolMessage.text, /secret-pointer/);
});

test("redacts credential-like strings by default and supports explicit opt-out", async () => {
  const conversations = await readChatGptConversations(fixture);
  const secret = conversations[1];
  const safe = conversationToLoreBatch(secret);
  const verbatim = conversationToLoreBatch(secret, { redact: false });
  assert.match(safe.messages[0].text, /REDACTED OPENAI KEY/);
  assert.match(safe.messages[0].text, /password=\[REDACTED\]/);
  assert.match(verbatim.messages[0].text, /sk-proj-/);
});

test("merges numbered exports and keeps the newest duplicate conversation", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const directory = await mkdtemp(join(tmpdir(), "continuity-bridge-merge-"));
  const older = {
    id: "duplicate",
    title: "Old title",
    update_time: 10,
    mapping: {},
  };
  const newer = {
    id: "duplicate",
    title: "New title",
    update_time: 20,
    mapping: {},
  };
  try {
    const first = join(directory, "conversations-000.json");
    const second = join(directory, "conversations-001.json");
    await writeFile(first, JSON.stringify([older]));
    await writeFile(second, JSON.stringify([newer]));
    const conversations = await readChatGptConversations([first, second]);
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].title, "New title");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
