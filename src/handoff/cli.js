import { extname, resolve } from "node:path";
import { buildHandoff, renderHandoffMarkdown, writeHandoff } from "./build.js";

const USAGE = `continuity-bridge handoff — build a bounded evidence package for another AI

Usage:
  continuity-bridge handoff --task <text> [--query <text> | --message-id <id> ...] [options]

Evidence options:
  --query <text>             Search Lore with recency-blended relevance.
  --message-id <id>          Include an exact Lore message. Repeat for several.
  --limit <count>            Maximum search-derived anchors (default: 5).
  --context-messages <count> Maximum messages kept around each anchor (default: 11).
  --lore-command <path>      Lore executable or command to invoke (default: lore).

Repository options:
  --repo <path>              Attach Git coordinates from this repository.
  --no-repo                  Omit repository coordinates.
  --include-local-path       Include the absolute local repository path.

Output options:
  --output <file>            Write the handoff to a file instead of stdout.
  --format <markdown|md|json> Output format; otherwise inferred from .json or Markdown.

Examples:
  continuity-bridge handoff --task "Continue parser work" --query "parser ambiguity"
  continuity-bridge handoff --task "Fix issue 42" --message-id abc123 --repo . --output HANDOFF.md
  continuity-bridge handoff --task "Review auth design" --query "auth design" --format json
`;

function positiveInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${option} must be a positive integer`);
  return parsed;
}

export function parseHandoffArgs(argv) {
  const parsed = {
    task: null,
    query: null,
    messageIds: [],
    limit: 5,
    contextMessages: 11,
    loreCommand: "lore",
    repositoryPath: null,
    noRepo: false,
    includeLocalPath: false,
    output: null,
    format: null,
  };
  const valueOptions = new Set([
    "--task",
    "--query",
    "--message-id",
    "--limit",
    "--context-messages",
    "--lore-command",
    "--repo",
    "--output",
    "--format",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") return { help: true };
    if (valueOptions.has(option)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);
      index += 1;
      if (option === "--task") parsed.task = value;
      if (option === "--query") parsed.query = value;
      if (option === "--message-id") parsed.messageIds.push(value);
      if (option === "--limit") parsed.limit = positiveInteger(value, option);
      if (option === "--context-messages") parsed.contextMessages = positiveInteger(value, option);
      if (option === "--lore-command") parsed.loreCommand = value;
      if (option === "--repo") parsed.repositoryPath = value;
      if (option === "--output") parsed.output = value;
      if (option === "--format") parsed.format = value.toLowerCase();
      continue;
    }
    if (option === "--no-repo") parsed.noRepo = true;
    else if (option === "--include-local-path") parsed.includeLocalPath = true;
    else throw new Error(`unknown handoff option: ${option}`);
  }

  if (!String(parsed.task ?? "").trim()) throw new Error("--task is required");
  if (!String(parsed.query ?? "").trim() && parsed.messageIds.length === 0) {
    throw new Error("provide --query or at least one --message-id");
  }
  if (parsed.noRepo && parsed.repositoryPath) throw new Error("--repo and --no-repo cannot be used together");
  if (parsed.includeLocalPath && parsed.noRepo) {
    throw new Error("--include-local-path cannot be used with --no-repo");
  }
  if (parsed.format && !["markdown", "md", "json"].includes(parsed.format)) {
    throw new Error("--format must be markdown, md, or json");
  }
  return parsed;
}

function outputFormat(args) {
  if (args.format) return args.format;
  if (args.output && extname(args.output).toLowerCase() === ".json") return "json";
  return "markdown";
}

export async function runHandoffCli(argv) {
  let args;
  try {
    args = parseHandoffArgs(argv);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n\n${USAGE}`);
    return 1;
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  try {
    const handoff = await buildHandoff({
      task: args.task,
      query: args.query,
      messageIds: args.messageIds,
      limit: args.limit,
      contextMessages: args.contextMessages,
      loreCommand: args.loreCommand,
      repositoryPath: args.noRepo ? process.cwd() : (args.repositoryPath ?? process.cwd()),
      repositoryOptional: args.noRepo || !args.repositoryPath,
      includeLocalPath: args.includeLocalPath,
    });
    if (args.noRepo) handoff.repository = null;
    const format = outputFormat(args);
    if (args.output) {
      const path = await writeHandoff(args.output, handoff, format);
      process.stdout.write(`Wrote ContinuityBridge handoff to ${resolve(path)}.\n`);
    } else if (format === "json") {
      process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
    } else {
      process.stdout.write(renderHandoffMarkdown(handoff));
    }
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
