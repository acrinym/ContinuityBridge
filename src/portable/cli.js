import { createReadStream, readFile, readFileSync } from "node:fs";
import { createInterface, emitKeypressEvents } from "node:readline";
import { encryptBundle, inspectBundle, restoreBundle, SCHEMA_VERSION } from "./encrypt.js";

// Helper to restore raw mode safely
function restoreRawMode(originalRawMode) {
  try {
    process.stdin.setRawMode(originalRawMode);
  } catch {
    // Ignore errors when restoring
  }
}

// Cross-platform no-echo passphrase prompt
// Uses keypress events on TTY to read without echoing to terminal
function promptPassphrase(promptText, confirm = false) {
  return new Promise((resolve, reject) => {
    // If not a TTY, refuse to prompt (security requirement)
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      reject(new Error("passphrase required via --passphrase-stdin when not in interactive terminal"));
      return;
    }

    process.stdout.write(promptText);

    let passphrase = "";

    // Save original raw mode state to restore on exit
    const originalRawMode = process.stdin.isRaw;

    // Ensure keypress events are emitted for stdin
    // This is required for the 'keypress' event to work on all platforms
    if (!process.stdin.emitKeypressEvents) {
      emitKeypressEvents(process.stdin);
    }

    // Helper to cleanup and restore raw mode
    const cleanup = () => {
      process.stdin.removeListener("keypress", onKeypress);
      restoreRawMode(originalRawMode);
    };

    // Use keypress to capture input without echo
    // Handle both (str, key) signature that Node.js provides
    const onKeypress = (str, key) => {
      // Handle both string and key parameter forms
      const char = str;
      
      if (char === "\r" || char === "\n") {
        // Enter pressed - finish
        process.stdout.write("\n");
        cleanup();

        if (!passphrase || passphrase.trim() === "") {
          reject(new Error("passphrase cannot be empty"));
          return;
        }

        if (confirm) {
          process.stdout.write("Confirm passphrase: ");
          let confirmPassphrase = "";

          const onConfirmKeypress = (cstr, ckey) => {
            const cchar = cstr;
            
            if (cchar === "\r" || cchar === "\n") {
              process.stdout.write("\n");
              process.stdin.removeListener("keypress", onConfirmKeypress);
              restoreRawMode(originalRawMode);

              if (passphrase !== confirmPassphrase) {
                reject(new Error("passphrases do not match"));
                return;
              }
              resolve(passphrase);
            } else if (ckey && ckey.ctrl && ckey.name === "c") {
              // Ctrl+C
              process.stdin.removeListener("keypress", onConfirmKeypress);
              restoreRawMode(originalRawMode);
              reject(new Error("cancelled"));
            } else if (cchar === "\u007f" || (ckey && ckey.name === "backspace")) {
              // Backspace
              if (confirmPassphrase.length > 0) {
                confirmPassphrase = confirmPassphrase.slice(0, -1);
                process.stdout.write("\b \b");
              }
            } else if (cchar && cchar.length === 1) {
              confirmPassphrase += cchar;
              process.stdout.write("*");
            }
          };

          process.stdin.on("keypress", onConfirmKeypress);
          try {
            process.stdin.setRawMode(true);
          } catch (e) {
            process.stdin.removeListener("keypress", onConfirmKeypress);
            reject(new Error("cannot enable raw mode for secure passphrase input"));
          }
        } else {
          resolve(passphrase);
        }
      } else if (key && key.ctrl && key.name === "c") {
        // Ctrl+C
        cleanup();
        reject(new Error("cancelled"));
      } else if (char === "\u007f" || (key && key.name === "backspace")) {
        // Backspace
        if (passphrase.length > 0) {
          passphrase = passphrase.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (char && char.length === 1) {
        // Regular character - capture but don't echo
        passphrase += char;
        process.stdout.write("*");
      }
    };

    process.stdin.on("keypress", onKeypress);

    // Enable raw mode to capture individual keypresses
    try {
      process.stdin.setRawMode(true);
    } catch (e) {
      cleanup();
      reject(new Error("cannot enable raw mode for secure passphrase input"));
    }
  });
}

const USAGE = `continuity-bridge portable — encrypted portable continuity bundles

Usage:
  continuity-bridge portable encrypt <handoff-or-bundle-path> --output <file> [--overwrite]
  continuity-bridge portable inspect <encrypted-file> [--json]
  continuity-bridge portable restore <encrypted-file> --output <directory> [--overwrite]

Options:
  --output <path>          Output path for encrypt (file) or restore (directory).
  --overwrite             Replace existing files (encrypt output or restore destination).
  --json                  Emit machine-readable JSON for inspect.
  --passphrase-stdin      Read passphrase from stdin (two lines for encrypt: passphrase + confirmation).

Encrypt options:
  Creates an encrypted portable bundle (.cbx) from a handoff file or attachment bundle directory.
  Passphrase is read from stdin (two lines: passphrase and confirmation).

Inspect options:
  Non-mutating preview of an encrypted bundle. Reads passphrase from stdin.
  Use --json for machine-readable output.

Restore options:
  Extracts an encrypted bundle to a directory. Reads passphrase from stdin.
  Refuses traversal attacks, absolute paths, symlinks, and hash mismatches.

Examples:
  continuity-bridge portable encrypt ./my-handoff --output encrypted.cbx
  continuity-bridge portable inspect encrypted.cbx --json
  continuity-bridge portable restore encrypted.cbx --output ./restored --overwrite

Note: Passphrase must be provided via stdin. For encrypt, send two lines (passphrase + confirmation).
`;

function getPassphraseFromStdin(lineCount = 1) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = process.stdin;
    let bytesRead = 0;
    stream.on("data", (chunk) => {
      chunks.push(chunk);
      bytesRead += chunk.length;
      // Keep reading until we have enough newlines or EOF
    });
    stream.on("end", () => {
      const input = Buffer.concat(chunks).toString("utf8");
      const lines = input.trim().split("\n").filter((l) => l.length > 0);
      if (lines.length < lineCount) {
        reject(new Error(`expected ${lineCount} passphrase line(s) on stdin, got ${lines.length}`));
        return;
      }
      if (lineCount === 1) {
        resolve(lines[0]);
      } else {
        resolve({ passphrase: lines[0], confirmation: lines[1] });
      }
    });
    stream.on("error", reject);
  });
}

