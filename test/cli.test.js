import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCli } from "../src/cli.js";

async function capture(stream, callback) {
  const original = stream.write;
  let text = "";
  stream.write = (chunk, ...args) => {
    text += String(chunk);
    return true;
  };
  try {
    const result = await callback();
    return { result, text };
  } finally {
    stream.write = original;
  }
}

test("CLI dry-run parses without writing", async () => {
  const captured = await capture(process.stdout, () =>
    runCli(["import-chatgpt", "test/fixtures/chatgpt-export", "--dry-run"]),
  );
  assert.equal(captured.result, 0);
  assert.match(captured.text, /Parsed 2 ChatGPT conversations and 5 messages/);
  assert.match(captured.text, /Dry run complete/);
});

test("CLI writes portable JSONL Lore batches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-bridge-test-"));
  const output = join(directory, "records.jsonl");
  try {
    const captured = await capture(process.stdout, () =>
      runCli([
        "import-chatgpt",
        "test/fixtures/chatgpt-export/conversations.json",
        "--output",
        output,
      ]),
    );
    assert.equal(captured.result, 0);
    const lines = (await readFile(output, "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).sourceFile.source, "chatgpt");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
