import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { collectLoreEvidence } from "./lore-evidence.js";
import { repositoryCoordinates } from "./repository.js";

export async function buildHandoff(options = {}) {
  const task = String(options.task ?? "").trim();
  if (!task) throw new Error("handoff task is required");

  const [lore, repository] = await Promise.all([
    collectLoreEvidence({
      query: options.query,
      messageIds: options.messageIds,
      limit: options.limit,
      contextMessages: options.contextMessages,
      loreCommand: options.loreCommand,
    }),
    repositoryCoordinates(options.repositoryPath ?? process.cwd(), {
      optional: options.repositoryOptional === true,
      includeLocalPath: options.includeLocalPath === true,
    }),
  ]);

  return {
    schema: "continuity-bridge/handoff-v1",
    createdAt: new Date().toISOString(),
    task,
    repository,
    lore: {
      query: lore.query,
      evidenceCount: lore.evidence.length,
      evidence: lore.evidence,
    },
    continuationRules: [
      "Treat the included conversation records as source evidence, not as current repository truth.",
      "Verify the live repository state before changing code.",
      "Use the included message and session identifiers to retrieve more Lore context only when needed.",
      "Do not invent missing decisions or provenance.",
    ],
  };
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/`/g, "\\`");
}

function renderRepository(repository) {
  if (!repository) return "Repository coordinates were not included.";
  const lines = [
    `- Name: \`${escapeMarkdown(repository.name)}\``,
    `- Remote: ${repository.remote ? `\`${escapeMarkdown(repository.remote)}\`` : "not configured"}`,
    `- Branch: ${repository.branch ? `\`${escapeMarkdown(repository.branch)}\`` : "detached / unknown"}`,
    `- Head: \`${escapeMarkdown(repository.head)}\``,
    `- Working tree: **${repository.dirty ? "dirty" : "clean"}**`,
  ];
  if (repository.localPath) lines.push(`- Local path: \`${escapeMarkdown(repository.localPath)}\``);
  return lines.join("\n");
}

function renderMessage(message, anchorId) {
  const anchor = message.messageId === anchorId ? " **← anchor**" : "";
  const meta = [message.role ?? "unknown", message.timestamp, message.source, message.model]
    .filter(Boolean)
    .join(" · ");
  return `### ${escapeMarkdown(meta)}${anchor}\n\n${message.text || "[empty message]"}\n\nMessage ID: \`${escapeMarkdown(message.messageId ?? "unknown")}\``;
}

export function renderHandoffMarkdown(handoff) {
  const sections = [
    "# ContinuityBridge Handoff",
    `Generated: ${handoff.createdAt}`,
    "## Task",
    handoff.task,
    "## Repository coordinates",
    renderRepository(handoff.repository),
  ];

  if (handoff.lore.query) {
    sections.push("## Lore search", `Query: \`${escapeMarkdown(handoff.lore.query)}\``);
  }

  sections.push("## Evidence");
  handoff.lore.evidence.forEach((item, index) => {
    const anchor = item.anchor;
    const header = [
      `### Evidence ${index + 1}`,
      `- Anchor message: \`${escapeMarkdown(anchor.messageId)}\``,
      `- Session: ${anchor.sessionId ? `\`${escapeMarkdown(anchor.sessionId)}\`` : "unknown"}`,
      `- Source: ${anchor.source ? `\`${escapeMarkdown(anchor.source)}\`` : "unknown"}`,
      `- Project: ${anchor.project ? `\`${escapeMarkdown(anchor.project)}\`` : "unknown"}`,
    ];
    if (item.search?.score !== null && item.search?.score !== undefined) {
      header.push(`- Search score: ${item.search.score}`);
    }
    header.push("#### Bounded source context");
    const messages = item.context.map((message) => renderMessage(message, anchor.messageId));
    sections.push([...header, ...messages].join("\n\n"));
  });

  sections.push(
    "## Continuation rules",
    handoff.continuationRules.map((rule) => `- ${rule}`).join("\n"),
  );
  return `${sections.join("\n\n")}\n`;
}

export async function writeHandoff(path, handoff, format = "markdown") {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const normalizedFormat = String(format).toLowerCase();
  let content;
  if (normalizedFormat === "json") {
    content = `${JSON.stringify(handoff, null, 2)}\n`;
  } else if (normalizedFormat === "markdown" || normalizedFormat === "md") {
    content = renderHandoffMarkdown(handoff);
  } else {
    throw new Error(`unsupported handoff format: ${format}`);
  }
  await writeFile(absolute, content, "utf8");
  return absolute;
}
