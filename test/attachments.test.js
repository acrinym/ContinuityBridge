import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  bundleExportAttachments,
  inspectExportAttachments,
  planExportAttachments,
} from "../src/attachments/bundle.js";
import { parseAttachmentArgs } from "../src/attachments/cli.js";

const CHATGPT_FIXTURE = resolve("test/fixtures/chatgpt-export");
const CLAUDE_FIXTURE = resolve("test/fixtures/claude-export");

test("ChatGPT attachment inspection finds only local export artifacts without leaking provider pointers", async () => {
  const result = await inspectExportAttachments("chatgpt", CHATGPT_FIXTURE);
  assert.equal(result.schema, "continuity-bridge/attachment-inspection-v1");
  assert.equal(result.attachmentCount, 1);
  assert.equal(result.availableCount, 1);
  assert.equal(result.unavailableCount, 0);
  const attachment = result.attachments[0];
  assert.equal(attachment.name, "diagram.png");
  assert.equal(attachment.status, "available");
  assert.equal(attachment.sourceRelativePath, "diagram.png");
  assert.equal(attachment.provenance.conversationId, "conversation-alpha");
  assert.equal(attachment.provenance.messageId, "message-tool-1");
  assert.match(attachment.providerReferenceSha256, /^[a-f0-9]{64}$/);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /secret-pointer/);
  assert.doesNotMatch(serialized, /sourceAbsolutePath/);
});

test("Claude inspection distinguishes locally available and missing artifacts without exposing private URLs or IDs", async () => {
  const result = await inspectExportAttachments("claude", CLAUDE_FIXTURE);
  assert.equal(result.attachmentCount, 2);
  assert.equal(result.availableCount, 1);
  assert.equal(result.unavailableCount, 1);

  const architecture = result.attachments.find((item) => item.name === "architecture.md");
  const sample = result.attachments.find((item) => item.name === "sample.json");
  assert.equal(architecture.status, "available");
  assert.equal(architecture.sourceRelativePath, "architecture.md");
  assert.equal(sample.status, "missing");
  assert.match(sample.missingReason, /no matching local artifact/);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /private-file-id/);
  assert.doesNotMatch(serialized, /example\.invalid/);
  assert.doesNotMatch(serialized, /signed/);
});

test("explicit attachment plan validates IDs and does not copy artifacts", async () => {
  const inspected = await inspectExportAttachments("chatgpt", CHATGPT_FIXTURE);
  const id = inspected.attachments[0].id;
  const plan = await planExportAttachments("chatgpt", CHATGPT_FIXTURE, {
    attachmentIds: [id],
  });
  assert.equal(plan.selectedCount, 1);
  assert.equal(plan.attachments[0].status, "available-not-copied");
  assert.equal(plan.attachments[0].sha256, undefined);

  await assert.rejects(
    planExportAttachments("chatgpt", CHATGPT_FIXTURE, { attachmentIds: ["not-real"] }),
    /attachment IDs not found/,
  );
});

test("portable bundle copies selected artifacts, verifies hashes, and records unavailable references", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-attachments-"));
  try {
    const result = await bundleExportAttachments("claude", CLAUDE_FIXTURE, directory, { all: true });
    assert.equal(result.manifest.schema, "continuity-bridge/attachment-bundle-v1");
    assert.equal(result.manifest.selectedCount, 2);
    assert.equal(result.manifest.copiedCount, 1);
    assert.equal(result.manifest.unavailableCount, 1);

    const copied = result.manifest.attachments.find((item) => item.status === "copied");
    const missing = result.manifest.attachments.find((item) => item.status === "missing");
    assert.equal(copied.name, "architecture.md");
    assert.match(copied.relativePath, /^attachments\//);
    assert.match(copied.sha256, /^[a-f0-9]{64}$/);
    assert.equal(missing.name, "sample.json");
    assert.equal(missing.relativePath, null);
    assert.equal(missing.sha256, null);

    const copiedText = await readFile(join(directory, copied.relativePath), "utf8");
    const sourceText = await readFile(join(CLAUDE_FIXTURE, "architecture.md"), "utf8");
    assert.equal(copiedText, sourceText);

    const manifestText = await readFile(result.manifestPath, "utf8");
    assert.doesNotMatch(manifestText, /private-file-id/);
    assert.doesNotMatch(manifestText, /example\.invalid/);
    assert.doesNotMatch(manifestText, /sourceAbsolutePath/);
    assert.equal(dirname(result.manifestPath), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("attachment CLI requires explicit selection for bundle mutation", () => {
  assert.deepEqual(parseAttachmentArgs(["--help"]), { help: true });
  assert.throws(
    () => parseAttachmentArgs(["chatgpt", CHATGPT_FIXTURE, "--bundle", "bundle"]),
    /requires --attachment-id <id> or --all/,
  );
  assert.throws(
    () =>
      parseAttachmentArgs([
        "chatgpt",
        CHATGPT_FIXTURE,
        "--bundle",
        "bundle",
        "--all",
        "--attachment-id",
        "abc",
      ]),
    /not both/,
  );
  const parsed = parseAttachmentArgs([
    "claude",
    CLAUDE_FIXTURE,
    "--bundle",
    "bundle",
    "--all",
    "--json",
  ]);
  assert.equal(parsed.provider, "claude");
  assert.equal(parsed.all, true);
  assert.equal(parsed.json, true);
});
