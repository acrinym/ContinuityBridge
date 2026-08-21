import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, stat, lstat, readdir, mkdir, rm, copyFile, rename } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 32;
const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;
const SCRYPT_PARAMS = {
  N: 2 ** 14,
  r: 8,
  p: 1,
};

// Split path into components, handling both Unix and Windows separators
function splitPath(path) {
  return path.split(/[/\\]/).filter(Boolean);
}

const SCHEMA_VERSION = "continuity-bridge/encrypted-bundle-v1";
const SCHEMA_FORMAT_VERSION = 1;

// Magic header: "CBX" followed by format version byte
const MAGIC_HEADER = Buffer.from("CBX");
const HEADER_VERSION_OFFSET = MAGIC_HEADER.length;
const HEADER_SALT_OFFSET = HEADER_VERSION_OFFSET + 1;
const HEADER_NONCE_OFFSET = HEADER_SALT_OFFSET + SALT_LENGTH;
const HEADER_TAG_OFFSET = HEADER_NONCE_OFFSET + NONCE_LENGTH;
const HEADER_TOTAL_LENGTH = HEADER_TAG_OFFSET + 16; // 16 bytes for GCM auth tag

// Reserved/unsupported algorithm identifiers
const SUPPORTED_ALGORITHMS = ["aes-256-gcm"];
const SUPPORTED_KDFS = ["scrypt"];

function safeFileName(name) {
  const cleaned = String(name ?? "file")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 140);
  return cleaned || "file";
}

// Validate a path for restore - reject absolute, traversal, special chars, etc.
function validateRestorePath(path, restoreRoot) {
  const errors = [];

  // Check for empty path
  if (!path || path.trim() === "") {
    errors.push("empty path");
    return errors;
  }

  // Check for absolute path
  if (isAbsolute(path)) {
    errors.push(`absolute path not allowed: ${path}`);
  }

  // Check for traversal attempts
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized.includes("..")) {
    errors.push(`traversal not allowed: ${path}`);
  }

  // Check for drive letters (Windows)
  if (/^[a-zA-Z]:/.test(path)) {
    errors.push(`drive letter not allowed: ${path}`);
  }

  // Check for UNC paths
  if (path.startsWith("\\\\") || path.startsWith("//")) {
    errors.push(`UNC path not allowed: ${path}`);
  }

  // Check for NUL and control characters
  if (/[\x00-\x1f]/.test(path)) {
    errors.push(`control characters not allowed: ${path}`);
  }

  // Check for Windows device names
  const deviceNames = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
  const baseName = path.split(/[/\\]/)[0].toUpperCase();
  if (deviceNames.includes(baseName)) {
    errors.push(`Windows device name not allowed: ${path}`);
  }

  // Check for trailing dot or space
  if (path.endsWith(".") || path.endsWith(" ")) {
    errors.push(`trailing dot/space not allowed: ${path}`);
  }

  // Check that resolved path stays within restore root
  const resolvedPath = resolve(restoreRoot, path);
  const resolvedRoot = resolve(restoreRoot);
  if (!resolvedPath.startsWith(resolvedRoot + sep) && resolvedPath !== resolvedRoot) {
    errors.push(`path escapes restore root: ${path}`);
  }

  return errors;
}

// Check for case-insensitive duplicate paths (Windows/macOS case-insensitivity)
function checkCaseCollision(paths) {
  const seen = new Map();
  const errors = [];
  for (const path of paths) {
    const lower = path.toLowerCase().replace(/\\/g, "/");
    if (seen.has(lower)) {
      errors.push(`case-insensitive duplicate: ${path} vs ${seen.get(lower)}`);
    } else {
      seen.set(lower, path);
    }
  }
  return errors;
}

async function hashFile(path) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", rejectHash);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, KEY_LENGTH, SCRYPT_PARAMS);
}

