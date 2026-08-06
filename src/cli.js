import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { resolveChatGptExport } from "./chatgpt/resolve-export.js";
import {
  chatGptConversationId,
  readChatGptConversations,
  summarizeChatGptConversations,
  toLoreBatches,
} from "./chatgpt/parse-export.js";
import { resolveClaudeExport } from "./claude/resolve-export.js";
import {
  claudeConversationId,
  readClaudeConversations,
  summarizeClaudeConversations,
  toClaudeLoreBatches,
} from "./claude/parse-export.js";
import {
  defaultManifestPath,
  loadManifest,
  loreDestinationKey,
  markBatchImported,
  saveManifest,
  selectPendingBatches,
} from "./incremental/manifest.js";
import { pushBatchesToLore } from "./lore/push.js";

const PROVIDERS = {
  chatgpt: {
    label: "ChatGPT",
    resolve: resolveChatGptExport,
    read: readChatGptConversations,
    toBatches: toLoreBatches,
    summarize: summarizeChatGptConversations,
    id: chatGptConversationId,
  },
  claude: {
    label: "Claude",
    resolve: resolveClaudeExport,
    read: readClaudeConversations,
    toBatches: toClaudeLoreBatches,
    summarize: summarizeClaudeConversations,
    id: claudeConversationId,
  },
};

const USAGE = `continuity-bridge — user-owned continuity between AI clients

Usage:
  continuity-bridge import-chatgpt <export.zip|directory|conversations.json> [options]
  continuity-bridge import-claude <export.zip|directory|conversations.json> [options]
  continuity-bridge inspect-chatgpt <export.zip|directory|conversations.json> [options]
  continuity-bridge inspect-claude <export.zip|directory|conversations.json> [options]
  continuity-bridge help

Import options:
  --to-lore                 Send normalized conversations to \`lore push\`.
  --output <file>           Also write a complete normalized JSONL snapshot.
  --dry-run                 Parse and plan only; write nothing.
  --no-redact               Preserve credential-like strings verbatim.
  --project <name>          Override the Lore project assigned to all conversations.
  --source <name>           Override the Lore source namespace.
  --lore-command <path>     Lore executable to invoke (default: lore).
  --manifest <file>         Override the incremental Lore manifest path.
  --no-manifest             Disable incremental Lore skipping for this run.
  --reimport                Push every selected conversation and refresh checkpoints.
  --conversation-id <id>    Import one conversation. Repeat to import several.
  --limit <count>           Import only the first N selected conversations.
  --quiet                   Suppress per-conversation progress.

Inspect options:
  --json                    Emit a machine-readable JSON summary.
  --no-redact               Preserve credential-like strings in preview text.
  --conversation-id <id>    Inspect one conversation. Repeat to inspect several.
  --limit <count>           Inspect only the first N selected conversations.

Examples:
  continuity-bridge import-chatgpt ~/Downloads/chatgpt-export.zip --to-lore
  continuity-bridge import-claude ~/Downloads/claude-export.zip --to-lore
  continuity-bridge import-chatgpt export.zip --to-lore --reimport
  continuity-bridge inspect-chatgpt conversations.json --json
  continuity-bridge inspect-claude export-dir --json --limit 20
`;

