import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, stat, readdir, mkdir, rm, copyFile } from "node:fs/promises";
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
const SCHEMA_VERSION = "continuity-bridge/encrypted-bundle-v1";

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

export async function encryptBundle(inputPath, outputPath, passphrase) {
  const absoluteInput = resolve(inputPath);
  const absoluteOutput = resolve(outputPath);

  const inputStat = await stat(absoluteInput);
  const isDirectory = inputStat.isDirectory();

  const salt = randomBytes(SALT_LENGTH);
  const nonce = randomBytes(NONCE_LENGTH);
  const key = deriveKey(passphrase, salt);

  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, nonce);

  const files = [];
  let handoffContent = null;
  let handoffName = null;
  const fileContents = {};

  if (isDirectory) {
    const entries = await readdir(absoluteInput, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "attachments" && entry.isDirectory()) {
        const attachmentEntries = await readdir(join(absoluteInput, "attachments"));
        for (const attFile of attachmentEntries) {
          const attPath = join(absoluteInput, "attachments", attFile);
          const attStat = await stat(attPath);
          if (attStat.isFile()) {
            const hash = await hashFile(attPath);
            const content = await readFile(attPath);
            fileContents[`attachments/${attFile}`] = content.toString("base64");
            files.push({
              relativePath: `attachments/${attFile}`,
              sha256: hash,
            });
          }
        }
      } else if (entry.name.startsWith("HANDOFF.") && entry.isFile()) {
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
        fileContents[entry.name] = content.toString("base64");
        files.push({
          relativePath: entry.name,
          sha256: hash,
        });
      }
    }
  } else {
    handoffContent = await readFile(absoluteInput, "utf8");
    handoffName = relative(dirname(absoluteInput), absoluteInput);
    const hash = await hashFile(absoluteInput);
    files.push({
      relativePath: handoffName,
      sha256: hash,
      isHandoff: true,
    });
  }

  const payload = {
    schema: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    handoff: handoffContent,
    handoffName,
    files: files.map((f) => ({
      relativePath: f.relativePath,
      sha256: f.sha256,
      isHandoff: f.isHandoff || false,
    })),
    fileContents,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBuffer = Buffer.from(payloadJson, "utf8");

  const encrypted = Buffer.concat([cipher.update(payloadBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const header = Buffer.alloc(1 + SALT_LENGTH + NONCE_LENGTH);
  salt.copy(header, 1);
  nonce.copy(header, 1 + SALT_LENGTH);

  const output = createWriteStream(absoluteOutput);
  output.write(header);
  output.write(authTag);
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

  if (fileBuffer.length < 1 + SALT_LENGTH + NONCE_LENGTH + 16) {
    throw new Error("invalid encrypted bundle: file too short");
  }

  const version = fileBuffer.readUInt8(0);
  const salt = fileBuffer.subarray(1, 1 + SALT_LENGTH);
  const nonce = fileBuffer.subarray(1 + SALT_LENGTH, 1 + SALT_LENGTH + NONCE_LENGTH);
  const tag = fileBuffer.subarray(1 + SALT_LENGTH + NONCE_LENGTH, 1 + SALT_LENGTH + NONCE_LENGTH + 16);
  const ciphertext = fileBuffer.subarray(1 + SALT_LENGTH + NONCE_LENGTH + 16);

  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, nonce);
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

  if (fileBuffer.length < 1 + SALT_LENGTH + NONCE_LENGTH + 16) {
    throw new Error("invalid encrypted bundle: file too short");
  }

  const version = fileBuffer.readUInt8(0);
  const salt = fileBuffer.subarray(1, 1 + SALT_LENGTH);
  const nonce = fileBuffer.subarray(1 + SALT_LENGTH, 1 + SALT_LENGTH + NONCE_LENGTH);
  const tag = fileBuffer.subarray(1 + SALT_LENGTH + NONCE_LENGTH, 1 + SALT_LENGTH + NONCE_LENGTH + 16);
  const ciphertext = fileBuffer.subarray(1 + SALT_LENGTH + NONCE_LENGTH + 16);

  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, nonce);
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

  await mkdir(absoluteOutput, { recursive: true });

  const restored = [];
  const errors = [];

  for (const file of payload.files) {
    if (isAbsolute(file.relativePath)) {
      errors.push(`refusing absolute path: ${file.relativePath}`);
      continue;
    }

    const targetPath = join(absoluteOutput, file.relativePath);
    const normalizedTarget = resolve(targetPath);
    const normalizedOutput = resolve(absoluteOutput);

    if (!normalizedTarget.startsWith(normalizedOutput + sep)) {
      errors.push(`refusing traversal path: ${file.relativePath}`);
      continue;
    }

    const targetDir = dirname(targetPath);
    await mkdir(targetDir, { recursive: true });

    const exists = await stat(targetPath).catch(() => null);
    if (exists && !overwrite) {
      errors.push(`refusing to overwrite existing file: ${file.relativePath}; use --overwrite to replace`);
      continue;
    }

    let content = null;

    // First check if we have stored content in the payload
    if (payload.fileContents && payload.fileContents[file.relativePath]) {
      content = Buffer.from(payload.fileContents[file.relativePath], "base64");
    } else if (file.isHandoff && payload.handoff) {
      content = Buffer.from(payload.handoff, "utf8");
    }

    if (!content) {
      errors.push(`source file not found: ${file.relativePath}`);
      continue;
    }

    // Verify content hash
    const contentHash = createHash("sha256").update(content).digest("hex");
    if (contentHash !== file.sha256) {
      errors.push(`hash mismatch for ${file.relativePath}: expected ${file.sha256}, got ${contentHash}`);
      continue;
    }

    await writeFile(targetPath, content);

    restored.push({
      relativePath: file.relativePath,
      sha256: contentHash,
    });
  }

  return {
    schema: payload.schema,
    createdAt: payload.createdAt,
    handoffName: payload.handoffName,
    restoredCount: restored.length,
    errors,
  };
}

export { SCHEMA_VERSION };
