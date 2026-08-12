import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { bundleExportAttachments, planExportAttachments } from "../attachments/bundle.js";
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

Attachment options:
  --attachment-provider <chatgpt|claude> Provider for the source export.
  --attachment-export <path> Export ZIP, directory, or conversation JSON containing artifacts.
  --attachment-id <id>       Carry one attachment discovered from the export. Repeat as needed.
  --all-attachments          Carry every attachment reference, including unavailable references.
  --attachment-bundle <dir>  Copy selected local artifacts into this portable handoff bundle.
  --overwrite-attachments    Replace conflicting bundle artifacts after hash comparison.

Output options:
  --output <file>             Write the handoff to a file instead of stdout.
  --format <markdown|md|json> Output format; otherwise inferred from .json or Markdown.

When --attachment-bundle is used, the handoff is written inside that bundle. If --output is
omitted, ContinuityBridge writes HANDOFF.md (or HANDOFF.json) there automatically.

Examples:
  continuity-bridge handoff --task "Continue parser work" --query "parser ambiguity"
  continuity-bridge handoff --task "Fix issue 42" --message-id abc123 --repo . --output HANDOFF.md
  continuity-bridge handoff --task "Continue design" --message-id abc123 --no-repo \\
    --attachment-provider chatgpt --attachment-export ./export --all-attachments \\
    --attachment-bundle ./continuity-bundle
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
    attachmentProvider: null,
    attachmentExport: null,
    attachmentIds: [],
    allAttachments: false,
    attachmentBundle: null,
    overwriteAttachments: false,
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
    "--attachment-provider",
    "--attachment-export",
    "--attachment-id",
    "--attachment-bundle",
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
      if (option === "--attachment-provider") parsed.attachmentProvider = value.toLowerCase();
      if (option === "--attachment-export") parsed.attachmentExport = value;
      if (option === "--attachment-id") parsed.attachmentIds.push(value);
      if (option === "--attachment-bundle") parsed.attachmentBundle = value;
      continue;
    }
    if (option === "--no-repo") parsed.noRepo = true;
    else if (option === "--include-local-path") parsed.includeLocalPath = true;
    else if (option === "--all-attachments") parsed.allAttachments = true;
    else if (option === "--overwrite-attachments") parsed.overwriteAttachments = true;
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

  const hasAttachmentOptions = Boolean(
    parsed.attachmentProvider ||
      parsed.attachmentExport ||
      parsed.attachmentIds.length > 0 ||
      parsed.allAttachments ||
      parsed.attachmentBundle ||
      parsed.overwriteAttachments,
  );
  if (hasAttachmentOptions) {
    if (!parsed.attachmentProvider || !parsed.attachmentExport) {
      throw new Error("attachment continuity requires both --attachment-provider and --attachment-export");
    }
    if (!["chatgpt", "claude"].includes(parsed.attachmentProvider)) {
      throw new Error("--attachment-provider must be chatgpt or claude");
    }
    if (parsed.allAttachments && parsed.attachmentIds.length > 0) {
      throw new Error("choose repeatable --attachment-id values or --all-attachments, not both");
    }
    if (!parsed.allAttachments && parsed.attachmentIds.length === 0) {
      throw new Error("select attachments with --attachment-id or --all-attachments");
    }
    if (parsed.overwriteAttachments && !parsed.attachmentBundle) {
      throw new Error("--overwrite-attachments requires --attachment-bundle");
    }
  }
  return parsed;
}

function outputFormat(args) {
  if (args.format) return args.format;
  if (args.output && extname(args.output).toLowerCase() === ".json") return "json";
  return "markdown";
}

function pathInside(root, candidate) {
  const nested = relative(root, candidate);
  return nested === "" || (!nested.startsWith(`..${sep}`) && nested !== ".." && !isAbsolute(nested));
}

function portablePath(fromFile, target) {
  const result = relative(dirname(fromFile), target).split(sep).join("/");
  return result || ".";
}

function attachmentSelection(args) {
  return {
    attachmentIds: args.attachmentIds,
    all: args.allAttachments,
    overwrite: args.overwriteAttachments,
  };
}

function attachmentPlanSection(plan) {
  return {
    mode: "selected-not-copied",
    provider: plan.provider,
    selectedCount: plan.selectedCount,
    copiedCount: 0,
    unavailableCount: plan.attachments.filter((item) => item.status !== "available-not-copied").length,
    manifestPath: null,
    artifacts: plan.attachments.map((item) => ({ ...item, relativePath: null, sha256: null })),
  };
}

function attachmentBundleSection(result, handoffPath) {
  return {
    mode: "portable-bundle",
    provider: result.manifest.provider,
    selectedCount: result.manifest.selectedCount,
    copiedCount: result.manifest.copiedCount,
    unavailableCount: result.manifest.unavailableCount,
    manifestPath: portablePath(handoffPath, result.manifestPath),
    artifacts: result.manifest.attachments.map((item) => ({
      ...item,
      relativePath: item.relativePath
        ? portablePath(handoffPath, join(result.bundleDirectory, item.relativePath))
        : null,
    })),
  };
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
    const format = outputFormat(args);
    let handoffPath = args.output ? resolve(args.output) : null;
    let bundleDirectory = null;
    if (args.attachmentBundle) {
      bundleDirectory = resolve(args.attachmentBundle);
      handoffPath = handoffPath ?? join(bundleDirectory, format === "json" ? "HANDOFF.json" : "HANDOFF.md");
      if (!pathInside(bundleDirectory, handoffPath)) {
        throw new Error("when --attachment-bundle is used, --output must stay inside the bundle directory");
      }
    }

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

    if (args.attachmentProvider) {
      if (bundleDirectory) {
        const bundle = await bundleExportAttachments(
          args.attachmentProvider,
          args.attachmentExport,
          bundleDirectory,
          attachmentSelection(args),
        );
        handoff.attachments = attachmentBundleSection(bundle, handoffPath);
      } else {
        const plan = await planExportAttachments(
          args.attachmentProvider,
          args.attachmentExport,
          attachmentSelection(args),
        );
        handoff.attachments = attachmentPlanSection(plan);
      }
    }

    if (handoffPath) {
      const path = await writeHandoff(handoffPath, handoff, format);
      process.stdout.write(`Wrote ContinuityBridge handoff to ${resolve(path)}.\n`);
      if (bundleDirectory) process.stdout.write(`Attachment bundle: ${bundleDirectory}.\n`);
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
