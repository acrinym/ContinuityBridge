import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { buildHandoff, renderHandoffMarkdown, writeHandoff } from "../src/handoff/build.js";
import { parseHandoffArgs, runHandoffCli } from "../src/handoff/cli.js";

const CHATGPT_FIXTURE = resolve("test/fixtures/chatgpt-export");

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "continuity-handoff-"));
  const repo = join(directory, "repo");
  const lore = join(directory, "fake-lore");
  const calls = join(directory, "calls.log");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(repo));
  git(repo, "init");
  git(repo, "config", "user.email", "test@example.invalid");
  git(repo, "config", "user.name", "Continuity Test");
  await writeFile(join(repo, "README.md"), "synthetic repo\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-m", "Synthetic commit");
  git(repo, "remote", "add", "origin", "https://secret-token@github.com/example/synthetic.git");

  const script = `#!/usr/bin/env node\nimport { appendFile } from "node:fs/promises";\nconst args = process.argv.slice(2);\nawait appendFile(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n");\nif (args[0] === "search") {\n  process.stdout.write(JSON.stringify({count:1,hits:[{messageId:"m-search",sessionId:"s-1",source:"chatgpt",project:"synthetic",score:12.5,text:"matched evidence"}]}) + "\\n");\n} else if (args[0] === "get") {\n  process.stdout.write(JSON.stringify({message:{messageId:args[1],sessionId:"s-1",source:"chatgpt",project:"synthetic",role:"assistant",timestamp:"2026-08-11T12:00:00Z",model:"synthetic-model",text:"Anchor evidence text"}}) + "\\n");\n} else if (args[0] === "context") {\n  process.stdout.write(JSON.stringify({messages:[\n    {messageId:"m-before",sessionId:"s-1",source:"chatgpt",project:"synthetic",role:"user",timestamp:"2026-08-11T11:59:00Z",text:"Before"},\n    {messageId:args[1],sessionId:"s-1",source:"chatgpt",project:"synthetic",role:"assistant",timestamp:"2026-08-11T12:00:00Z",text:"Anchor evidence text"},\n    {messageId:"m-after",sessionId:"s-1",source:"chatgpt",project:"synthetic",role:"user",timestamp:"2026-08-11T12:01:00Z",text:"After"}\n  ]}) + "\\n");\n} else { process.exit(2); }\n`;
  await writeFile(lore, script);
  await chmod(lore, 0o755);
  return { directory, repo, lore, calls };
}