export async function encryptBundle(inputPath, outputPath, passphrase, options = {}) {
  const absoluteInput = resolve(inputPath);
  const absoluteOutput = resolve(outputPath);
  const overwrite = options.overwrite === true;

  // Check if output already exists
  try {
    const outputStat = await stat(absoluteOutput);
    if (outputStat && !overwrite) {
      throw new Error(`output file already exists: ${outputPath}; use --overwrite to replace`);
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
    // ENOENT is fine - file doesn't exist yet
  }

  const inputStat = await stat(absoluteInput);
  const isDirectory = inputStat.isDirectory();

  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const key = deriveKey(passphrase, salt);

  // Use AAD for authenticated header/version
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, nonce);
  const aadHeader = Buffer.concat([MAGIC_HEADER, Buffer.from([SCHEMA_FORMAT_VERSION])]);
  cipher.setAAD(aadHeader);

  const files = [];
  let handoffContent = null;
  let handoffName = null;
  // Store raw binary content, not base64
  const fileContents = {};

  if (isDirectory) {
    const entries = await readdir(absoluteInput, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(absoluteInput, entry.name);

      // Use lstat to detect symlinks
      let entryStat;
      try {
        entryStat = await lstat(entryPath);
      } catch {
        continue;
      }

      // Reject symlinks in source
      if (entryStat.isSymbolicLink()) {
        continue; // Skip symlinks
      }

      // Handle attachments directory specially
      if (entry.name === "attachments" && entry.isDirectory()) {
        const attachmentEntries = await readdir(join(absoluteInput, "attachments"), { withFileTypes: true });
        for (const attFile of attachmentEntries) {
          const attPath = join(absoluteInput, "attachments", attFile.name);
          let attStat;
          try {
            attStat = await lstat(attPath);
          } catch {
            continue;
          }

          if (attStat.isSymbolicLink() || !attStat.isFile()) {
            continue; // Skip symlinks and non-regular files
          }

          const hash = await hashFile(attPath);
          const content = await readFile(attPath);
          // Store raw binary (will be converted to JSON-safe format later)
          fileContents[`attachments/${attFile.name}`] = content;
          files.push({
            relativePath: `attachments/${attFile.name}`,
            sha256: hash,
          });
        }
      }

      // Only process regular files
      if (!entry.isFile()) {
        continue;
      }

      if (entry.name.startsWith("HANDOFF.") && entry.isFile()) {
        const handoffPath = join(absoluteInput, entry.name);
        handoffContent = await readFile(handoffPath, "utf8");
        handoffName = entry.name;
        const hash = await hashFile(handoffPath);
        files.push({
          relativePath: entry.name,
          sha256: hash,
          isHandoff: true,
        });
      } else if (entry.isFile()) {
        const filePath = join(absoluteInput, entry.name);
        const hash = await hashFile(filePath);
        const content = await readFile(filePath);
        fileContents[entry.name] = content;
        files.push({
          relativePath: entry.name,
          sha256: hash,
        });
      }
    }
  } else {
    // Single file - use lstat to check for symlink
    let inputStatCheck;
    try {
      inputStatCheck = await lstat(absoluteInput);
    } catch {
      throw new Error("cannot access input file");
    }

    if (inputStatCheck.isSymbolicLink()) {
      throw new Error("source file is a symlink, refusing to encrypt");
    }

    handoffContent = await readFile(absoluteInput, "utf8");
    handoffName = relative(dirname(absoluteInput), absoluteInput);
    const hash = await hashFile(absoluteInput);
    files.push({
      relativePath: handoffName,
      sha256: hash,
      isHandoff: true,
    });
  }

  // Convert binary contents to base64 for JSON serialization
  const fileContentsBase64 = {};
  for (const [path, content] of Object.entries(fileContents)) {
    fileContentsBase64[path] = content.toString("base64");
  }

  const payload = {
    schema: SCHEMA_VERSION,
    formatVersion: SCHEMA_FORMAT_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    kdf: "scrypt",
    createdAt: new Date().toISOString(),
    handoff: handoffContent,
    handoffName,
    files: files.map((f) => ({
      relativePath: f.relativePath,
      sha256: f.sha256,
      isHandoff: f.isHandoff || false,
    })),
    fileContents: fileContentsBase64,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBuffer = Buffer.from(payloadJson, "utf8");

  const encrypted = Buffer.concat([cipher.update(payloadBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Write header: MAGIC (3) + version (1) + salt (32) + nonce (12) + tag (16)
  const header = Buffer.alloc(HEADER_TOTAL_LENGTH);
  MAGIC_HEADER.copy(header, 0);
  header.writeUInt8(SCHEMA_FORMAT_VERSION, HEADER_VERSION_OFFSET);
  salt.copy(header, HEADER_SALT_OFFSET);
  nonce.copy(header, HEADER_NONCE_OFFSET);
  authTag.copy(header, HEADER_TAG_OFFSET);

  const output = createWriteStream(absoluteOutput);
  output.write(header);
  output.write(encrypted);
  await new Promise((resolve, reject) => {
    output.on("error", reject);
    output.on("finish", resolve);
    output.end();
  });

  return {
    schema: SCHEMA_VERSION,
    outputPath: absoluteOutput,
    fileCount: files.length,
    handoffName,
  };
}

export async function inspectBundle(encryptedPath, passphrase) {
  const absolutePath = resolve(encryptedPath);

  const fileBuffer = await readFile(absolutePath);

  // Check minimum length for new header format
  if (fileBuffer.length < HEADER_TOTAL_LENGTH) {
    throw new Error("invalid encrypted bundle: file too short");
  }

  // Verify magic header
  const fileMagic = fileBuffer.subarray(0, MAGIC_HEADER.length);
  if (!fileMagic.equals(MAGIC_HEADER)) {
    throw new Error("invalid encrypted bundle: not a CBX file or unsupported format");
  }

  const version = fileBuffer.readUInt8(HEADER_VERSION_OFFSET);
  if (version !== SCHEMA_FORMAT_VERSION) {
    throw new Error(`unsupported format version: ${version}; supported version: ${SCHEMA_FORMAT_VERSION}`);
  }

  const salt = fileBuffer.subarray(HEADER_SALT_OFFSET, HEADER_SALT_OFFSET + SALT_LENGTH);
  const nonce = fileBuffer.subarray(HEADER_NONCE_OFFSET, HEADER_NONCE_OFFSET + NONCE_LENGTH);
  const tag = fileBuffer.subarray(HEADER_TAG_OFFSET, HEADER_TAG_OFFSET + 16);
  const ciphertext = fileBuffer.subarray(HEADER_TOTAL_LENGTH);

  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, nonce);
  // Set AAD for authenticated header/version
  const aadHeader = Buffer.concat([MAGIC_HEADER, Buffer.from([version])]);
  decipher.setAAD(aadHeader);
  decipher.setAuthTag(tag);

  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new Error("decryption failed: wrong passphrase or corrupted data");
  }

  let payload;
  try {
    payload = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("invalid bundle: corrupted payload");
  }

  if (payload.schema !== SCHEMA_VERSION) {
    throw new Error(`unsupported bundle schema: ${payload.schema}`);
  }

  // Validate algorithm and KDF
  if (payload.algorithm && !SUPPORTED_ALGORITHMS.includes(payload.algorithm)) {
    throw new Error(`unsupported algorithm: ${payload.algorithm}`);
  }
  if (payload.kdf && !SUPPORTED_KDFS.includes(payload.kdf)) {
    throw new Error(`unsupported KDF: ${payload.kdf}`);
  }

  return {
    schema: payload.schema,
    createdAt: payload.createdAt,
    handoffName: payload.handoffName,
    handoffPreview: payload.handoff
      ? payload.handoff.slice(0, 500) + (payload.handoff.length > 500 ? "..." : "")
      : null,
    files: payload.files.map((f) => ({
      relativePath: f.relativePath,
      sha256: f.sha256,
      isHandoff: f.isHandoff || false,
    })),
    fileCount: payload.files.length,
  };
}

export async function restoreBundle(encryptedPath, outputPath, passphrase, options = {}) {
  const absoluteInput = resolve(encryptedPath);
  const absoluteOutput = resolve(outputPath);
  const overwrite = options.overwrite === true;

  const fileBuffer = await readFile(absoluteInput);

  // Check minimum length for new header format
  if (fileBuffer.length < HEADER_TOTAL_LENGTH) {
    throw new Error("invalid encrypted bundle: file too short");
  }

  // Verify magic header
  const fileMagic = fileBuffer.subarray(0, MAGIC_HEADER.length);
  if (!fileMagic.equals(MAGIC_HEADER)) {
    throw new Error("invalid encrypted bundle: not a CBX file or unsupported format");
  }

  const version = fileBuffer.readUInt8(HEADER_VERSION_OFFSET);
  if (version !== SCHEMA_FORMAT_VERSION) {
    throw new Error(`unsupported format version: ${version}; supported version: ${SCHEMA_FORMAT_VERSION}`);
  }

  const salt = fileBuffer.subarray(HEADER_SALT_OFFSET, HEADER_SALT_OFFSET + SALT_LENGTH);
  const nonce = fileBuffer.subarray(HEADER_NONCE_OFFSET, HEADER_NONCE_OFFSET + NONCE_LENGTH);
  const tag = fileBuffer.subarray(HEADER_TAG_OFFSET, HEADER_TAG_OFFSET + 16);
  const ciphertext = fileBuffer.subarray(HEADER_TOTAL_LENGTH);

  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, nonce);
  // Set AAD for authenticated header/version
  const aadHeader = Buffer.concat([MAGIC_HEADER, Buffer.from([version])]);
  decipher.setAAD(aadHeader);
  decipher.setAuthTag(tag);

  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new Error("decryption failed: wrong passphrase or tampered data");
  }

  let payload;
  try {
    payload = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("invalid bundle: corrupted payload");
  }

  if (payload.schema !== SCHEMA_VERSION) {
    throw new Error(`unsupported bundle schema: ${payload.schema}`);
  }

  // Validate algorithm and KDF
  if (payload.algorithm && !SUPPORTED_ALGORITHMS.includes(payload.algorithm)) {
    throw new Error(`unsupported algorithm: ${payload.algorithm}`);
  }
  if (payload.kdf && !SUPPORTED_KDFS.includes(payload.kdf)) {
    throw new Error(`unsupported KDF: ${payload.kdf}`);
  }

  // === PREFLIGHT VALIDATION ===
  const preflightErrors = [];

  // 1. Validate all paths before any mutation
  const pathsToRestore = [];
  for (const file of payload.files) {
    const pathErrors = validateRestorePath(file.relativePath, absoluteOutput);
    preflightErrors.push(...pathErrors.map((e) => `${file.relativePath}: ${e}`));
    pathsToRestore.push(file.relativePath);
  }

  // 2. Check for case-insensitive duplicates
  const caseErrors = checkCaseCollision(pathsToRestore);
  preflightErrors.push(...caseErrors);

  // 3. Check for duplicate paths in manifest
  const seenPaths = new Set();
  for (const file of payload.files) {
    if (seenPaths.has(file.relativePath)) {
      preflightErrors.push(`duplicate path in manifest: ${file.relativePath}`);
    }
    seenPaths.add(file.relativePath);
  }

  // If there are preflight errors, abort before any mutation
  if (preflightErrors.length > 0) {
    throw new Error(`preflight validation failed:\n  - ${preflightErrors.join("\n  - ")}`);
  }

  // 4. Check for existing files and validate ALL path components (TOCTOU fix)
  // We must check every ancestor component, not just the final target
  const existingFiles = [];
  for (const file of payload.files) {
    const targetPath = join(absoluteOutput, file.relativePath);
    // Only split the relative part from absoluteOutput, not the full path
    const relativePath = file.relativePath;
    const pathParts = relativePath.split(/[/\\]/).filter(Boolean);

    // Check every component of the path for symlinks
    let checkPath = absoluteOutput;
    for (let i = 0; i < pathParts.length; i++) {
      checkPath = join(checkPath, pathParts[i]);
      try {
        const componentStat = await lstat(checkPath);
        // Check if it's a symlink - reject
        if (componentStat.isSymbolicLink()) {
          throw new Error(`path component is a symlink: ${pathParts.slice(0, i + 1).join("/")}`);
        }
        // If this is the final component and it's a file
        if (i === pathParts.length - 1 && componentStat.isFile()) {
          if (!overwrite) {
            existingFiles.push(file.relativePath);
          }
        }
      } catch (err) {
        if (err.code !== "ENOENT") {
          throw err;
        }
        // ENOENT is fine - path component doesn't exist yet
      }
    }
  }

  if (existingFiles.length > 0 && !overwrite) {
    throw new Error(`existing files would be overwritten: ${existingFiles.join(", ")}; use --overwrite to replace`);
  }

  // === STAGING AND WRITE ===
  // Create a staging directory first, write there, then atomically move
  const stagingDir = absoluteOutput + ".staging." + randomBytes(8).toString("hex");

  try {
    // First, validate restore root is not a symlink (if it exists)
    try {
      const rootStat = await lstat(absoluteOutput);
      if (rootStat.isSymbolicLink()) {
        throw new Error("restore root is a symlink, refusing to restore");
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
      // ENOENT is fine - restore root doesn't exist yet
    }

    // Create staging directory
    await mkdir(stagingDir, { recursive: true });

    const restored = [];
    const restoreErrors = [];

    for (const file of payload.files) {
      let content = null;

      // First check if we have stored content in the payload
      if (payload.fileContents && payload.fileContents[file.relativePath]) {
        content = Buffer.from(payload.fileContents[file.relativePath], "base64");
      } else if (file.isHandoff && payload.handoff) {
        content = Buffer.from(payload.handoff, "utf8");
      }

      if (!content) {
        restoreErrors.push(`${file.relativePath}: source file not found in bundle`);
        continue;
      }

      // Verify content hash BEFORE writing
      const contentHash = createHash("sha256").update(content).digest("hex");
      if (contentHash !== file.sha256) {
        restoreErrors.push(`${file.relativePath}: hash mismatch (authenticated data corrupted)`);
        continue;
      }

      // === TOCTOU FIX: Re-validate path components before write ===
      // Check every ancestor component again for symlinks before writing
      const targetPath = join(absoluteOutput, file.relativePath);
      // Only split the relative part from absoluteOutput, not the full path
      const relativePath = file.relativePath;
      const pathParts = relativePath.split(/[/\\]/).filter(Boolean);
      let checkPath = absoluteOutput;
      for (let i = 0; i < pathParts.length; i++) {
        checkPath = join(checkPath, pathParts[i]);
        try {
          const componentStat = await lstat(checkPath);
          if (componentStat.isSymbolicLink()) {
            restoreErrors.push(`${file.relativePath}: path component became a symlink, aborting restore`);
            continue;
          }
        } catch (err) {
          if (err.code !== "ENOENT") {
            throw err;
          }
        }
      }

      // Write to STAGING directory, not directly to target
      const stagingPath = join(stagingDir, file.relativePath);
      const stagingDirPath = dirname(stagingPath);
      await mkdir(stagingDirPath, { recursive: true });
      await writeFile(stagingPath, content);

      restored.push({
        relativePath: file.relativePath,
        sha256: contentHash,
        stagingPath,
      });
    }

    // === ATOMIC MOVE: Move staging to final destination ===
    // Only do this if no errors occurred
    if (restoreErrors.length === 0) {
      // Final check: verify output root still not a symlink (if it exists)
      try {
        const finalRootCheck = await lstat(absoluteOutput);
        if (finalRootCheck.isSymbolicLink()) {
          throw new Error("restore root became a symlink, aborting");
        }
      } catch (err) {
        if (err.code !== "ENOENT") {
          throw err;
        }
        // ENOENT is fine - restore root doesn't exist yet
      }

      // Move files from staging to final destination
      for (const file of restored) {
        const targetPath = join(absoluteOutput, file.relativePath);

        // Verify target directory components still not symlinks
        // Only split the relative part from absoluteOutput, not the full path
        const relativePath = file.relativePath;
        const pathParts = relativePath.split(/[/\\]/).filter(Boolean);
        let checkPath = absoluteOutput;
        for (let i = 0; i < pathParts.length - 1; i++) {
          checkPath = join(checkPath, pathParts[i]);
          try {
            const componentStat = await lstat(checkPath);
            if (componentStat.isSymbolicLink()) {
              throw new Error(`directory became a symlink during restore: ${pathParts.slice(0, i + 1).join("/")}`);
            }
          } catch (err) {
            if (err.code !== "ENOENT") {
              throw err;
            }
          }
        }

        // Atomic rename (fails if target exists on POSIX, but we handle overwrite above)
        await mkdir(dirname(targetPath), { recursive: true });
        await rename(file.stagingPath, targetPath);
      }
    }

    // Clean up staging directory
    await rm(stagingDir, { recursive: true, force: true });

    return {
      schema: payload.schema,
      createdAt: payload.createdAt,
      handoffName: payload.handoffName,
      restoredCount: restored.length,
      errors: restoreErrors,
    };
  } catch (stagingError) {
    // Clean up staging directory on error
    try {
      await rm(stagingDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw stagingError;
  }
}

export { SCHEMA_VERSION };
