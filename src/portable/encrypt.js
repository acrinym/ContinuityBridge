import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, stat, lstat, readdir, mkdir, rm, copyFile, rename, unlink, open } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

// Maximum manifest size to prevent DoS (1MB)
const MAX_MANIFEST_SIZE = 1024 * 1024;
// Maximum passphrase size (1KB)
const MAX_PASSPHRASE_SIZE = 1024;

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 32;
const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;
const BUNDLE_ID_LENGTH = 16;
const CREATED_AT_LENGTH = 8;
const CIPHER_TEXT_LENGTH_LENGTH = 8;
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
// Format version 2: streamable binary format with fixed header
// Version 1: legacy base64 JSON format (deprecated)
const SCHEMA_FORMAT_VERSION = 2;

// Fixed header layout (used as AAD for GCM):
// [Magic: 3B][Version: 1B][Salt: 32B][Nonce: 12B][BundleID: 16B][CreatedAt: 8B][CiphertextLength: 8B]
// Total: 80 bytes
const MAGIC_HEADER = Buffer.from("CBX");
const HEADER_VERSION_OFFSET = MAGIC_HEADER.length;
const HEADER_SALT_OFFSET = HEADER_VERSION_OFFSET + 1;
const HEADER_NONCE_OFFSET = HEADER_SALT_OFFSET + SALT_LENGTH;
const HEADER_BUNDLE_ID_OFFSET = HEADER_NONCE_OFFSET + NONCE_LENGTH;
const HEADER_CREATED_AT_OFFSET = HEADER_BUNDLE_ID_OFFSET + BUNDLE_ID_LENGTH;
const HEADER_CIPHERTEXT_LENGTH_OFFSET = HEADER_CREATED_AT_OFFSET + CREATED_AT_LENGTH;
const HEADER_TOTAL_LENGTH = HEADER_CIPHERTEXT_LENGTH_OFFSET + CIPHER_TEXT_LENGTH_LENGTH;

// GCM authentication tag is 16 bytes, appended after ciphertext
const AUTH_TAG_LENGTH = 16;

// Reserved/unsupported algorithm identifiers
const SUPPORTED_ALGORITHMS = ["aes-256-gcm"];
const SUPPORTED_KDFS = ["scrypt"];

