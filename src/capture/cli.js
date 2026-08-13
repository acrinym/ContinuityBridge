import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stdin } from "node:process";
import { ingestLiveCapture } from "./ingest.js";
import { inspectLiveCapture } from "./normalize.js";
import { createCaptureServer, listenCaptureServer } from "./server.js";

const USAGE = `continuity-bridge capture — explicit local live continuity

Usage:
  continuity-bridge capture inspect <capture.json|-> [--json]
  continuity-bridge capture submit <capture.json|-> --to-lore [options]
  continuity-bridge capture serve --to-lore [options]

Mutation options:
  --to-lore                 Required for submit/serve; writes through \`lore push\`.
  --lore-command <path>     Lore executable to invoke (default: lore).
  --project <name>          Override the Lore project for captured conversations.
  --source <name>           Override the Lore source namespace.
  --manifest <file>         Override the shared incremental manifest path.
  --no-manifest             Disable unchanged-capture skipping/checkpointing.
  --reimport                Push even when the capture resume token is unchanged.
  --no-redact               Preserve credential-like strings verbatim.

Receiver options:
  --port <number>            Loopback receiver port (default: 43119; 0 selects a free port).
  --token <value>            Browser authorization token. Random if omitted.

The receiver always binds to 127.0.0.1. It never exposes a LAN listener.
`;

async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

async function readPayload(path) {
  const text = path === "-" ? await readStdin() : await readFile(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`capture payload is not valid JSON: ${error.message}`);
  }
}

export function parseCaptureArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || ["help", "--help", "-h"].includes(command)) return { help: true };
  if (!["inspect", "submit", "serve"].includes(command)) {
    throw new Error(`unknown capture command: ${command}`);
  }
  const parsed = {
    command,
    input: null,
    toLore: false,
    loreCommand: "lore",
    project: null,
    source: null,
    manifestPath: null,
    manifestEnabled: true,
    reimport: false,
    redact: true,
    port: 43119,
    portSet: false,
    token: null,
    tokenSet: false,
    json: false,
  };
  const withValue = new Set(["--lore-command", "--project", "--source", "--manifest", "--port", "--token"]);
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (withValue.has(value)) {
      const next = rest[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`${value} requires a value`);
      index += 1;
      if (value === "--lore-command") parsed.loreCommand = next;
      if (value === "--project") parsed.project = next;
      if (value === "--source") parsed.source = next;
      if (value === "--manifest") parsed.manifestPath = next;
      if (value === "--token") {
        parsed.token = next;
        parsed.tokenSet = true;
      }
      if (value === "--port") {
        if (!/^\d+$/.test(next)) throw new Error("--port must be 0-65535");
        const port = Number(next);
        if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("--port must be 0-65535");
        parsed.port = port;
        parsed.portSet = true;
      }
      continue;
    }
    if (value === "--to-lore") parsed.toLore = true;
    else if (value === "--no-manifest") parsed.manifestEnabled = false;
    else if (value === "--reimport") parsed.reimport = true;
    else if (value === "--no-redact") parsed.redact = false;
    else if (value === "--json") parsed.json = true;
    else if (value.startsWith("--")) throw new Error(`unknown capture option: ${value}`);
    else if (!parsed.input && command !== "serve") parsed.input = value;
    else throw new Error(`unexpected capture argument: ${value}`);
  }
  if ((command === "inspect" || command === "submit") && !parsed.input) {
    throw new Error(`${command} requires a capture JSON path or - for stdin`);
  }
  if (command === "inspect" && (parsed.toLore || parsed.project || parsed.source || parsed.manifestPath || !parsed.manifestEnabled || parsed.reimport || !parsed.redact)) {
    throw new Error("capture inspect does not accept mutation options");
  }
  if ((command === "submit" || command === "serve") && !parsed.toLore) {
    throw new Error(`capture ${command} requires --to-lore so the mutation destination is explicit`);
  }
  if (!parsed.manifestEnabled && parsed.manifestPath) {
    throw new Error("--manifest and --no-manifest cannot be used together");
  }
  if (command !== "serve" && (parsed.tokenSet || parsed.portSet)) {
    throw new Error("--token and --port are only valid with capture serve");
  }
  return parsed;
}

function ingestOptions(args) {
  return {
    loreCommand: args.loreCommand,
    project: args.project || undefined,
    source: args.source || undefined,
    manifestPath: args.manifestPath || undefined,
    manifestEnabled: args.manifestEnabled,
    reimport: args.reimport,
    redact: args.redact,
  };
}

export async function runCaptureCli(argv) {
  let args;
  try {
    args = parseCaptureArgs(argv);
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n\n${USAGE}`);
    return 1;
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  try {
    if (args.command === "inspect") {
      const summary = inspectLiveCapture(await readPayload(args.input));
      process.stdout.write(args.json ? `${JSON.stringify(summary, null, 2)}\n` : `${summary.source}: ${summary.title} (${summary.messageCount} messages) [${summary.conversationId}]\n`);
      return 0;
    }
    if (args.command === "submit") {
      const result = await ingestLiveCapture(await readPayload(args.input), ingestOptions(args));
      process.stdout.write(`${JSON.stringify({ status: result.status, sourceFileId: result.sourceFileId, messageCount: result.messageCount })}\n`);
      return 0;
    }

    const token = args.token || randomBytes(24).toString("base64url");
    const server = createCaptureServer({ token, ingestOptions: ingestOptions(args) });
    const port = await listenCaptureServer(server, args.port);
    process.stdout.write(`${JSON.stringify({ status: "listening", host: "127.0.0.1", port, token, destination: "lore" })}\n`);
    const close = () => server.close(() => { process.exitCode = 0; });
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    return await new Promise((resolveExit) => server.once("close", () => resolveExit(0)));
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
