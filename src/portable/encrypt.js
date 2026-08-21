import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, stat, lstat, readdir, mkdir, rm, copyFile, rename } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

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
// Format version 2: binary streaming format (no base64 JSON amplification)
// Version 1: legacy base64 JSON format (deprecated)
const SCHEMA_FORMAT_VERSION = 2;

// Magic header: "CBX" followed by format version byte
const MAGIC_HEADER = Buffer.from("CBX");
const HEADER_VERSION_OFFSET = MAGIC_HEADER.length;
const HEADER_SALT_OFFSET = HEADER_VERSION_OFFSET + 1;
const HEADER_NONCE_OFFSET = HEADER_SALT_OFFSET + SALT_LENGTH;
const HEADER_TAG_OFFSET = HEADER_NONCE_OFFSET + NONCE_LENGTH;
const HEADER_MANIFEST_SIZE_OFFSET = HEADER_TAG_OFFSET + 16; // 16 bytes for GCM auth tag
const HEADER_TOTAL_LENGTH = HEADER_MANIFEST_SIZE_OFFSET + 4; // 4 bytes for manifest size (version 2+)

// Reserved/unsupported algorithm identifiers
const SUPPORTED_ALGORITHMS = ["aes-256-gcm"];
const SUPPORTED_KDFS = ["scrypt"];

