import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

function runGit(args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("git", args, {
      cwd,
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
    child.once("error", rejectRun);
    child.once("close", (code) => {
      if (code !== 0) {
        rejectRun(new Error(`git ${args.join(" ")} failed: ${stderr.trim() || `exit ${code}`}`));
        return;
      }
      resolveRun(stdout.trim());
    });
  });
}

function scrubRemote(remote) {
  const value = String(remote ?? "").trim();
  if (!/^https?:\/\//i.test(value)) return value || null;
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/^(https?:\/\/)[^/@]+@/i, "$1");
  }
}

export function sanitizeRepositoryReference(reference) {
  const value = String(reference ?? "").trim();
  if (!value) return null;
  if (/^#\d+$/.test(value)) return value;
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.replace(/^(https?:\/\/)[^/@]+@/i, "$1").replace(/[?#].*$/, "");
  }
}

export async function repositoryCoordinates(path = process.cwd(), options = {}) {
  const cwd = resolve(path);
  let root;
  try {
    root = await runGit(["rev-parse", "--show-toplevel"], cwd);
  } catch (error) {
    if (options.optional) return null;
    throw new Error(`not a Git repository: ${cwd} (${error.message})`);
  }

  const [head, branch, status] = await Promise.all([
    runGit(["rev-parse", "HEAD"], root),
    runGit(["branch", "--show-current"], root),
    runGit(["status", "--porcelain"], root),
  ]);

  let remote = null;
  try {
    remote = scrubRemote(await runGit(["remote", "get-url", "origin"], root));
  } catch {
    remote = null;
  }

  const coordinates = {
    name: basename(root),
    remote,
    branch: branch || null,
    head,
    dirty: status.length > 0,
  };
  if (options.includeLocalPath) coordinates.localPath = root;
  return coordinates;
}
