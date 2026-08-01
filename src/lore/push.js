import { spawn } from "node:child_process";
import { assertLoreBatch } from "./records.js";

export function pushBatchToLore(batch, options = {}) {
  const command = options.command ?? "lore";
  assertLoreBatch(batch);

  return new Promise((resolvePush, rejectPush) => {
    const child = spawn(command, ["push"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      if (error.code === "ENOENT") {
        rejectPush(
          new Error(
            `Lore command not found: ${command}. Install Lore or pass --lore-command <path>.`,
          ),
        );
      } else {
        rejectPush(error);
      }
    });
    child.once("close", (code) => {
      if (code !== 0) {
        rejectPush(
          new Error(
            `lore push failed for ${batch.sourceFile.sessionId} (${code}): ${stderr.trim()}`,
          ),
        );
        return;
      }
      resolvePush({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.stdin.end(JSON.stringify(batch));
  });
}

export async function pushBatchesToLore(batches, options = {}) {
  let messages = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    await pushBatchToLore(batch, options);
    messages += batch.messages.length;
    if (!options.quiet) {
      process.stderr.write(
        `Imported ${index + 1}/${batches.length}: ${batch.sourceFile.sessionId} ` +
          `(${batch.messages.length} messages)\n`,
      );
    }
  }
  return { conversations: batches.length, messages };
}