function parseCommand(command) {
  const match = /^(import|inspect)-(chatgpt|claude)$/.exec(command ?? "");
  if (!match) return null;
  return { mode: match[1], provider: match[2] };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }

  const operation = parseCommand(command);
  if (!operation) return { command: "error", error: `unknown command: ${command}` };

  const optionsWithValues = new Set([
    "--output",
    "--project",
    "--source",
    "--lore-command",
    "--manifest",
    "--limit",
    "--conversation-id",
  ]);
  const parsed = {
    command,
    ...operation,
    input: undefined,
    toLore: false,
    output: undefined,
    dryRun: false,
    redact: true,
    project: undefined,
    source: operation.provider,
    loreCommand: "lore",
    manifestPath: undefined,
    manifestEnabled: true,
    reimport: false,
    limit: undefined,
    quiet: false,
    json: false,
    conversationIds: [],
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
      if (value === "--manifest") parsed.manifestPath = optionValue;
      if (value === "--conversation-id") parsed.conversationIds.push(optionValue);
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
    else if (value === "--no-manifest") parsed.manifestEnabled = false;
    else if (value === "--reimport") parsed.reimport = true;
    else if (value === "--quiet") parsed.quiet = true;
    else if (value === "--json") parsed.json = true;
    else if (value.startsWith("--")) {
      return { command: "error", error: `unknown option: ${value}` };
    } else if (!parsed.input) parsed.input = value;
    else return { command: "error", error: `unexpected argument: ${value}` };
  }

  if (!parsed.input) return { command: "error", error: `${command} requires an export path` };
  if (!parsed.manifestEnabled && parsed.manifestPath) {
    return { command: "error", error: "--manifest and --no-manifest cannot be used together" };
  }
  if (
    parsed.mode === "inspect" &&
    (parsed.toLore ||
      parsed.output ||
      parsed.dryRun ||
      parsed.manifestPath ||
      !parsed.manifestEnabled ||
      parsed.reimport)
  ) {
    return { command: "error", error: `${command} does not accept import destination options` };
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

function selectConversations(conversations, provider, args) {
  let selected = conversations;
  if (args.conversationIds.length > 0) {
    const wanted = new Set(args.conversationIds);
    selected = conversations.filter((conversation, index) => wanted.has(provider.id(conversation, index)));
    const found = new Set(selected.map((conversation, index) => provider.id(conversation, index)));
    const missing = args.conversationIds.filter((id) => !found.has(id));
    if (missing.length > 0) throw new Error(`conversation IDs not found: ${missing.join(", ")}`);
  }
  return args.limit ? selected.slice(0, args.limit) : selected;
}

function renderHumanSummary(provider, summaries) {
  const messageCount = summaries.reduce((sum, item) => sum + item.messageCount, 0);
  const lines = [`${provider.label}: ${summaries.length} conversations, ${messageCount} messages`];
  for (const item of summaries) {
    const date = item.updatedAt ?? item.createdAt ?? "unknown date";
    lines.push(`- ${item.title} (${item.messageCount} messages, ${date}) [${item.id}]`);
  }
  return `${lines.join("\n")}\n`;
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

  const provider = PROVIDERS[args.provider];
  let exportHandle;
  try {
    exportHandle = await provider.resolve(args.input);
    const conversations = await provider.read(exportHandle.conversationPaths);
    const selected = selectConversations(conversations, provider, args);

    if (args.mode === "inspect") {
      const summaries = provider.summarize(selected, {
        source: args.source,
        project: args.project,
        redact: args.redact,
      });
      const messageCount = summaries.reduce((sum, item) => sum + item.messageCount, 0);
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              provider: args.provider,
              conversationCount: summaries.length,
              messageCount,
              conversations: summaries,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        process.stdout.write(renderHumanSummary(provider, summaries));
      }
      return 0;
    }

    const batches = provider.toBatches(selected, {
      source: args.source,
      project: args.project,
      redact: args.redact,
    });
    const messageCount = batches.reduce((sum, batch) => sum + batch.messages.length, 0);
    process.stdout.write(
      `Parsed ${batches.length} ${provider.label} conversations and ${messageCount} messages.\n`,
    );

    let loreBatches = batches;
    let skippedLore = 0;
    let manifest = null;
    let manifestPath = null;
    let destinationKey = null;
    if (args.toLore && args.manifestEnabled) {
      manifestPath = resolve(args.manifestPath ?? defaultManifestPath());
      manifest = await loadManifest(manifestPath);
      destinationKey = loreDestinationKey({
        source: args.source,
        project: args.project,
      });
      const selection = selectPendingBatches(batches, manifest, destinationKey, {
        reimport: args.reimport,
      });
      loreBatches = selection.pending;
      skippedLore = selection.skipped.length;
      process.stdout.write(
        `Incremental Lore plan: ${loreBatches.length} pending, ${skippedLore} unchanged; ` +
          `manifest ${manifestPath}.\n`,
      );
    } else if (args.toLore) {
      process.stdout.write("Incremental Lore manifest disabled for this run.\n");
    }

    if (args.dryRun) {
      process.stdout.write("Dry run complete; no records or manifest checkpoints were written.\n");
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
      process.stdout.write(`Wrote complete normalized Lore snapshot to ${writtenPath}.\n`);
    }

    if (args.toLore) {
      if (loreBatches.length === 0) {
        process.stdout.write(
          `Lore import already current: skipped ${skippedLore} unchanged conversations.\n`,
        );
      } else {
        const result = await pushBatchesToLore(loreBatches, {
          command: args.loreCommand,
          quiet: args.quiet,
          onBatchImported:
            manifest && manifestPath && destinationKey
              ? async (batch) => {
                  markBatchImported(manifest, destinationKey, batch);
                  await saveManifest(manifestPath, manifest);
                }
              : undefined,
        });
        process.stdout.write(
          `Lore import complete: ${result.conversations} conversations, ${result.messages} messages` +
            `${skippedLore ? `; skipped ${skippedLore} unchanged` : ""}.\n`,
        );
      }
    }

    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    await exportHandle?.cleanup();
  }
}