async function capture(stream, callback) {
  const original = stream.write;
  let text = "";
  stream.write = (chunk) => {
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

test("search-derived handoff spends the exact Lore message ID and scrubs remote credentials", async () => {
  const data = await fixture();
  try {
    const handoff = await buildHandoff({
      task: "Continue the synthetic product train",
      query: "synthetic evidence",
      loreCommand: data.lore,
      repositoryPath: data.repo,
    });
    assert.equal(handoff.schema, "continuity-bridge/handoff-v3");
    assert.equal(handoff.lore.evidence.length, 1);
    assert.equal(handoff.lore.evidence[0].anchor.messageId, "m-search");
    assert.equal(handoff.repository.dirty, false);
    assert.match(handoff.repository.remote, /github\.com\/example\/synthetic\.git/);
    assert.doesNotMatch(handoff.repository.remote, /secret-token/);

    const calls = (await readFile(data.calls, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(calls[0].slice(0, 2), ["search", "synthetic evidence"]);
    assert.ok(calls.some((args) => args[0] === "get" && args[1] === "m-search"));
    assert.ok(calls.some((args) => args[0] === "context" && args[1] === "m-search"));
  } finally {
    await rm(data.directory, { recursive: true, force: true });
  }
});

test("Markdown handoff contains bounded evidence and repository coordinates", async () => {
  const data = await fixture();
  try {
    const handoff = await buildHandoff({
      task: "Continue work",
      messageIds: ["m-explicit"],
      loreCommand: data.lore,
      repositoryPath: data.repo,
      contextMessages: 3,
    });
    const markdown = renderHandoffMarkdown(handoff);
    assert.match(markdown, /# ContinuityBridge Handoff/);
    assert.match(markdown, /Continue work/);
    assert.match(markdown, /m-explicit/);
    assert.match(markdown, /Anchor evidence text/);
    assert.match(markdown, /Working tree: \*\*clean\*\*/);
    assert.doesNotMatch(markdown, /secret-token/);

    const output = join(data.directory, "handoff.json");
    await writeHandoff(output, handoff, "json");
    const written = JSON.parse(await readFile(output, "utf8"));
    assert.equal(written.task, "Continue work");
    assert.equal(written.attachments, null);
  } finally {
    await rm(data.directory, { recursive: true, force: true });
  }
});

test("handoff CLI validates evidence, formats, and explicit attachment selection", () => {
  assert.throws(
    () => parseHandoffArgs(["--task", "Missing evidence"]),
    /provide --query or at least one --message-id/,
  );
  assert.equal(
    parseHandoffArgs(["--task", "Continue", "--message-id", "m1", "--format", "md"]).format,
    "md",
  );
  assert.throws(
    () => parseHandoffArgs(["--task", "Continue", "--message-id", "m1", "--format", "text"]),
    /--format must be markdown, md, or json/,
  );
  assert.throws(
    () =>
      parseHandoffArgs([
        "--task",
        "Continue",
        "--message-id",
        "m1",
        "--attachment-provider",
        "chatgpt",
      ]),
    /requires both --attachment-provider and --attachment-export/,
  );
  assert.throws(
    () =>
      parseHandoffArgs([
        "--task",
        "Continue",
        "--message-id",
        "m1",
        "--attachment-provider",
        "chatgpt",
        "--attachment-export",
        CHATGPT_FIXTURE,
      ]),
    /select attachments with --attachment-id or --all-attachments/,
  );
});

test("handoff CLI can write a portable evidence file", async () => {
  const data = await fixture();
  try {
    const output = join(data.directory, "HANDOFF.md");
    const captured = await capture(process.stdout, () =>
      runHandoffCli([
        "--task",
        "Continue from evidence",
        "--query",
        "synthetic evidence",
        "--repo",
        data.repo,
        "--lore-command",
        data.lore,
        "--output",
        output,
      ]),
    );
    assert.equal(captured.result, 0);
    assert.match(captured.text, /Wrote ContinuityBridge handoff/);
    const markdown = await readFile(output, "utf8");
    assert.match(markdown, /Continue from evidence/);
  } finally {
    await rm(data.directory, { recursive: true, force: true });
  }
});

test("handoff attachment bundle carries copied artifacts by relative path with hashes and no provider pointer", async () => {
  const data = await fixture();
  try {
    const bundle = join(data.directory, "portable-bundle");
    const captured = await capture(process.stdout, () =>
      runHandoffCli([
        "--task",
        "Continue with the synthetic diagram",
        "--message-id",
        "m-explicit",
        "--no-repo",
        "--lore-command",
        data.lore,
        "--attachment-provider",
        "chatgpt",
        "--attachment-export",
        CHATGPT_FIXTURE,
        "--all-attachments",
        "--attachment-bundle",
        bundle,
      ]),
    );
    assert.equal(captured.result, 0);
    assert.match(captured.text, /Attachment bundle:/);

    const handoffPath = join(bundle, "HANDOFF.md");
    const markdown = await readFile(handoffPath, "utf8");
    assert.match(markdown, /## Attachments/);
    assert.match(markdown, /Mode: \*\*portable-bundle\*\*/);
    assert.match(markdown, /Bundle manifest: `attachments\.json`/);
    assert.match(markdown, /Bundle path: `attachments\//);
    assert.match(markdown, /SHA-256: `[a-f0-9]{64}`/);
    assert.doesNotMatch(markdown, /secret-pointer/);
    assert.doesNotMatch(markdown, /sourceAbsolutePath/);

    const manifest = JSON.parse(await readFile(join(bundle, "attachments.json"), "utf8"));
    assert.equal(manifest.copiedCount, 1);
    assert.equal(manifest.attachments[0].status, "copied");
    const artifact = await readFile(join(bundle, manifest.attachments[0].relativePath), "utf8");
    assert.match(artifact, /Synthetic ContinuityBridge diagram attachment fixture/);
  } finally {
    await rm(data.directory, { recursive: true, force: true });
  }
});