// Validate a source path for portability - reject non-portable paths before bundle creation
function validatePortablePath(relativePath) {
  const errors = [];

  // Check for empty path
  if (!relativePath || relativePath.trim() === "") {
    errors.push("empty path");
    return errors;
  }

  // Check for absolute path
  if (isAbsolute(relativePath)) {
    errors.push(`absolute path not allowed: ${relativePath}`);
  }

  // Check for traversal attempts
  const normalized = relativePath.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (normalized.includes("..")) {
    errors.push(`traversal not allowed: ${relativePath}`);
  }

  // Check for drive letters (Windows)
  if (/^[a-zA-Z]:/.test(relativePath)) {
    errors.push(`drive letter not allowed: ${relativePath}`);
  }

  // Check for UNC paths
  if (relativePath.startsWith("\\\\") || relativePath.startsWith("//")) {
    errors.push(`UNC path not allowed: ${relativePath}`);
  }

  // Check for backslash (not portable)
  if (relativePath.includes("\\")) {
    errors.push(`backslash not allowed in path: ${relativePath}`);
  }

  // Check for NUL and control characters
  if (/[\x00-\x1f]/.test(relativePath)) {
    errors.push(`control characters not allowed: ${relativePath}`);
  }

  // Check for Windows-invalid characters
  if (/[<>:"|?*]/.test(relativePath)) {
    errors.push(`Windows-invalid characters not allowed: ${relativePath}`);
  }

  // Check for Windows device names in any component
  const components = relativePath.split(/[/\\]/).filter(Boolean);
  const deviceNames = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
  for (const comp of components) {
    const baseName = comp.split(".")[0].toUpperCase();
    if (deviceNames.includes(baseName)) {
      errors.push(`Windows device name not allowed: ${relativePath}`);
      break;
    }
  }

  // Check for trailing dot or space in any component
  for (const comp of components) {
    if (comp.endsWith(".") || comp.endsWith(" ")) {
      errors.push(`trailing dot/space not allowed in component: ${relativePath}`);
      break;
    }
  }

  // Check for . or .. as a component
  if (components.includes(".") || components.includes("..")) {
    errors.push(`. or .. components not allowed: ${relativePath}`);
  }

  return errors;
}

// Recursively scan directory for all files, building manifest with hashes and sizes
// This is bounded-memory: only stores metadata, not file contents
async function scanDirectoryRecursive(basePath, relativePath = "") {
  const files = [];
  const entries = await readdir(basePath, { withFileTypes: true });
  
  for (const entry of entries) {
    const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const entryAbsPath = join(basePath, entry.name);
    
    // Validate portable path BEFORE processing
    const pathErrors = validatePortablePath(entryRelPath);
    if (pathErrors.length > 0) {
      throw new Error(`source contains non-portable path: ${entryRelPath}; ${pathErrors.join(", ")}`);
    }
    
    // Use lstat to detect symlinks
    let entryStat;
    try {
      entryStat = await lstat(entryAbsPath);
    } catch {
      throw new Error(`source contains inaccessible entry: ${entryRelPath}; cannot access this entry`);
    }
    
    // Reject symlinks - must throw error, not skip silently
    if (entryStat.isSymbolicLink()) {
      throw new Error(`source contains symbolic link: ${entryRelPath}; symlinks are not allowed in encrypted bundles`);
    }
    
    // Reject special entries (devices, sockets, FIFOs, etc.) - must throw error, not skip silently
    if (entry.isBlockDevice() || entry.isCharacterDevice() || entry.isFIFO() || entry.isSocket()) {
      throw new Error(`source contains special entry: ${entryRelPath}; special files (devices, sockets, FIFOs) are not allowed in encrypted bundles`);
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
    } else {
      // Unknown entry type - throw error
      throw new Error(`source contains unknown entry type: ${entryRelPath}; only regular files and directories are allowed`);
    }
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

// Calculate file offsets based on pre-scanned sizes (bounded memory - only metadata)
function calculateFileOffsets(files, handoffContent) {
  const filesWithOffsets = [];
  const fileOrder = [];
  let currentOffset = 0;
  
  for (const file of files) {
    // Get content size: either from handoffContent or use scanned size
    let contentSize;
    if (file.isHandoff && handoffContent) {
      contentSize = Buffer.byteLength(handoffContent, "utf8");
    } else {
      contentSize = file.size || 0;
    }
    
    filesWithOffsets.push({
      relativePath: file.relativePath,
      sha256: file.sha256,
      isHandoff: file.isHandoff,
      offset: currentOffset,
      length: contentSize,
    });
    fileOrder.push(file.relativePath);
    currentOffset += contentSize;
  }
  
  return { filesWithOffsets, fileOrder, totalFileDataSize: currentOffset };
}

export async function encryptBundle(inputPath, outputPath, passphrase, options = {}) {
  const absoluteInput = resolve(inputPath);
  const absoluteOutput = resolve(outputPath);
  const overwrite = options.overwrite === true;

  // === STEP 1: Check root input with lstat FIRST (before any stat/traversal) ===
  let inputStat;
  try {
    inputStat = await lstat(absoluteInput);
  } catch {
    throw new Error("cannot access input: does not exist or is inaccessible");
  }

  // Reject root symlink-to-directory - must be actual directory, not symlink
  if (inputStat.isSymbolicLink()) {
    throw new Error("source root is a symlink; symlinks are not allowed in encrypted bundles");
  }

  // Reject special files at root
  if (!inputStat.isFile() && !inputStat.isDirectory()) {
    throw new Error("source must be a regular file or directory, not a special file");
  }

  const isDirectory = inputStat.isDirectory();

  // === STEP 2: Check output file existence ===
  // For overwrite, we'll use sibling backup strategy - don't delete old file first
  if (!overwrite) {
    try {
      const outputStat = await stat(absoluteOutput);
      if (outputStat) {
        throw new Error(`output file already exists: ${outputPath}; use --overwrite to replace`);
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
      // ENOENT is fine - file doesn't exist yet
    }
  }

  // === STEP 3: Pre-scan all files recursively to build manifest (bounded memory - only metadata) ===
  let scannedFiles = [];
  let handoffName = null;
  // Track the base path for file streaming - for directories it's the directory itself, for single files it's the parent dir
  const basePath = isDirectory ? absoluteInput : dirname(absoluteInput);
  
  if (isDirectory) {
    // Recursively scan all files - throws on symlinks and validates portable paths
    scannedFiles = await scanDirectoryRecursive(absoluteInput);
    
    // Find handoff files - require EXACTLY ONE unambiguous handoff
    const handoffFiles = scannedFiles.filter(f => f.isHandoff);
    
    if (handoffFiles.length === 0) {
      throw new Error("source directory must contain exactly one handoff file (HANDOFF.md, HANDOFF.json, or HANDOFF.*)");
    }
    if (handoffFiles.length > 1) {
      throw new Error(`source directory contains multiple handoff files: ${handoffFiles.map(f => f.relativePath).join(", ")}; exactly one is required`);
    }
    
    // Single unambiguous handoff
    handoffName = handoffFiles[0].relativePath;
  } else {
    // Single file - treat as handoff (no need to read into memory yet)
    // Validate portable path
    const pathErrors = validatePortablePath(relative(dirname(absoluteInput), absoluteInput));
    if (pathErrors.length > 0) {
      throw new Error(`source file has non-portable path: ${pathErrors.join(", ")}`);
    }

    handoffName = relative(dirname(absoluteInput), absoluteInput);
    
    // Pre-scan hash and size using streaming (bounded memory)
    const hash = createHash("sha256");
    let size = 0;
    const stream = createReadStream(absoluteInput);
    for await (const chunk of stream) {
      hash.update(chunk);
      size += chunk.length;
    }
    
    scannedFiles = [{
      relativePath: handoffName,
      sha256: hash.digest("hex"),
      isHandoff: true,
      size,
    }];
  }

  if (scannedFiles.length === 0) {
    throw new Error("no files to encrypt in input");
  }

  // === STEP 4: Prepare encryption parameters ===
  const createdAt = BigInt(Date.now());
  const bundleId = randomBytes(BUNDLE_ID_LENGTH);
  
  // Create encryption key
  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const key = deriveKey(passphrase, salt);

  // Calculate file offsets based on pre-scanned sizes (bounded memory)
  const { filesWithOffsets, fileOrder, totalFileDataSize } = calculateFileOffsets(
    scannedFiles, 
    null // Don't pass handoffContent - stream it like other files
  );

  // Build manifest JSON (no file contents - just metadata + offsets)
  const payload = {
    schema: SCHEMA_VERSION,
    formatVersion: SCHEMA_FORMAT_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    kdf: "scrypt",
    createdAt: new Date(Number(createdAt)).toISOString(),
    handoffName,
    files: filesWithOffsets,
    fileOrder: fileOrder,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadJsonBuffer = Buffer.from(payloadJson, "utf8");
  
  // Create length-prefixed manifest: 4-byte length + JSON
  const manifestLengthBuffer = Buffer.alloc(4);
  manifestLengthBuffer.writeUInt32LE(payloadJsonBuffer.length, 0);
  
  // Calculate ciphertext length BEFORE encryption so we can set correct AAD
  // Ciphertext = manifest length (4) + manifest JSON + file data
  const totalCiphertextSize = 4 + payloadJsonBuffer.length + totalFileDataSize;

  // === STEP 5: BOUNDED-MEMORY STREAMING ENCRYPTION ===
  // Create temp output file (sibling to final output)
  const tempOutput = absoluteOutput + ".encrypting." + randomBytes(8).toString("hex");
  
  // Also create a sibling backup for overwrite mode
  let backupPath = null;
  if (overwrite) {
    try {
      await stat(absoluteOutput);
      // File exists - will backup
      backupPath = absoluteOutput + ".backup." + randomBytes(8).toString("hex");
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
      // ENOENT - file doesn't exist, no need to backup
    }
  }

  let outputHandle;
  let outputStream;

  try {
    // === STEP 5a: Write fixed header first (without ciphertext length - we'll update it) ===
    // Format: [Magic: 3B][Version: 1B][Salt: 32B][Nonce: 12B][BundleID: 16B][CreatedAt: 8B][CiphertextLength: 8B]
    const headerBuffer = Buffer.alloc(HEADER_TOTAL_LENGTH);
    MAGIC_HEADER.copy(headerBuffer, 0);
    headerBuffer.writeUInt8(SCHEMA_FORMAT_VERSION, HEADER_VERSION_OFFSET);
    salt.copy(headerBuffer, HEADER_SALT_OFFSET);
    nonce.copy(headerBuffer, HEADER_NONCE_OFFSET);
    bundleId.copy(headerBuffer, HEADER_BUNDLE_ID_OFFSET);
    headerBuffer.writeBigUInt64LE(createdAt, HEADER_CREATED_AT_OFFSET);
    // Ciphertext length will be written after we know it
    
    // Open file for writing
    outputHandle = await open(tempOutput, "w");
    
    // Write header with correct ciphertext length
    headerBuffer.writeBigUInt64LE(BigInt(totalCiphertextSize), HEADER_CIPHERTEXT_LENGTH_OFFSET);
    await outputHandle.write(headerBuffer);
    
    // === STEP 5b: Stream ciphertext directly after header with backpressure ===
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, nonce);
    // Authenticate entire header as AAD (including the correct ciphertext length)
    cipher.setAAD(headerBuffer);

    // Stream manifest length prefix through cipher
    const enc1 = cipher.update(manifestLengthBuffer);
    if (enc1) await outputHandle.write(enc1);

    // Stream manifest JSON through cipher
    const enc2 = cipher.update(payloadJsonBuffer);
    if (enc2) await outputHandle.write(enc2);

    // Stream each file through cipher while verifying hashes (bounded memory)
    for (let i = 0; i < scannedFiles.length; i++) {
      const fileInfo = scannedFiles[i];

      // Stream from file (handoff is streamed like any other file)
      const filePath = join(basePath, fileInfo.relativePath);
      const contentStream = createReadStream(filePath);

      // Re-verify hash during streaming
      const hash = createHash("sha256");
      let bytesProcessed = 0;

      for await (const chunk of contentStream) {
        // Update hash
        hash.update(chunk);
        bytesProcessed += chunk.length;

        // Stream through cipher directly to output file (bounded memory)
        const encChunk = cipher.update(chunk);
        if (encChunk) await outputHandle.write(encChunk);
      }

      // Verify hash matches pre-scanned value
      const computedHash = hash.digest("hex");
      if (computedHash !== fileInfo.sha256) {
        throw new Error(`source file modified during encryption: ${fileInfo.relativePath}; hash mismatch (expected ${fileInfo.sha256}, got ${computedHash})`);
      }

      // Verify size matches
      if (bytesProcessed !== fileInfo.size) {
        throw new Error(`source file modified during encryption: ${fileInfo.relativePath}; size mismatch (expected ${fileInfo.size}, got ${bytesProcessed})`);
      }
    }

    // === STEP 5c: Finalize cipher and get auth tag ===
    const encFinal = cipher.final();
    if (encFinal) await outputHandle.write(encFinal);
    const authTag = cipher.getAuthTag();

    // === STEP 5d: Append auth tag after ciphertext ===
    await outputHandle.write(authTag);

    // Close the output handle
    await outputHandle.close();
    outputHandle = null;

    // === STEP 6: ATOMIC COMMIT with sibling backup strategy ===
    if (backupPath) {
      // Backup existing file
      await rename(absoluteOutput, backupPath);
    }

    try {
      // Rename temp to final output
      await rename(tempOutput, absoluteOutput);
    } catch (renameErr) {
      // Rename failed - rollback if we have a backup
      if (backupPath) {
        try {
          await rename(backupPath, absoluteOutput);
        } catch {
          // Rollback failed - this is a serious data loss situation
          throw new Error(`encryption failed and rollback also failed: original data may be lost. Original error: ${renameErr.message}`);
        }
      }
      throw renameErr;
    }

    // === STEP 7: Clean up backup after successful commit ===
    if (backupPath) {
      try {
        await rm(backupPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    return {
      schema: SCHEMA_VERSION,
      outputPath: absoluteOutput,
      fileCount: scannedFiles.length,
      handoffName,
    };
  } catch (encryptionError) {
    // Clean up temp files on failure
    if (outputHandle) {
      try {
        await outputHandle.close();
      } catch {
        // Ignore
      }
    }
    try {
      await unlink(tempOutput);
    } catch {
      // Ignore
    }
    // Note: We intentionally don't clean up backupPath here - if commit failed after backup,
    // the original file is still intact in the backup location
    throw encryptionError;
  }
}

export async function inspectBundle(encryptedPath, passphrase) {
  const absolutePath = resolve(encryptedPath);

  // === BOUNDED READ: Use fs.promises.open().read() for fixed header ===
  let fileHandle;
  let headerBuffer;
  try {
    fileHandle = await open(absolutePath, "r");
    
    // Read exactly HEADER_TOTAL_LENGTH bytes for the fixed header
    headerBuffer = Buffer.alloc(HEADER_TOTAL_LENGTH);
    const headerReadResult = await fileHandle.read(headerBuffer, 0, HEADER_TOTAL_LENGTH, 0);
    
    if (headerReadResult.bytesRead < HEADER_TOTAL_LENGTH) {
      throw new Error("invalid encrypted bundle: file too short for header");
    }
  } finally {
    if (fileHandle) await fileHandle.close();
  }

  // Check magic header
  const fileMagic = headerBuffer.subarray(0, MAGIC_HEADER.length);
  if (!fileMagic.equals(MAGIC_HEADER)) {
    throw new Error("invalid encrypted bundle: not a CBX file or unsupported format");
  }

  const version = headerBuffer.readUInt8(HEADER_VERSION_OFFSET);
  if (version > SCHEMA_FORMAT_VERSION) {
    throw new Error(`unsupported format version: ${version}; supported versions: 1-${SCHEMA_FORMAT_VERSION}`);
  }
  if (version < 2) {
    throw new Error("legacy format versions (v1) are no longer supported");
  }

  const salt = headerBuffer.subarray(HEADER_SALT_OFFSET, HEADER_SALT_OFFSET + SALT_LENGTH);
  const nonce = headerBuffer.subarray(HEADER_NONCE_OFFSET, HEADER_NONCE_OFFSET + NONCE_LENGTH);
  
  // Read bundle ID and createdAt from header
  const bundleId = headerBuffer.subarray(HEADER_BUNDLE_ID_OFFSET, HEADER_BUNDLE_ID_OFFSET + BUNDLE_ID_LENGTH);
  const createdAt = headerBuffer.readBigUInt64LE(HEADER_CREATED_AT_OFFSET);
  
  // Read ciphertext length from header
  const ciphertextLength = Number(headerBuffer.readBigUInt64LE(HEADER_CIPHERTEXT_LENGTH_OFFSET));

  // === VERIFY EXACT CONTAINER SIZE ===
  const fileStats = await stat(absolutePath);
  const expectedTotalSize = HEADER_TOTAL_LENGTH + ciphertextLength + AUTH_TAG_LENGTH;
  if (fileStats.size !== expectedTotalSize) {
    throw new Error(`invalid encrypted bundle: file size mismatch (expected ${expectedTotalSize}, got ${fileStats.size})`);
  }

  // === READ TAG (fixed position) ===
  const tagOffset = HEADER_TOTAL_LENGTH + ciphertextLength;
  const tagBuffer = Buffer.alloc(AUTH_TAG_LENGTH);
  fileHandle = await open(absolutePath, "r");
  try {
    const tagReadResult = await fileHandle.read(tagBuffer, 0, AUTH_TAG_LENGTH, tagOffset);
    if (tagReadResult.bytesRead < AUTH_TAG_LENGTH) {
      throw new Error("invalid encrypted bundle: cannot read auth tag");
    }
  } finally {
    await fileHandle.close();
  }

  // === STREAM DECRYPTION: Read only ciphertext range through decipher ===
  // Read ciphertext using bounded read
  const ciphertext = Buffer.alloc(ciphertextLength);
  fileHandle = await open(absolutePath, "r");
  try {
    const ciphertextReadResult = await fileHandle.read(ciphertext, 0, ciphertextLength, HEADER_TOTAL_LENGTH);
    if (ciphertextReadResult.bytesRead < ciphertextLength) {
      throw new Error("invalid encrypted bundle: cannot read ciphertext");
    }
  } finally {
    await fileHandle.close();
  }

  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, nonce);
  // Authenticate entire header as AAD
  decipher.setAAD(headerBuffer);
  decipher.setAuthTag(tagBuffer);

  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new Error("decryption failed: wrong passphrase or corrupted data");
  }

  // === PARSE BOUNDED LENGTH-PREFIXED MANIFEST INCREMENTALLY ===
  if (plaintext.length < 4) {
    throw new Error("invalid bundle: payload too short");
  }
  
  const jsonLength = plaintext.readUInt32LE(0);
  if (jsonLength > MAX_MANIFEST_SIZE) {
    throw new Error(`invalid bundle: manifest too large (${jsonLength} bytes, max ${MAX_MANIFEST_SIZE})`);
  }
  
  const jsonEnd = 4 + jsonLength;
  if (jsonEnd > plaintext.length) {
    throw new Error("invalid bundle: manifest length exceeds payload");
  }
  
  let payload;
  try {
    const jsonStr = plaintext.toString("utf8", 4, jsonEnd);
    payload = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error("invalid bundle: corrupted manifest JSON");
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

  // Compute file data offset: 4-byte length prefix + JSON (reuse jsonLength from parsing)
  const fileDataOffset = 4 + jsonLength;

  // Extract handoff content from binary section if present
  let handoffContent = null;
  const handoffFile = payload.files?.find(f => f.isHandoff);
  if (handoffFile && handoffFile.offset >= 0) {
    const actualOffset = fileDataOffset + handoffFile.offset;
    const handoffEnd = actualOffset + handoffFile.length;
    if (handoffEnd <= plaintext.length) {
      handoffContent = plaintext.toString("utf8", actualOffset, handoffEnd);
    }
  }

  // For inspect, we only return bounded manifest + handoff preview
  const handoffPreview = handoffContent
    ? handoffContent.slice(0, 500) + (handoffContent.length > 500 ? "..." : "")
    : null;

  return {
    schema: payload.schema,
    formatVersion: version,
    createdAt: payload.createdAt,
    handoffName: payload.handoffName,
    handoffPreview,
    files: payload.files.map((f) => ({
      relativePath: f.relativePath,
      sha256: f.sha256,
      isHandoff: f.isHandoff || false,
      // Version 2+ includes offset/length for streaming
      offset: f.offset,
      length: f.length,
    })),
    fileCount: payload.files.length,
  };
}

export async function restoreBundle(encryptedPath, outputPath, passphrase, options = {}) {
  const absoluteInput = resolve(encryptedPath);
  const absoluteOutput = resolve(outputPath);
  const overwrite = options.overwrite === true;

  // === BOUNDED READ: Use fs.promises.open().read() for fixed header ===
  let fileHandle;
  let headerBuffer;
  try {
    fileHandle = await open(absoluteInput, "r");
    
    // Read exactly HEADER_TOTAL_LENGTH bytes for the fixed header
    headerBuffer = Buffer.alloc(HEADER_TOTAL_LENGTH);
    const headerReadResult = await fileHandle.read(headerBuffer, 0, HEADER_TOTAL_LENGTH, 0);
    
    if (headerReadResult.bytesRead < HEADER_TOTAL_LENGTH) {
      throw new Error("invalid encrypted bundle: file too short for header");
    }
  } finally {
    if (fileHandle) await fileHandle.close();
  }

  // Verify magic header
  const fileMagic = headerBuffer.subarray(0, MAGIC_HEADER.length);
  if (!fileMagic.equals(MAGIC_HEADER)) {
    throw new Error("invalid encrypted bundle: not a CBX file or unsupported format");
  }

  const version = headerBuffer.readUInt8(HEADER_VERSION_OFFSET);
  if (version > SCHEMA_FORMAT_VERSION) {
    throw new Error(`unsupported format version: ${version}; supported versions: 1-${SCHEMA_FORMAT_VERSION}`);
  }
  if (version < 2) {
    throw new Error("legacy format versions (v1) are no longer supported");
  }

  const salt = headerBuffer.subarray(HEADER_SALT_OFFSET, HEADER_SALT_OFFSET + SALT_LENGTH);
  const nonce = headerBuffer.subarray(HEADER_NONCE_OFFSET, HEADER_NONCE_OFFSET + NONCE_LENGTH);
  
  // Read ciphertext length from header
  const ciphertextLength = Number(headerBuffer.readBigUInt64LE(HEADER_CIPHERTEXT_LENGTH_OFFSET));

  // === VERIFY EXACT CONTAINER SIZE ===
  const fileStats = await stat(absoluteInput);
  const expectedTotalSize = HEADER_TOTAL_LENGTH + ciphertextLength + AUTH_TAG_LENGTH;
  if (fileStats.size !== expectedTotalSize) {
    throw new Error(`invalid encrypted bundle: file size mismatch (expected ${expectedTotalSize}, got ${fileStats.size})`);
  }

  // === READ TAG (fixed position) ===
  const tagOffset = HEADER_TOTAL_LENGTH + ciphertextLength;
  const tagBuffer = Buffer.alloc(AUTH_TAG_LENGTH);
  fileHandle = await open(absoluteInput, "r");
  try {
    const tagReadResult = await fileHandle.read(tagBuffer, 0, AUTH_TAG_LENGTH, tagOffset);
    if (tagReadResult.bytesRead < AUTH_TAG_LENGTH) {
      throw new Error("invalid encrypted bundle: cannot read auth tag");
    }
  } finally {
    await fileHandle.close();
  }

  // === BOUNDED READ: Read only the ciphertext ===
  const ciphertext = Buffer.alloc(ciphertextLength);
  fileHandle = await open(absoluteInput, "r");
  try {
    const ciphertextReadResult = await fileHandle.read(ciphertext, 0, ciphertextLength, HEADER_TOTAL_LENGTH);
    if (ciphertextReadResult.bytesRead < ciphertextLength) {
      throw new Error("invalid encrypted bundle: cannot read ciphertext");
    }
  } finally {
    await fileHandle.close();
  }

  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, nonce);
  // Authenticate entire header as AAD
  decipher.setAAD(headerBuffer);
  decipher.setAuthTag(tagBuffer);

  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new Error("decryption failed: wrong passphrase or tampered data");
  }

  // Parse length-prefixed manifest
  let payload;
  try {
    // Read 4-byte length prefix to find where JSON ends
    if (plaintext.length < 4) {
      throw new Error("invalid bundle: payload too short");
    }
    const jsonLength = plaintext.readUInt32LE(0);
    if (jsonLength > MAX_MANIFEST_SIZE) {
      throw new Error(`invalid bundle: manifest too large (${jsonLength} bytes, max ${MAX_MANIFEST_SIZE})`);
    }
    const jsonEnd = 4 + jsonLength;
    if (jsonEnd > plaintext.length) {
      throw new Error("invalid bundle: manifest length exceeds payload");
    }
    const jsonStr = plaintext.toString("utf8", 4, jsonEnd);
    payload = JSON.parse(jsonStr);
  } catch (e) {
    if (e.message.includes("manifest")) {
      throw e;
    }
    throw new Error("invalid bundle: corrupted manifest JSON");
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

  // Calculate fileDataOffset for version 2+
  const fileDataOffset = version >= 2 ? (4 + plaintext.readUInt32LE(0)) : 0;

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

      // Version 2+: Read from decrypted plaintext using offset/length
      // All files (including handoff) are stored in the binary section
      if (version >= 2 && plaintext) {
        const offset = file.offset;
        const length = file.length || 0;

        if (offset !== undefined && offset >= 0) {
          // File data is in the plaintext after the manifest
          // Calculate actual offset: fileDataOffset + file.offset
          const actualOffset = fileDataOffset + offset;
          // Handle zero-byte files (length === 0) - still need to check bounds
          if (length === 0 || actualOffset + length <= plaintext.length) {
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

    // === ALL-OR-NOTHING RESTORE WITH ROLLBACK-SAFE TRANSACTION ===
    // For overwrite mode: backup existing destination first, swap in staged tree, rollback on failure
    // For non-overwrite: just move staged files to destination

    let backupDir = null;

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

      try {
        if (overwrite) {
          // === ROLLBACK-SAFE OVERWRITE TRANSACTION ===
          // 1. Check if destination exists
          let destExists = false;
          try {
            await stat(absoluteOutput);
            destExists = true;
          } catch (err) {
            if (err.code !== "ENOENT") {
              throw err;
            }
            // ENOENT - destination doesn't exist
          }

          if (destExists) {
            // 2. Backup existing destination to sibling directory
            backupDir = absoluteOutput + ".backup." + randomBytes(8).toString("hex");
            try {
              // Use rename to move existing destination to backup (atomic on same filesystem)
              await rename(absoluteOutput, backupDir);
            } catch (backupErr) {
              // If backup fails, we can't proceed safely
              throw new Error(`cannot backup existing destination for safe overwrite: ${backupErr.message}`);
            }
          }

          // 3. Try to rename staging to destination
          let swapSuccess = false;
          try {
            await rename(stagingDir, absoluteOutput);
            swapSuccess = true;
          } catch (swapErr) {
            // Swap failed - need to rollback
          }

          // 4. If swap failed, restore the backup
          if (!swapSuccess) {
            if (backupDir) {
              // Try to restore backup to destination
              try {
                await rename(backupDir, absoluteOutput);
              } catch (rollbackErr) {
                // Rollback failed - this is a serious data loss situation
                // Both staging and backup are lost - report this
                throw new Error(`restore failed and rollback also failed: original data may be lost. Original error: ${swapErr?.message || "unknown"}, rollback error: ${rollbackErr.message}`);
              }
              // Clean up backup dir on successful rollback
              try {
                await rm(backupDir, { recursive: true, force: true });
              } catch {
                // Ignore cleanup errors
              }
            }
            throw new Error(`restore failed: ${swapErr?.message || "unknown error"}; original destination preserved`);
          }

          // 5. Swap succeeded - clean up backup if it exists
          if (backupDir) {
            try {
              await rm(backupDir, { recursive: true, force: true });
            } catch {
              // Ignore cleanup errors - backup is no longer needed
            }
          }
        } else {
          // For non-overwrite:
          // Move each file individually (destination doesn't exist or is empty)
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

            // Atomic rename
            await mkdir(dirname(targetPath), { recursive: true });
            await rename(file.stagingPath, targetPath);
          }

          // Clean up staging directory
          await rm(stagingDir, { recursive: true, force: true });
        }
      } catch (moveError) {
        // Clean up staging directory on error (so files are preserved for retry)
        // For overwrite mode with backup, the backup was already restored above
        try {
          await rm(stagingDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
        throw moveError;
      }
    } else {
      // Clean up staging directory on errors
      await rm(stagingDir, { recursive: true, force: true });
    }

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
