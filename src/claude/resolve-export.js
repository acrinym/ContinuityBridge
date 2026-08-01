import { access, mkdtemp, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const CLAUDE_JSON_FILE = /^(?:conversations|claude(?:[_-]conversations)?|chats)(?:-\d+)?\.json$/i;

async function exists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function findClaudeJsonFiles(directory, depth = 0) {
  if (!(await exists(directory)) || depth > 4) return { preferred: [], fallback: [] };
  const entries = await readdir(directory, { withFileTypes: true });
  const preferred = [];
  const fallback = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      if (CLAUDE_JSON_FILE.test(entry.name)) preferred.push(path);
      else fallback.push(path);
    }
    if (entry.isDirectory()) {
      const nested = await findClaudeJsonFiles(path, depth + 1);
      preferred.push(...nested.preferred);
      fallback.push(...nested.fallback);
    }
  }

  const sort = (values) => values.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { preferred: sort(preferred), fallback: sort(fallback) };
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      rejectRun(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} failed (${code}): ${stderr.trim()}`));
    });
  });
}

async function extractZip(zipPath, destination) {
  const attempts =
    process.platform === "win32"
      ? [
          [
            "powershell.exe",
            [
              "-NoProfile",
              "-Command",
              `Expand-Archive -LiteralPath '${zipPath.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`,
            ],
          ],
          ["tar", ["-xf", zipPath, "-C", destination]],
        ]
      : [
          ["unzip", ["-qq", zipPath, "-d", destination]],
          ["tar", ["-xf", zipPath, "-C", destination]],
        ];

  const errors = [];
  for (const [command, args] of attempts) {
    try {
      await run(command, args);
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`unable to extract ${basename(zipPath)}: ${errors.join("; ")}`);
}

function candidatePaths(found) {
  return found.preferred.length > 0 ? found.preferred : found.fallback;
}

export async function resolveClaudeExport(input) {
  const absolute = resolve(input);
  const info = await stat(absolute).catch(() => null);
  if (!info) throw new Error(`export path does not exist: ${absolute}`);

  if (info.isDirectory()) {
    const found = await findClaudeJsonFiles(absolute);
    const conversationPaths = candidatePaths(found);
    if (conversationPaths.length === 0) {
      throw new Error(`no Claude conversation JSON files found under ${absolute}`);
    }
    return { conversationPaths, cleanup: async () => {} };
  }

  if (extname(absolute).toLowerCase() === ".json") {
    return { conversationPaths: [absolute], cleanup: async () => {} };
  }

  if (extname(absolute).toLowerCase() !== ".zip") {
    throw new Error("expected a Claude export ZIP, directory, or conversation JSON file");
  }

  const destination = await mkdtemp(join(tmpdir(), "continuity-bridge-claude-"));
  await extractZip(absolute, destination);
  const found = await findClaudeJsonFiles(destination);
  const conversationPaths = candidatePaths(found);
  if (conversationPaths.length === 0) {
    const { rm } = await import("node:fs/promises");
    await rm(destination, { recursive: true, force: true });
    throw new Error("the ZIP did not contain recognizable Claude conversation JSON files");
  }

  return {
    conversationPaths,
    cleanup: async () => {
      const { rm } = await import("node:fs/promises");
      await rm(destination, { recursive: true, force: true });
    },
  };
}
