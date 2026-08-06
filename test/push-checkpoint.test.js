import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readChatGptConversations, toLoreBatches } from "../src/chatgpt/parse-export.js";
import { pushBatchesToLore } from "../src/lore/push.js";

test("checkpoint callback runs only after each confirmed Lore push", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-checkpoint-"));
  const executable = join(directory, "fake-lore");
  const counter = join(directory, "counter.txt");
  const script = `#!/usr/bin/env node\nimport { readFile, writeFile } from "node:fs/promises";\nlet input = "";\nfor await (const chunk of process.stdin) input += chunk;\nif (process.argv[2] !== "push") process.exit(2);\nlet count = 0;\ntry { count = Number(await readFile(${JSON.stringify(counter)}, "utf8")); } catch {}\ncount += 1;\nawait writeFile(${JSON.stringify(counter)}, String(count));\nif (count === 2) { process.stderr.write("simulated second push failure\\n"); process.exit(9); }\nprocess.stdout.write('{"ok":true}\\n');\n`;
  await writeFile(executable, script);
  await chmod(executable, 0o755);

  try {
    const conversations = await readChatGptConversations(
      "test/fixtures/chatgpt-export/conversations.json",
    );
    const batches = toLoreBatches(conversations);
    const checkpointed = [];

    await assert.rejects(
      () =>
        pushBatchesToLore(batches, {
          command: executable,
          quiet: true,
          onBatchImported: async (batch) => {
            checkpointed.push(batch.sourceFile.sourceFileId);
          },
        }),
      /simulated second push failure/,
    );

    assert.deepEqual(checkpointed, [batches[0].sourceFile.sourceFileId]);
    assert.equal(await readFile(counter, "utf8"), "2");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