async function getPassphrase(options, requireConfirm = false) {
  // Passphrase must come from stdin (either --passphrase-stdin flag or TTY prompt)
  if (options.passphraseStdin) {
    return getPassphraseFromStdin(requireConfirm ? 2 : 1);
  }
  // For TTY, prompt interactively
  if (process.stdin.isTTY) {
    const action = requireConfirm ? "Enter encryption passphrase: " : "Enter passphrase: ";
    return promptPassphrase(action, requireConfirm);
  }
  // Non-TTY without explicit --passphrase-stdin is an error
  throw new Error("passphrase required via --passphrase-stdin or TTY prompt");
}

export function parsePortableArgs(argv) {
  const parsed = {
    command: null,
    input: null,
    output: null,
    overwrite: false,
    json: false,
    passphraseStdin: false,
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
    } else if (arg === "--passphrase-stdin") {
      parsed.passphraseStdin = true;
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
      const passphraseData = await getPassphrase(args, true);
      // Handle both object (from stdin) and string (from TTY) cases
      const passphrase = typeof passphraseData === "object" ? passphraseData.passphrase : passphraseData;
      const result = await encryptBundle(args.input, args.output, passphrase, {
        overwrite: args.overwrite,
      });
      process.stdout.write(
        `Encrypted ${result.fileCount} file(s) to ${result.outputPath}.\n` +
          `Bundle schema: ${result.schema}\n` +
          `Handoff: ${result.handoffName}\n`,
      );
      return 0;
    }

    if (args.command === "inspect") {
      const passphraseData = await getPassphrase(args, false);
      const passphrase = typeof passphraseData === "object" ? passphraseData.passphrase : passphraseData;
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
      const passphraseData = await getPassphrase(args, false);
      const passphrase = typeof passphraseData === "object" ? passphraseData.passphrase : passphraseData;
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
