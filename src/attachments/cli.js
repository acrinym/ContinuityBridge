import { resolve } from "node:path";
import { bundleExportAttachments, inspectExportAttachments } from "./bundle.js";

const USAGE = `continuity-bridge attachments — inspect and carry local export artifacts safely

Usage:
  continuity-bridge attachments <chatgpt|claude> <export.zip|directory|conversations.json> [options]

Inspection options:
  --json                    Emit machine-readable attachment metadata.

Bundle options:
  --bundle <directory>      Copy selected local artifacts into a portable bundle.
  --attachment-id <id>      Select one attachment from inspection output. Repeat as needed.
  --all                     Select every attachment reference, including unavailable ones.
  --overwrite               Replace an existing bundle artifact only when its content differs.

Examples:
  continuity-bridge attachments chatgpt ./export --json
  continuity-bridge attachments claude ./export.zip --bundle ./handoff-bundle --attachment-id abc123
  continuity-bridge attachments chatgpt ./export --bundle ./handoff-bundle --all
`;

export function parseAttachmentArgs(argv) {
  if (argv[0] === "--help" || argv[0] === "-h" || argv.length === 0) return { help: true };
  const [provider, input, ...rest] = argv;
  if (!new Set(["chatgpt", "claude"]).has(provider)) {
    throw new Error("attachment provider must be chatgpt or claude");
  }
  if (!input || input.startsWith("--")) throw new Error("attachments requires an export path");

  const parsed = {
    provider,
    input,
    json: false,
    bundle: null,
    attachmentIds: [],
    all: false,
    overwrite: false,
  };
  const valueOptions = new Set(["--bundle", "--attachment-id"]);

  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option === "--help" || option === "-h") return { help: true };
    if (valueOptions.has(option)) {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${option} requires a value`);
      index += 1;
      if (option === "--bundle") parsed.bundle = value;
      else parsed.attachmentIds.push(value);
      continue;
    }
    if (option === "--json") parsed.json = true;
    else if (option === "--all") parsed.all = true;
    else if (option === "--overwrite") parsed.overwrite = true;
    else throw new Error(`unknown attachments option: ${option}`);
  }

  if (!parsed.bundle && (parsed.attachmentIds.length > 0 || parsed.all || parsed.overwrite)) {
    throw new Error("attachment selection and --overwrite require --bundle <directory>");
  }
  if (parsed.bundle && !parsed.all && parsed.attachmentIds.length === 0) {
    throw new Error("--bundle requires --attachment-id <id> or --all");
  }
  if (parsed.all && parsed.attachmentIds.length > 0) {
    throw new Error("choose repeatable --attachment-id values or --all, not both");
  }
  return parsed;
}

function humanInspection(result) {
  const lines = [
    `${result.providerLabel}: ${result.attachmentCount} attachment references; ${result.availableCount} local, ${result.unavailableCount} unavailable`,
  ];
  for (const item of result.attachments) {
    const details = [item.status, item.mimeType, item.size !== null ? `${item.size} bytes` : null]
      .filter(Boolean)
      .join(", ");
    lines.push(`- ${item.name} [${item.id}] — ${details || item.status}`);
    lines.push(
      `  conversation ${item.provenance.conversationId}; message ${item.provenance.messageId}`,
    );
    if (item.sourceRelativePath) lines.push(`  local export path: ${item.sourceRelativePath}`);
    if (item.missingReason) lines.push(`  ${item.missingReason}`);
  }
  return `${lines.join("\n")}\n`;
}

function humanBundle(result) {
  const { manifest } = result;
  const lines = [
    `Attachment bundle: ${manifest.copiedCount} copied, ${manifest.unavailableCount} unavailable, ${manifest.selectedCount} selected.`,
    `Manifest: ${resolve(result.manifestPath)}`,
  ];
  for (const item of manifest.attachments) {
    const location = item.relativePath ? ` → ${item.relativePath}` : "";
    lines.push(`- ${item.name} [${item.id}] — ${item.status}${location}`);
    if (item.sha256) lines.push(`  sha256 ${item.sha256}`);
    if (item.missingReason) lines.push(`  ${item.missingReason}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function runAttachmentsCli(argv) {
  let args;
  try {
    args = parseAttachmentArgs(argv);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n\n${USAGE}`);
    return 1;
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  try {
    if (!args.bundle) {
      const result = await inspectExportAttachments(args.provider, args.input);
      process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : humanInspection(result));
      return 0;
    }

    const result = await bundleExportAttachments(args.provider, args.input, args.bundle, {
      attachmentIds: args.attachmentIds,
      all: args.all,
      overwrite: args.overwrite,
    });
    process.stdout.write(args.json ? `${JSON.stringify(result.manifest, null, 2)}\n` : humanBundle(result));
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
