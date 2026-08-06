import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

async function lineCount(path) {
  try {
    const text = await readFile(path, "utf8");
    return text.trim() ? text.trim().split("\n").length : 0;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

test("repeated Lore imports skip unchanged conversations and reimport overrides", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-incremental-cli-"));
  const executable = join(directory, "fake-lore");
  const captured = join(directory, "captured.jsonl");
  const manifest = join(directory, "manifest.json");
  const script = `#!/usr/bin/env node\nimport { appendFile } from "node:fs/promises";\nlet input = "";\nfor await (const chunk of process.stdin) input += chunk;\nif (process.argv[2] !== "push") process.exit(2);\nawait appendFile(${JSON.stringify(captured)}, input + "\\n");\nprocess.stdout.write('{"ok":true}\\n');\n`;
  await writeFile(executable, script);
  await chmod(executable, 0o755);

  const args = [
    "import-chatgpt",
    "test/fixtures/chatgpt-export/conversations.json",
    "--to-lore",
    "--lore-command",
    executable,
    "--manifest",
    manifest,
    "--quiet",
  ];

  try {
    const first = await capture(process.stdout, () => runCli(args));
    assert.equal(first.result, 0);
    assert.match(first.text, /Incremental Lore plan: 2 pending, 0 unchanged/);
    assert.equal(await lineCount(captured), 2);

    const second = await capture(process.stdout, () => runCli(args));
    assert.equal(second.result, 0);
    assert.match(second.text, /Incremental Lore plan: 0 pending, 2 unchanged/);
    assert.match(second.text, /Lore import already current/);
    assert.equal(await lineCount(captured), 2);

    const forced = await capture(process.stdout, () => runCli([...args, "--reimport"]));
    assert.equal(forced.result, 0);
    assert.match(forced.text, /Incremental Lore plan: 2 pending, 0 unchanged/);
    assert.equal(await lineCount(captured), 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("output-only imports remain complete snapshots and do not create manifests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-output-snapshot-"));
  const output = join(directory, "records.jsonl");
  const manifest = join(directory, "manifest.json");
  try {
    const result = await capture(process.stdout, () =>
      runCli([
        "import-chatgpt",
        "test/fixtures/chatgpt-export/conversations.json",
        "--output",
        output,
      ]),
    );
    assert.equal(result.result, 0);
    assert.match(result.text, /complete normalized Lore snapshot/);
    assert.equal(await lineCount(output), 2);
    await assert.rejects(() => readFile(manifest, "utf8"), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("dry-run plans incremental work without writing checkpoints", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-dry-plan-"));
  const manifest = join(directory, "manifest.json");
  try {
    const result = await capture(process.stdout, () =>
      runCli([
        "import-claude",
        "test/fixtures/claude-export/conversations.json",
        "--to-lore",
        "--manifest",
        manifest,
        "--dry-run",
      ]),
    );
    assert.equal(result.result, 0);
    assert.match(result.text, /Incremental Lore plan:/);
    assert.match(result.text, /no records or manifest checkpoints were written/);
    await assert.rejects(() => readFile(manifest, "utf8"), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
