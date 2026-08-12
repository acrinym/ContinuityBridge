import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { ingestLiveCapture } from "./ingest.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function authorized(request, token) {
  const header = String(request.headers.authorization ?? "");
  const expected = `Bearer ${token}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("capture payload exceeds 5 MiB limit");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) throw new Error("capture request body is empty");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`capture request is not valid JSON: ${error.message}`);
  }
}

export function createCaptureServer(options = {}) {
  const token = String(options.token ?? "").trim();
  if (!token) throw new Error("capture receiver requires an authorization token");
  const ingest = options.ingest ?? ingestLiveCapture;
  let queue = Promise.resolve();

  const server = createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      json(response, 204, {});
      return;
    }
    if (request.url === "/status" && request.method === "POST") {
      if (!authorized(request, token)) {
        json(response, 401, { error: "unauthorized" });
        return;
      }
      json(response, 200, { status: "ready", destination: "lore" });
      return;
    }
    if (request.url !== "/capture" || request.method !== "POST") {
      json(response, 404, { error: "not found" });
      return;
    }
    if (!authorized(request, token)) {
      json(response, 401, { error: "unauthorized" });
      return;
    }

    try {
      const payload = await readJsonBody(request);
      const execute = () => ingest(payload, options.ingestOptions ?? {});
      const resultPromise = queue.then(execute, execute);
      queue = resultPromise.then(() => undefined, () => undefined);
      const result = await resultPromise;
      json(response, 200, {
        status: result.status,
        sourceFileId: result.sourceFileId,
        messageCount: result.messageCount,
      });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return server;
}

export async function listenCaptureServer(server, port = 43119) {
  const normalized = Number(port);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 65535) {
    throw new Error("capture port must be an integer from 0 to 65535");
  }
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(normalized, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  return typeof address === "object" && address ? address.port : normalized;
}
