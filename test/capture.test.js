import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { parseCaptureArgs } from "../src/capture/cli.js";
import { ingestLiveCapture } from "../src/capture/ingest.js";
import { inspectLiveCapture, liveCaptureToLoreBatch } from "../src/capture/normalize.js";
import { createCaptureServer, listenCaptureServer } from "../src/capture/server.js";

const FIXTURE = resolve("test/fixtures/live-capture/sample.json");

async function payload() {
  return JSON.parse(await readFile(FIXTURE, "utf8"));
}

test("live capture normalizes stable Lore records and strips secrets from evidence metadata", async () => {
  const input = await payload();
  const summary = inspectLiveCapture(input);
  assert.equal(summary.source, "chatgpt");
  assert.equal(summary.messageCount, 2);
  assert.equal(summary.sourceUrl, "https://chatgpt.com/c/synthetic-live-conversation");
  assert.doesNotMatch(summary.sourceUrl, /password|token|fragment/);

  const first = liveCaptureToLoreBatch(input);
  const second = liveCaptureToLoreBatch(input);
  assert.equal(first.sourceFile.sourceFileId, "live:chatgpt-live:synthetic-live-conversation");
  assert.equal(first.messages[0].messageId, second.messages[0].messageId);
  assert.equal(first.messages[1].messageId, second.messages[1].messageId);
  assert.match(first.messages[1].text, /\[REDACTED OPENAI KEY\]/);
  assert.doesNotMatch(first.messages[1].text, /sk-abcdefghijklmnopqrstuvwxyz/);
  assert.equal(first.sourceFile.path, "live-capture://chatgpt/synthetic-live-conversation");
});

test("live capture uses the shared incremental checkpoint and skips unchanged submissions", async () => {
  const input = await payload();
  const directory = await mkdtemp(join(tmpdir(), "continuity-capture-"));
  const manifestPath = join(directory, "manifest.json");
  const pushed = [];
  const pushBatch = async (batch) => {
    pushed.push(batch.sourceFile.resumeToken.value);
    return { stdout: "ok", stderr: "" };
  };
  try {
    const first = await ingestLiveCapture(input, { manifestPath, pushBatch });
    const second = await ingestLiveCapture(input, { manifestPath, pushBatch });
    assert.equal(first.status, "imported");
    assert.equal(second.status, "unchanged");
    assert.equal(pushed.length, 1);

    input.conversation.messages.push({ id: "user-2", role: "user", text: "One more live message." });
    const third = await ingestLiveCapture(input, { manifestPath, pushBatch });
    assert.equal(third.status, "imported");
    assert.equal(third.messageCount, 3);
    assert.equal(pushed.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("loopback capture receiver requires bearer authorization before ingestion", async () => {
  const input = await payload();
  const received = [];
  const server = createCaptureServer({
    token: "synthetic-local-token",
    ingest: async (capture) => {
      received.push(capture.conversation.id);
      return { status: "imported", sourceFileId: "live:test:one", messageCount: 2 };
    },
  });
  const port = await listenCaptureServer(server, 0);
  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(received.length, 0);

    const authorized = await fetch(`http://127.0.0.1:${port}/capture`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer synthetic-local-token",
      },
      body: JSON.stringify(input),
    });
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).status, "imported");
    assert.deepEqual(received, ["synthetic-live-conversation"]);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("capture CLI makes mutation and receiver scope explicit", () => {
  assert.throws(
    () => parseCaptureArgs(["submit", FIXTURE]),
    /requires --to-lore/,
  );
  assert.throws(
    () => parseCaptureArgs(["serve"]),
    /requires --to-lore/,
  );
  assert.equal(
    parseCaptureArgs(["submit", FIXTURE, "--to-lore", "--project", "live-project"]).project,
    "live-project",
  );
  assert.throws(
    () => parseCaptureArgs(["inspect", FIXTURE, "--to-lore"]),
    /does not accept mutation options/,
  );
});
