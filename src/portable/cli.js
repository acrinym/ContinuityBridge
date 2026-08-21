import { createReadStream, readFile, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { encryptBundle, inspectBundle, restoreBundle, SCHEMA_VERSION } from "./encrypt.js";

const USAGE = `continuity-bridge portable — encrypted portable continuity bundles

Usage:
  continuity-bridge portable encrypt <handoff-or-bundle-path> --output <file> [--passphrase <pass>]
  continuity-bridge portable inspect <encrypted-file> [--json] [--passphrase <pass>]
  continuity-bridge portable restore <encrypted-file> --output <directory> [--overwrite] [--passphrase <pass>]

Options:
  --output <path>          Output path for encrypt (file) or restore (directory).
  --overwrite             Replace existing files during restore.
  --json                  Emit machine-readable JSON for inspect.
  --passphrase <pass>     Passphrase (NOT recommended; use stdin instead).

Encrypt options:
  Creates an encrypted portable bundle from a handoff file or attachment bundle directory.

Inspect options:
  Non-mutating preview of an encrypted bundle. Prompts for passphrase if not provided.
  Use --json for machine-readable output.

Restore options:
  Extracts an encrypted bundle to a directory. Prompts for passphrase if not provided.
  Refuses traversal attacks, absolute paths, and hash mismatches.

Examples:
  continuity-bridge portable encrypt ./my-handoff --output encrypted.cbb
  continuity-bridge portable inspect encrypted.cbb --json
  continuity-bridge portable restore encrypted.cbb --output ./restored --overwrite
`;

function promptPassphrase(promptText, confirm = false) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(promptText, (passphrase) => {
      rl.close();
      if (!passphrase || passphrase.trim() === "") {
        reject(new Error("passphrase cannot be empty"));
        return;
      }
      if (confirm) {
        const rl2 = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl2.question("Confirm passphrase: ", (confirmPassphrase) => {
          rl2.close();
          if (passphrase !== confirmPassphrase) {
            reject(new Error("passphrases do not match"));
            return;
          }
          resolve(passphrase);
        });
      } else {
        resolve(passphrase);
      }
    });
  });
}

function getPassphraseFromStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = createReadStream("/dev/stdin");
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      const input = Buffer.concat(chunks).toString("utf8").trim();
      if (!input) {
        reject(new Error("no passphrase provided on stdin"));
        return;
      }
      resolve(input);
    });
    stream.on("error", reject);
  });
}

async function getPassphrase(options, requireConfirm = false) {
  if (options.passphrase) {
    return options.passphrase;
  }
  if (!process.stdin.isTTY) {
    return getPassphraseFromStdin();
  }
  const action = requireConfirm ? "Enter encryption passphrase: " : "Enter passphrase: ";
  return promptPassphrase(action, requireConfirm);
}

export function parsePortableArgs(argv) {
  const parsed = {
    command: null,
    input: null,
    output: null,
    overwrite: false,
    json: false,
    passphrase: null,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg === "encrypt") {
      parsed.command = "encrypt";
    } else if (arg === "inspect") {
      parsed.command = "inspect";
    } else if (arg === "restore") {
      parsed.command = "restore";
    } else if (arg === "--output" && i + 1 < argv.length) {
      parsed.output = argv[i + 1];
      i += 1;
    } else if (arg === "--overwrite") {
      parsed.overwrite = true;
    } else if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--passphrase" && i + 1 < argv.length) {
      parsed.passphrase = argv[i + 1];
      i += 1;
    } else if (!arg.startsWith("--") && !parsed.input) {
      parsed.input = arg;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
    i += 1;
  }

  if (!parsed.command) {
    throw new Error("specify encrypt, inspect, or restore");
  }

  if (parsed.command === "encrypt" && !parsed.input) {
    throw new Error("encrypt requires a handoff or bundle path");
  }

  if (parsed.command === "encrypt" && !parsed.output) {
    throw new Error("encrypt requires --output");
  }

  if (parsed.command === "inspect" && !parsed.input) {
    throw new Error("inspect requires an encrypted file path");
  }

  if (parsed.command === "restore" && !parsed.input) {
    throw new Error("restore requires an encrypted file path");
  }

  if (parsed.command === "restore" && !parsed.output) {
    throw new Error("restore requires --output");
  }

  return parsed;
}

export async function runPortableCli(argv) {
  let args;
  try {
    args = parsePortableArgs(argv);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n\n${USAGE}`);
    return 1;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  try {
    if (args.command === "encrypt") {
      const passphrase = await getPassphrase(args, true);
      const result = await encryptBundle(args.input, args.output, passphrase);
      process.stdout.write(
        `Encrypted ${result.fileCount} file(s) to ${result.outputPath}.\n` +
          `Bundle schema: ${result.schema}\n` +
          `Handoff: ${result.handoffName}\n`,
      );
      return 0;
    }

    if (args.command === "inspect") {
      const passphrase = await getPassphrase(args, false);
      const result = await inspectBundle(args.input, passphrase);
      if (args.json) {
        process.stdout.write(
          JSON.stringify(
            {
              schema: result.schema,
              createdAt: result.createdAt,
              handoffName: result.handoffName,
              handoffPreview: result.handoffPreview,
              files: result.files,
              fileCount: result.fileCount,
            },
            null,
            2,
          ) + "\n",
        );
      } else {
        process.stdout.write(
          `Bundle: ${result.schema}\n` +
            `Created: ${result.createdAt}\n` +
            `Handoff: ${result.handoffName}\n` +
            `Files: ${result.fileCount}\n\n` +
            "Preview (non-mutating):\n" +
            (result.handoffPreview || "(no handoff)"),
        );
      }
      return 0;
    }

    if (args.command === "restore") {
      const passphrase = await getPassphrase(args, false);
      const result = await restoreBundle(args.input, args.output, passphrase, {
        overwrite: args.overwrite,
      });
      process.stdout.write(
        `Restored ${result.restoredCount} file(s) to ${args.output}.\n` +
          `Schema: ${result.schema}\n` +
          `Handoff: ${result.handoffName}\n`,
      );
      if (result.errors.length > 0) {
        process.stderr.write("\nWarnings/Errors:\n");
        for (const err of result.errors) {
          process.stderr.write(`  - ${err}\n`);
        }
      }
      return result.errors.length > 0 ? 1 : 0;
    }

    process.stderr.write(`unknown command: ${args.command}\n`);
    return 1;
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