// Recursively scan directory for all files, building manifest with hashes and sizes
// This is bounded-memory: only stores metadata, not file contents
async function scanDirectoryRecursive(basePath, relativePath = "") {
  const files = [];
  const entries = await readdir(basePath, { withFileTypes: true });
  
  for (const entry of entries) {
    const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const entryAbsPath = join(basePath, entry.name);
    
    // Use lstat to detect symlinks
    let entryStat;
    try {
      entryStat = await lstat(entryAbsPath);
    } catch {
      continue; // Skip inaccessible entries
    }
    
    // Reject symlinks - must throw error, not skip silently
    if (entryStat.isSymbolicLink()) {
      throw new Error(`source contains symbolic link: ${entryRelPath}; symlinks are not allowed in encrypted bundles`);
    }
    
    // Handle directories recursively (not just attachments/)
    if (entry.isDirectory()) {
      const subFiles = await scanDirectoryRecursive(entryAbsPath, entryRelPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      // For files, compute hash and size using streaming (bounded memory)
      const hash = createHash("sha256");
      let size = 0;
      
      const stream = createReadStream(entryAbsPath);
      for await (const chunk of stream) {
        hash.update(chunk);
        size += chunk.length;
      }
      
      files.push({
        relativePath: entryRelPath,
        sha256: hash.digest("hex"),
        size,
        isHandoff: entry.name.startsWith("HANDOFF."),
      });
    }
    // Skip other types (devices, sockets, etc.)
  }
  
  return files;
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

// Recursive helper to read file contents and build combined binary payload
// ALL file content goes in the binary section - NOT in the JSON manifest
// This ensures JSON parsing works correctly after decryption
async function createFilePayloadStream(basePath, files, handoffContent) {
  const chunks = [];
  const fileOrder = [];
  let currentOffset = 0;
  
  const filesWithOffsets = [];
  
  for (const file of files) {
    let content;
    
    if (file.isHandoff && handoffContent) {
      // Handoff content goes in binary section too (not in JSON)
      content = Buffer.from(handoffContent, "utf8");
    } else {
      // Read file content
      const filePath = join(basePath, file.relativePath);
      content = await readFile(filePath);
    }
    
    const offset = currentOffset;
    chunks.push(content);
    currentOffset += content.length;
    
    filesWithOffsets.push({
      relativePath: file.relativePath,
      sha256: file.sha256,
      isHandoff: file.isHandoff,
      offset: offset,
      length: content.length,
    });
    fileOrder.push(file.relativePath);
  }
  
  return { chunks, filesWithOffsets, fileOrder };
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

  // Pre-scan all files recursively to build manifest (bounded memory - only metadata)
  let scannedFiles = [];
  let handoffContent = null;
  let handoffName = null;
  
  if (isDirectory) {
    // Recursively scan all files - throws on symlinks
    scannedFiles = await scanDirectoryRecursive(absoluteInput);
    
    // Separate handoff files
    const handoffFiles = scannedFiles.filter(f => f.isHandoff);
    const attachmentFiles = scannedFiles.filter(f => !f.isHandoff);
    
    // Get handoff content
    if (handoffFiles.length > 0) {
      const handoffFile = handoffFiles[0];
      handoffName = handoffFile.relativePath;
      handoffContent = await readFile(join(absoluteInput, handoffName), "utf8");
    }
  } else {
    // Single file - check for symlink and reject
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
    // Compute hash using streaming (bounded memory)
    const hash = createHash("sha256");
    const stream = createReadStream(absoluteInput);
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    const contentHash = hash.digest("hex");
    
    scannedFiles = [{
      relativePath: handoffName,
      sha256: contentHash,
      isHandoff: true,
      size: Buffer.byteLength(handoffContent, "utf8"),
    }];
  }

  if (scannedFiles.length === 0) {
    throw new Error("no files to encrypt in input");
  }

  // Create encryption key
  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const key = deriveKey(passphrase, salt);

  // Use AAD for authenticated header/version
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, nonce);
  const aadHeader = Buffer.concat([MAGIC_HEADER, Buffer.from([SCHEMA_FORMAT_VERSION])]);
  cipher.setAAD(aadHeader);

  // Build manifest JSON
  // We need to pre-calculate offsets, so read file contents into chunks
  const { chunks, filesWithOffsets, fileOrder } = await createFilePayloadStream(
    absoluteInput, 
    scannedFiles, 
    handoffContent
  );

  // Build manifest JSON (no file contents - just metadata + offsets)
  // Note: handoff content is in the binary section, not in JSON
  // This ensures JSON is always valid and separable from binary data
  const payload = {
    schema: SCHEMA_VERSION,
    formatVersion: SCHEMA_FORMAT_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    kdf: "scrypt",
    createdAt: new Date().toISOString(),
    handoffName,
    files: filesWithOffsets,
    fileOrder: fileOrder,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadJsonBuffer = Buffer.from(payloadJson, "utf8");
  
  // Create length-prefixed manifest: 4-byte length + JSON
  // This allows the decryptor to find where JSON ends
  const manifestLengthBuffer = Buffer.alloc(4);
  manifestLengthBuffer.writeUInt32LE(payloadJsonBuffer.length, 0);
  const manifestBuffer = Buffer.concat([manifestLengthBuffer, payloadJsonBuffer]);

  // Create combined plaintext: manifest + all file contents
  // This ensures ALL bytes are encrypted together
  const fileDataBuffer = Buffer.concat(chunks);
  const combinedPlaintext = Buffer.concat([manifestBuffer, fileDataBuffer]);

  // Encrypt ALL the data together (manifest + file bytes)
  const encrypted = Buffer.concat([cipher.update(combinedPlaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Write header: MAGIC (3) + version (1) + salt (32) + nonce (12) + tag (16) + manifestSize (4)
  // Note: manifestSize is now the size of the encrypted payload (which contains manifest + file data)
  const header = Buffer.alloc(HEADER_TOTAL_LENGTH);
  MAGIC_HEADER.copy(header, 0);
  header.writeUInt8(SCHEMA_FORMAT_VERSION, HEADER_VERSION_OFFSET);
  salt.copy(header, HEADER_SALT_OFFSET);
  nonce.copy(header, HEADER_NONCE_OFFSET);
  authTag.copy(header, HEADER_TAG_OFFSET);
  header.writeUInt32LE(encrypted.length, HEADER_MANIFEST_SIZE_OFFSET);

  // Write: header + encrypted (manifest + all file bytes)
  // This ensures ALL payload bytes are encrypted and authenticated
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
    fileCount: scannedFiles.length,
    handoffName,
  };
}

export async function inspectBundle(encryptedPath, passphrase) {
  const absolutePath = resolve(encryptedPath);

  const fileBuffer = await readFile(absolutePath);

  // Check minimum length for header format
  if (fileBuffer.length < HEADER_TOTAL_LENGTH) {
    throw new Error("invalid encrypted bundle: file too short");
  }

  // Verify magic header
  const fileMagic = fileBuffer.subarray(0, MAGIC_HEADER.length);
  if (!fileMagic.equals(MAGIC_HEADER)) {
    throw new Error("invalid encrypted bundle: not a CBX file or unsupported format");
  }

  const version = fileBuffer.readUInt8(HEADER_VERSION_OFFSET);
  // Support both version 1 (legacy base64) and version 2+ (binary streaming)
  if (version > SCHEMA_FORMAT_VERSION) {
    throw new Error(`unsupported format version: ${version}; supported versions: 1-${SCHEMA_FORMAT_VERSION}`);
  }

  const salt = fileBuffer.subarray(HEADER_SALT_OFFSET, HEADER_SALT_OFFSET + SALT_LENGTH);
  const nonce = fileBuffer.subarray(HEADER_NONCE_OFFSET, HEADER_NONCE_OFFSET + NONCE_LENGTH);
  const tag = fileBuffer.subarray(HEADER_TAG_OFFSET, HEADER_TAG_OFFSET + 16);
  
  let ciphertext;
  
  if (version >= 2) {
    // Version 2+: All data (manifest + file bytes) is in the encrypted payload
    const manifestSize = fileBuffer.readUInt32LE(HEADER_MANIFEST_SIZE_OFFSET);
    const ciphertextEnd = HEADER_TOTAL_LENGTH + manifestSize;
    ciphertext = fileBuffer.subarray(HEADER_TOTAL_LENGTH, ciphertextEnd);
  } else {
    // Version 1: all ciphertext (legacy base64 format)
    ciphertext = fileBuffer.subarray(HEADER_TOTAL_LENGTH);
  }

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

  // Parse length-prefixed manifest
  let payload;
  try {
    if (version >= 2) {
      // Read 4-byte length prefix to find where JSON ends
      if (plaintext.length < 4) {
        throw new Error("invalid bundle: payload too short");
      }
      const jsonLength = plaintext.readUInt32LE(0);
      const jsonEnd = 4 + jsonLength;
      if (jsonEnd > plaintext.length) {
        throw new Error("invalid bundle: manifest length exceeds payload");
      }
      const jsonStr = plaintext.toString("utf8", 4, jsonEnd);
      payload = JSON.parse(jsonStr);
    } else {
      // Version 1: legacy format without length prefix
      payload = JSON.parse(plaintext.toString("utf8"));
    }
  } catch (e) {
    if (e.message.includes("manifest length")) {
      throw e;
    }
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

  // Return file info (not contents) - use offset/length for version 2+
  // For new format (v2+), all data is in the decrypted payload
  // Compute where file data starts in the plaintext
  let fileDataOffset = 0;
  let handoffContent = null;
  let jsonLength = 0;
  
  if (version >= 2) {
    // Get JSON length from the 4-byte prefix
    jsonLength = plaintext.readUInt32LE(0);
    // File data starts after: 4-byte length + JSON
    fileDataOffset = 4 + jsonLength;
    
    // Extract handoff content from binary section if present
    const handoffFile = payload.files?.find(f => f.isHandoff);
    if (handoffFile && handoffFile.offset >= 0) {
      const actualOffset = fileDataOffset + handoffFile.offset;
      const handoffEnd = actualOffset + handoffFile.length;
      if (handoffEnd <= plaintext.length) {
        handoffContent = plaintext.toString("utf8", actualOffset, handoffEnd);
      }
    }
  }
  
  return {
    schema: payload.schema,
    formatVersion: version,
    createdAt: payload.createdAt,
    handoffName: payload.handoffName,
    handoffPreview: handoffContent
      ? handoffContent.slice(0, 500) + (handoffContent.length > 500 ? "..." : "")
      : null,
    files: payload.files.map((f) => ({
      relativePath: f.relativePath,
      sha256: f.sha256,
      isHandoff: f.isHandoff || false,
      // Version 2+ includes offset/length for streaming
      offset: f.offset,
      length: f.length,
    })),
    fileCount: payload.files.length,
    _plaintext: plaintext, // Internal: for restoreBundle - contains both manifest and file data
    _fileDataOffset: fileDataOffset, // Offset where file data starts in plaintext
  };
}

export async function restoreBundle(encryptedPath, outputPath, passphrase, options = {}) {
  const absoluteInput = resolve(encryptedPath);
  const absoluteOutput = resolve(outputPath);
  const overwrite = options.overwrite === true;

  const fileBuffer = await readFile(absoluteInput);

  // Check minimum length for header format
  if (fileBuffer.length < HEADER_TOTAL_LENGTH) {
    throw new Error("invalid encrypted bundle: file too short");
  }

  // Verify magic header
  const fileMagic = fileBuffer.subarray(0, MAGIC_HEADER.length);
  if (!fileMagic.equals(MAGIC_HEADER)) {
    throw new Error("invalid encrypted bundle: not a CBX file or unsupported format");
  }

  const version = fileBuffer.readUInt8(HEADER_VERSION_OFFSET);
  // Support both version 1 (legacy base64) and version 2+ (binary streaming)
  if (version > SCHEMA_FORMAT_VERSION) {
    throw new Error(`unsupported format version: ${version}; supported versions: 1-${SCHEMA_FORMAT_VERSION}`);
  }

  const salt = fileBuffer.subarray(HEADER_SALT_OFFSET, HEADER_SALT_OFFSET + SALT_LENGTH);
  const nonce = fileBuffer.subarray(HEADER_NONCE_OFFSET, HEADER_NONCE_OFFSET + NONCE_LENGTH);
  const tag = fileBuffer.subarray(HEADER_TAG_OFFSET, HEADER_TAG_OFFSET + 16);
  
  let ciphertext;
  
  if (version >= 2) {
    // Version 2+: All data (manifest + file bytes) is in the encrypted payload
    const manifestSize = fileBuffer.readUInt32LE(HEADER_MANIFEST_SIZE_OFFSET);
    const ciphertextEnd = HEADER_TOTAL_LENGTH + manifestSize;
    ciphertext = fileBuffer.subarray(HEADER_TOTAL_LENGTH, ciphertextEnd);
  } else {
    // Version 1: all ciphertext (legacy base64 format)
    ciphertext = fileBuffer.subarray(HEADER_TOTAL_LENGTH);
  }

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

  // Parse length-prefixed manifest
  let payload;
  try {
    if (version >= 2) {
      // Read 4-byte length prefix to find where JSON ends
      if (plaintext.length < 4) {
        throw new Error("invalid bundle: payload too short");
      }
      const jsonLength = plaintext.readUInt32LE(0);
      const jsonEnd = 4 + jsonLength;
      if (jsonEnd > plaintext.length) {
        throw new Error("invalid bundle: manifest length exceeds payload");
      }
      const jsonStr = plaintext.toString("utf8", 4, jsonEnd);
      payload = JSON.parse(jsonStr);
    } else {
      // Version 1: legacy format without length prefix
      payload = JSON.parse(plaintext.toString("utf8"));
    }
  } catch (e) {
    if (e.message.includes("manifest length")) {
      throw e;
    }
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

  // Calculate total file data size for version 2+ to locate file data in plaintext
  const totalFileDataSize = version >= 2
    ? (payload.files || []).filter(f => f.offset >= 0).reduce((sum, f) => sum + (f.length || 0), 0)
    : 0;

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

    // Calculate fileDataOffset for version 2+
    const fileDataOffset = version >= 2 ? (4 + plaintext.readUInt32LE(0)) : 0;
    
    for (const file of payload.files) {
      let content = null;

      // Version 2+: Read from decrypted plaintext using offset/length
      // All files (including handoff) are stored in the binary section
      if (version >= 2 && plaintext) {
        const offset = file.offset;
        const length = file.length || 0;
        
        if (offset !== undefined && offset >= 0 && length > 0) {
          // File data is in the plaintext after the manifest
          // Calculate actual offset: fileDataOffset + file.offset
          const actualOffset = fileDataOffset + offset;
          if (actualOffset + length <= plaintext.length) {
            content = plaintext.subarray(actualOffset, actualOffset + length);
          }
        }
      } else if (payload.fileContents && payload.fileContents[file.relativePath]) {
        // Version 1: Legacy base64 format
        content = Buffer.from(payload.fileContents[file.relativePath], "base64");
      } else if (file.isHandoff && payload.handoff) {
        // Fallback for legacy format
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
