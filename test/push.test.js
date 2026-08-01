import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { conversationToLoreBatch, readChatGptConversations } from "../src/chatgpt/parse-export.js";
import { pushBatchToLore } from "../src/lore/push.js";

test("sends a validated batch to the Lore push command over stdin", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-bridge-lore-"));
  const executable = join(directory, "fake-lore");
  const captured = join(directory, "captured.json");
  const script = `#!/usr/bin/env node\nimport { writeFile } from "node:fs/promises";\nlet input = "";\nfor await (const chunk of process.stdin) input += chunk;\nif (process.argv[2] !== "push") process.exit(2);\nawait writeFile(${JSON.stringify(captured)}, input);\nprocess.stdout.write('{"ok":true}\\n');\n`;
  await writeFile(executable, script);
  await chmod(executable, 0o755);

  try {
    const [conversation] = await readChatGptConversations(
      "test/fixtures/chatgpt-export/conversations.json",
    );
    const batch = conversationToLoreBatch(conversation);
    const result = await pushBatchToLore(batch, { command: executable });
    assert.match(result.stdout, /"ok":true/);
    const written = JSON.parse(await readFile(captured, "utf8"));
    assert.equal(written.sourceFile.sessionId, "chatgpt:conversation-alpha");
    assert.equal(written.messages.length, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
