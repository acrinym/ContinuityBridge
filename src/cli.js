import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { resolveChatGptExport } from "./chatgpt/resolve-export.js";
import { readChatGptConversations, toLoreBatches } from "./chatgpt/parse-export.js";
import { pushBatchesToLore } from "./lore/push.js";

const USAGE = `continuity-bridge — user-owned continuity between AI clients

Usage:
  continuity-bridge import-chatgpt <export.zip|directory|conversations.json> [options]
  continuity-bridge help

Options:
  --to-lore                 Send every normalized conversation to \`lore push\`.
  --output <file>           Also write normalized Lore batches as JSONL.
  --dry-run                 Parse and validate only; write nothing.
  --no-redact               Preserve credential-like strings verbatim.
  --project <name>          Override the Lore project assigned to all conversations.
  --source <name>           Override the Lore source namespace (default: chatgpt).
  --lore-command <path>     Lore executable to invoke (default: lore).
  --limit <count>           Import only the first N conversations (useful for testing).
  --quiet                   Suppress per-conversation progress.

Examples:
  continuity-bridge import-chatgpt ~/Downloads/chatgpt-export.zip --to-lore
  continuity-bridge import-chatgpt conversations.json --output chatgpt-lore.jsonl
  continuity-bridge import-chatgpt export-dir --dry-run --limit 10
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }
  if (command !== "import-chatgpt") {
    return { command: "error", error: `unknown command: ${command}` };
  }

  const optionsWithValues = new Set([
    "--output",
    "--project",
    "--source",
    "--lore-command",
    "--limit",
  ]);
  const parsed = {
    command,
    input: undefined,
    toLore: false,
    output: undefined,
    dryRun: false,
    redact: true,
    project: undefined,
    source: "chatgpt",
    loreCommand: "lore",
    limit: undefined,
    quiet: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (optionsWithValues.has(value)) {
      const optionValue = rest[index + 1];
      if (optionValue === undefined || optionValue.startsWith("--")) {
        return { command: "error", error: `${value} requires a value` };
      }
      index += 1;
      if (value === "--output") parsed.output = optionValue;
      if (value === "--project") parsed.project = optionValue;
      if (value === "--source") parsed.source = optionValue;
      if (value === "--lore-command") parsed.loreCommand = optionValue;
      if (value === "--limit") {
        const limit = Number.parseInt(optionValue, 10);
        if (!Number.isInteger(limit) || limit < 1) {
          return { command: "error", error: "--limit must be a positive integer" };
        }
        parsed.limit = limit;
      }
      continue;
    }

    if (value === "--to-lore") parsed.toLore = true;
    else if (value === "--dry-run") parsed.dryRun = true;
    else if (value === "--no-redact") parsed.redact = false;
    else if (value === "--quiet") parsed.quiet = true;
    else if (value.startsWith("--")) {
      return { command: "error", error: `unknown option: ${value}` };
    } else if (!parsed.input) parsed.input = value;
    else return { command: "error", error: `unexpected argument: ${value}` };
  }

  if (!parsed.input) {
    return { command: "error", error: "import-chatgpt requires an export path" };
  }
  return parsed;
}

async function writeJsonl(path, batches) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const stream = createWriteStream(absolute, { encoding: "utf8" });
  for (const batch of batches) {
    if (!stream.write(`${JSON.stringify(batch)}\n`)) {
      await new Promise((resolveDrain) => stream.once("drain", resolveDrain));
    }
  }
  await new Promise((resolveEnd, rejectEnd) => {
    stream.once("error", rejectEnd);
    stream.end(resolveEnd);
  });
  return absolute;
}

export async function runCli(argv) {
  const args = parseArgs(argv);
  if (args.command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (args.command === "error") {
    process.stderr.write(`error: ${args.error}\n\n${USAGE}`);
    return 1;
  }

  let exportHandle;
  try {
    exportHandle = await resolveChatGptExport(args.input);
    const conversations = await readChatGptConversations(exportHandle.conversationPaths);
    const selected = args.limit ? conversations.slice(0, args.limit) : conversations;
    const batches = toLoreBatches(selected, {
      source: args.source,
      project: args.project,
      redact: args.redact,
    });

    const messageCount = batches.reduce((sum, batch) => sum + batch.messages.length, 0);
    process.stdout.write(
      `Parsed ${batches.length} ChatGPT conversations and ${messageCount} messages.\n`,
    );

    if (args.dryRun) {
      process.stdout.write("Dry run complete; no records were written.\n");
      return 0;
    }

    if (!args.toLore && !args.output) {
      process.stderr.write(
        "error: choose at least one destination: --to-lore or --output <file>\n",
      );
      return 1;
    }

    if (args.output) {
      const writtenPath = await writeJsonl(args.output, batches);
      process.stdout.write(`Wrote normalized Lore batches to ${writtenPath}.\n`);
    }

    if (args.toLore) {
      const result = await pushBatchesToLore(batches, {
        command: args.loreCommand,
        quiet: args.quiet,
      });
      process.stdout.write(
        `Lore import complete: ${result.conversations} conversations, ` +
          `${result.messages} messages.\n`,
      );
    }

    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    await exportHandle?.cleanup();
  }
}
