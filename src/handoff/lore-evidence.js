import { spawn } from "node:child_process";

function parseJsonEnvelope(stdout, label) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${label} returned an invalid JSON envelope`);
  }
  return parsed;
}

export function runLoreJson(args, options = {}) {
  const command = options.command ?? "lore";
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
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
        rejectRun(new Error(`Lore command not found: ${command}`));
      } else {
        rejectRun(error);
      }
    });
    child.once("close", (code) => {
      if (code !== 0) {
        rejectRun(
          new Error(
            `${command} ${args.join(" ")} failed (${code}): ${stderr.trim() || "unknown error"}`,
          ),
        );
        return;
      }
      resolveRun(parseJsonEnvelope(stdout.trim(), `${command} ${args[0]}`));
    });
  });
}

function uniqueIds(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }
  return output;
}

function boundedContext(messages, anchorId, maximum) {
  if (!Array.isArray(messages)) return [];
  if (!Number.isInteger(maximum) || maximum < 1 || messages.length <= maximum) {
    return messages;
  }
  const anchorIndex = messages.findIndex(
    (message) => String(message?.messageId ?? message?.message_id ?? "") === anchorId,
  );
  if (anchorIndex < 0) return messages.slice(0, maximum);
  const before = Math.floor((maximum - 1) / 2);
  let start = Math.max(0, anchorIndex - before);
  let end = Math.min(messages.length, start + maximum);
  start = Math.max(0, end - maximum);
  return messages.slice(start, end);
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") return null;
  const messageId = message.messageId ?? message.message_id ?? null;
  return {
    messageId: messageId === null ? null : String(messageId),
    sessionId:
      message.sessionId === undefined && message.session_id === undefined
        ? null
        : String(message.sessionId ?? message.session_id),
    source: message.source ?? null,
    project: message.project ?? null,
    role: message.role ?? null,
    timestamp: message.timestamp ?? null,
    model: message.model ?? null,
    text: String(message.text ?? ""),
  };
}

export async function collectLoreEvidence(options = {}) {
  const query = String(options.query ?? "").trim();
  const explicitIds = uniqueIds(options.messageIds ?? []);
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 5;
  const contextMessages =
    Number.isInteger(options.contextMessages) && options.contextMessages > 0
      ? options.contextMessages
      : 11;
  const loreOptions = { command: options.loreCommand ?? "lore" };

  const searchHits = [];
  if (query) {
    const search = await runLoreJson(
      ["search", query, "--relevant", "--json", "--limit", String(limit)],
      loreOptions,
    );
    if (!Array.isArray(search.hits)) {
      throw new Error("Lore search response did not contain a hits array");
    }
    searchHits.push(...search.hits);
  }

  const ids = uniqueIds([
    ...explicitIds,
    ...searchHits.map((hit) => hit?.messageId ?? hit?.message_id),
  ]).slice(0, Math.max(limit, explicitIds.length));

  if (ids.length === 0) {
    throw new Error("no Lore evidence found; provide --query or --message-id with a matching record");
  }

  const hitById = new Map(
    searchHits.map((hit) => [String(hit?.messageId ?? hit?.message_id ?? ""), hit]),
  );
  const evidence = [];

  for (const messageId of ids) {
    const [detail, context] = await Promise.all([
      runLoreJson(["get", messageId, "--full", "--json"], loreOptions),
      runLoreJson(["context", messageId, "--json"], loreOptions),
    ]);
    const anchorRaw = detail.message ?? detail;
    const anchor = normalizeMessage(anchorRaw);
    if (!anchor || !anchor.messageId) {
      throw new Error(`Lore get did not return message ${messageId}`);
    }
    const contextItems = boundedContext(context.messages, messageId, contextMessages)
      .map(normalizeMessage)
      .filter(Boolean);
    const hit = hitById.get(messageId);
    evidence.push({
      anchor,
      search: hit
        ? {
            score: hit.score ?? null,
            matchedText: String(hit.text ?? ""),
          }
        : null,
      context: contextItems,
    });
  }

  return {
    query: query || null,
    requestedMessageIds: explicitIds,
    evidence,
  };
}
