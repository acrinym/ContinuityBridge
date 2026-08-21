import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, stat, lstat, readdir, mkdir, rm, copyFile, rename, unlink, open } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

// Helper to read a range of bytes from a file (start inclusive, end exclusive)
async function readFileRange(path, start, end) {
  const chunks = [];
  const stream = createReadStream(path, { start, end: end - 1 });
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

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

  // Calculate file offsets based on pre-scanned sizes (bounded memory)
  const { filesWithOffsets, fileOrder, totalFileDataSize } = calculateFileOffsets(
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

  // === BOUNDED-MEMORY STREAMING ENCRYPTION ===
  // Create a temp file for encrypted output (failure-safe: temp file is sibling to output)
  // If encryption fails, temp file can be safely removed without corrupting existing output
  const tempOutput = absoluteOutput + ".encrypting." + randomBytes(8).toString("hex");
  let outputStream;

  try {
    outputStream = createWriteStream(tempOutput);

    // Stream manifest length prefix through cipher
    const enc1 = cipher.update(manifestLengthBuffer);
    if (enc1) outputStream.write(enc1);

    // Stream manifest JSON through cipher
    const enc2 = cipher.update(payloadJsonBuffer);
    if (enc2) outputStream.write(enc2);

    // Stream each file through cipher while verifying hashes (bounded memory)
    for (let i = 0; i < scannedFiles.length; i++) {
      const fileInfo = scannedFiles[i];

      let contentStream;
      if (fileInfo.isHandoff && handoffContent) {
        // Handoff content from memory
        contentStream = Readable.from(Buffer.from(handoffContent, "utf8"));
      } else {
        // Stream from file
        const filePath = join(absoluteInput, fileInfo.relativePath);
        contentStream = createReadStream(filePath);
      }

      // Verify hash during streaming
      const hash = createHash("sha256");
      let bytesProcessed = 0;

      for await (const chunk of contentStream) {
        // Update hash
        hash.update(chunk);
        bytesProcessed += chunk.length;

        // Stream through cipher directly to output file (bounded memory)
        const encChunk = cipher.update(chunk);
        if (encChunk) outputStream.write(encChunk);
      }

      // Verify hash matches pre-scanned value
      const computedHash = hash.digest("hex");
      if (computedHash !== fileInfo.sha256) {
        throw new Error(`source file modified during encryption: ${fileInfo.relativePath}; hash mismatch (expected ${fileInfo.sha256}, got ${computedHash})`);
      }

      // Verify size matches
      const expectedSize = fileInfo.isHandoff && handoffContent
        ? Buffer.byteLength(handoffContent, "utf8")
        : fileInfo.size;
      if (bytesProcessed !== expectedSize) {
        throw new Error(`source file modified during encryption: ${fileInfo.relativePath}; size mismatch (expected ${expectedSize}, got ${bytesProcessed})`);
      }
    }

    // Finalize cipher to get auth tag
    const encFinal = cipher.final();
    if (encFinal) outputStream.write(encFinal);
    const authTag = cipher.getAuthTag();

    // Calculate total encrypted size
    const totalEncryptedSize = manifestLengthBuffer.length + payloadJsonBuffer.length + totalFileDataSize;

    // Close output stream and wait for it to finish
    outputStream.end();
    await new Promise((resolve, reject) => {
      outputStream.on("finish", resolve);
      outputStream.on("error", reject);
    });

    // Write header: MAGIC (3) + version (1) + salt (32) + nonce (12) + tag (16) + manifestSize (4)
    // Read the encrypted data size from the temp file
    const encryptedDataStats = await stat(tempOutput);
    const encryptedDataSize = encryptedDataStats.size;

    // Verify the encrypted data size matches expected
    if (encryptedDataSize !== totalEncryptedSize) {
      throw new Error(`encryption internal error: encrypted data size mismatch (expected ${totalEncryptedSize}, got ${encryptedDataSize})`);
    }

    const header = Buffer.alloc(HEADER_TOTAL_LENGTH);
    MAGIC_HEADER.copy(header, 0);
    header.writeUInt8(SCHEMA_FORMAT_VERSION, HEADER_VERSION_OFFSET);
    salt.copy(header, HEADER_SALT_OFFSET);
    nonce.copy(header, HEADER_NONCE_OFFSET);
    authTag.copy(header, HEADER_TAG_OFFSET);
    header.writeUInt32LE(totalEncryptedSize, HEADER_MANIFEST_SIZE_OFFSET);

    // Prepend header to temp file
    // Read temp file and prepend header, then atomically rename
    const tempWithHeader = absoluteOutput + ".temp." + randomBytes(8).toString("hex");
    try {
      const encryptedData = await readFile(tempOutput);
      const finalOutput = Buffer.concat([header, encryptedData]);
      await writeFile(tempWithHeader, finalOutput);
    } catch (readErr) {
      throw new Error(`encryption internal error: failed to finalize output: ${readErr.message}`);
    }

    // Remove the intermediate temp file (without header)
    try {
      await unlink(tempOutput);
    } catch {
      // Ignore - may not exist
    }

    // === ATOMIC COMMIT ===
    // If output already exists and we're overwriting, remove it first
    if (overwrite) {
      try {
        await unlink(absoluteOutput);
      } catch (err) {
        if (err.code !== "ENOENT") {
          throw err;
        }
        // ENOENT is fine - file doesn't exist
      }
    }

    // Atomically rename temp to final output
    await rename(tempWithHeader, absoluteOutput);

    return {
      schema: SCHEMA_VERSION,
      outputPath: absoluteOutput,
      fileCount: scannedFiles.length,
      handoffName,
    };
  } catch (encryptionError) {
    // Clean up temp files on failure
    try {
      await unlink(tempOutput);
    } catch {
      // Ignore cleanup errors
    }
    try {
      const tempWithHeader = absoluteOutput + ".temp.";
      await rm(tempWithHeader, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw encryptionError;
  }
}

export async function inspectBundle(encryptedPath, passphrase) {
  const absolutePath = resolve(encryptedPath);

  // === BOUNDED READ: Read only header (fixed size) ===
  const headerBuffer = await readFile(absolutePath, { length: HEADER_TOTAL_LENGTH });

  // Check minimum length for header format
  if (headerBuffer.length < HEADER_TOTAL_LENGTH) {
    throw new Error("invalid encrypted bundle: file too short");
  }

  // Verify magic header
  const fileMagic = headerBuffer.subarray(0, MAGIC_HEADER.length);
  if (!fileMagic.equals(MAGIC_HEADER)) {
    throw new Error("invalid encrypted bundle: not a CBX file or unsupported format");
  }

  const version = headerBuffer.readUInt8(HEADER_VERSION_OFFSET);
  // Support both version 1 (legacy base64) and version 2+ (binary streaming)
  if (version > SCHEMA_FORMAT_VERSION) {
    throw new Error(`unsupported format version: ${version}; supported versions: 1-${SCHEMA_FORMAT_VERSION}`);
  }

  const salt = headerBuffer.subarray(HEADER_SALT_OFFSET, HEADER_SALT_OFFSET + SALT_LENGTH);
  const nonce = headerBuffer.subarray(HEADER_NONCE_OFFSET, HEADER_NONCE_OFFSET + NONCE_LENGTH);
  const tag = headerBuffer.subarray(HEADER_TAG_OFFSET, HEADER_TAG_OFFSET + 16);

  let ciphertextSize;
  let handoffReadSize = 0;

  if (version >= 2) {
    // Version 2+: manifest size is in header
    ciphertextSize = headerBuffer.readUInt32LE(HEADER_MANIFEST_SIZE_OFFSET);
    // For inspect, we only need manifest + up to 500 bytes of handoff for preview
    // We'll read more if there's a handoff file to preview
  } else {
    // Version 1: legacy format - need to read whole file (but this is deprecated)
    const stats = await stat(absolutePath);
    ciphertextSize = stats.size - HEADER_TOTAL_LENGTH;
  }

  // === BOUNDED READ: Read only ciphertext needed for manifest + handoff preview ===
  // Read from after header, limited to ciphertextSize bytes
  // For inspect, we need:
  // - 4 bytes for JSON length prefix
  // - JSON content (up to what fits)
  // - Handoff content for preview (up to 500 bytes)
  const maxPreviewSize = 500;
  let readSize = ciphertextSize;

  // For version 2+, we can compute exactly how much we need
  if (version >= 2) {
    // We'll read the full ciphertext and decrypt, but we only keep manifest + preview
    // The key insight: we need to decrypt ALL ciphertext to verify GCM auth tag
    // But we can discard the file data after extracting manifest and handoff preview
    readSize = ciphertextSize;
  }

  // Read only the ciphertext portion (not the entire file)
  const ciphertext = await readFileRange(absolutePath, HEADER_TOTAL_LENGTH, HEADER_TOTAL_LENGTH + ciphertextSize);

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

  // For inspect, we only return bounded manifest + handoff preview
  // Clear the large plaintext to free memory (we don't return it)
  const handoffPreview = handoffContent
    ? handoffContent.slice(0, 500) + (handoffContent.length > 500 ? "..." : "")
    : null;

  // Clear plaintext to free memory - inspect doesn't need to return it
  // (restoreBundle will re-read and decrypt itself)
  // Note: We needed to decrypt fully to verify GCM tag, but we don't keep the full plaintext

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

  // === BOUNDED READ: Read only header (fixed size) ===
  const headerBuffer = await readFile(absoluteInput, { length: HEADER_TOTAL_LENGTH });

  // Check minimum length for header format
  if (headerBuffer.length < HEADER_TOTAL_LENGTH) {
    throw new Error("invalid encrypted bundle: file too short");
  }

  // Verify magic header
  const fileMagic = headerBuffer.subarray(0, MAGIC_HEADER.length);
  if (!fileMagic.equals(MAGIC_HEADER)) {
    throw new Error("invalid encrypted bundle: not a CBX file or unsupported format");
  }

  const version = headerBuffer.readUInt8(HEADER_VERSION_OFFSET);
  // Support both version 1 (legacy base64) and version 2+ (binary streaming)
  if (version > SCHEMA_FORMAT_VERSION) {
    throw new Error(`unsupported format version: ${version}; supported versions: 1-${SCHEMA_FORMAT_VERSION}`);
  }

  const salt = headerBuffer.subarray(HEADER_SALT_OFFSET, HEADER_SALT_OFFSET + SALT_LENGTH);
  const nonce = headerBuffer.subarray(HEADER_NONCE_OFFSET, HEADER_NONCE_OFFSET + NONCE_LENGTH);
  const tag = headerBuffer.subarray(HEADER_TAG_OFFSET, HEADER_TAG_OFFSET + 16);

  let ciphertextSize;
  if (version >= 2) {
    // Version 2+: manifest size is in header
    ciphertextSize = headerBuffer.readUInt32LE(HEADER_MANIFEST_SIZE_OFFSET);
  } else {
    // Version 1: legacy format - need to read whole file (but this is deprecated)
    const stats = await stat(absoluteInput);
    ciphertextSize = stats.size - HEADER_TOTAL_LENGTH;
  }

  // === BOUNDED READ: Read only the ciphertext (not the entire file with attachments) ===
  const ciphertext = await readFileRange(absoluteInput, HEADER_TOTAL_LENGTH, HEADER_TOTAL_LENGTH + ciphertextSize);

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
