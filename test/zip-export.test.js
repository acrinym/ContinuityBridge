import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChatGptExport } from "../src/chatgpt/resolve-export.js";

test("extracts an original-style ZIP export", async (context) => {
  const probe = spawnSync("zip", ["-v"], { stdio: "ignore" });
  if (probe.error?.code === "ENOENT") {
    context.skip("zip executable is unavailable");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "continuity-bridge-zip-test-"));
  const payload = join(directory, "payload");
  const archive = join(directory, "export.zip");
  await cp("test/fixtures/chatgpt-export", payload, { recursive: true });
  const zipped = spawnSync("zip", ["-qr", archive, "payload"], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(zipped.status, 0, zipped.stderr);

  let handle;
  try {
    handle = await resolveChatGptExport(archive);
    assert.match(handle.conversationPaths[0], /conversations\.json$/);
  } finally {
    await handle?.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
});
