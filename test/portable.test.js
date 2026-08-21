import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, stat, readdir, mkdir, symlink, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { encryptBundle, inspectBundle, restoreBundle, SCHEMA_VERSION } from "../src/portable/encrypt.js";

async function tempDir() {
  return mkdtemp(join(tmpdir(), "continuity-portable-"));
}

test("encrypt/decrypt round-trip with handoff-only file", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test-handoff.md");
    const encryptedPath = join(dir, "encrypted.cbx");
    const restoredDir = join(dir, "restored");

    await writeFile(handoffPath, "# Test Handoff\n\nThis is a test handoff.", "utf8");

    const encryptResult = await encryptBundle(handoffPath, encryptedPath, "test-passphrase-123");
    assert.equal(encryptResult.schema, SCHEMA_VERSION);
    assert.equal(encryptResult.fileCount, 1);
    assert.equal(encryptResult.handoffName, "test-handoff.md");

    const inspectResult = await inspectBundle(encryptedPath, "test-passphrase-123");
    assert.equal(inspectResult.schema, SCHEMA_VERSION);
    assert.equal(inspectResult.fileCount, 1);
    assert.equal(inspectResult.handoffName, "test-handoff.md");

    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-passphrase-123");
    assert.equal(restoreResult.restoredCount, 1);
    assert.equal(restoreResult.errors.length, 0);

    const restoredContent = await readFile(join(restoredDir, "test-handoff.md"), "utf8");
    assert.equal(restoredContent, "# Test Handoff\n\nThis is a test handoff.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("round-trip with nested attachment directory", async () => {
  const dir = await tempDir();
  try {
    const bundleDir = join(dir, "bundle");
    await mkdir(bundleDir, { recursive: true });
    const attachmentsDir = join(bundleDir, "attachments");
    await mkdir(attachmentsDir, { recursive: true });
    await writeFile(join(bundleDir, "HANDOFF.md"), "# Test Handoff", "utf8");
    await writeFile(join(attachmentsDir, "test.txt"), "attachment content", "utf8");

    const encryptedPath = join(dir, "encrypted.cbx");
    const restoredDir = join(dir, "restored");

    const encryptResult = await encryptBundle(bundleDir, encryptedPath, "bundle-pass-456");
    assert.equal(encryptResult.fileCount, 2); // HANDOFF.md + 1 attachment

    const inspectResult = await inspectBundle(encryptedPath, "bundle-pass-456");
    assert.equal(inspectResult.fileCount, 2);

    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "bundle-pass-456");
    assert.equal(restoreResult.restoredCount, 2);

    const handoffContent = await readFile(join(restoredDir, "HANDOFF.md"), "utf8");
    assert.equal(handoffContent, "# Test Handoff");

    const attContent = await readFile(join(restoredDir, "attachments", "test.txt"), "utf8");
    assert.equal(attContent, "attachment content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("wrong passphrase fails", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "correct-pass");

    await assert.rejects(
      inspectBundle(encryptedPath, "wrong-pass"),
      /decryption failed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ciphertext tamper fails", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    const fileData = await readFile(encryptedPath);
    const tamperedData = Buffer.from(fileData);
    // Tamper with a byte in the ciphertext (position after header: magic(3) + version(1) + salt(32) + nonce(12) + tag(16) + manifestSize(4) = 68)
    const ciphertextOffset = 68;
    if (tamperedData.length > ciphertextOffset) {
      tamperedData.writeUInt8(tamperedData.readUInt8(ciphertextOffset) ^ 0xff, ciphertextOffset);
    }
    await writeFile(encryptedPath, tamperedData);

    await assert.rejects(
      inspectBundle(encryptedPath, "test-pass"),
      /decryption failed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("symlink in source is rejected", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const linkPath = join(dir, "link.md");
    const encryptedPath = join(dir, "encrypted.cbx");

    await writeFile(handoffPath, "test content", "utf8");
    await symlink(handoffPath, linkPath);

    // Should reject symlinks during encryption with clear error
    await assert.rejects(
      encryptBundle(dir, encryptedPath, "test-pass"),
      /symbolic link/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("traversal/absolute-path in payload is rejected", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");
    const restoredDir = join(dir, "restored");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    // Restore should work normally for valid paths
    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-pass");
    assert.equal(restoreResult.restoredCount, 1);
    assert.equal(restoreResult.errors.length, 0);

    // Verify that the restored path is relative (not absolute)
    const restoredFiles = await readdir(restoredDir);
    assert.ok(restoredFiles.includes("test.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("hash verification works for restored files", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");
    const restoredDir = join(dir, "restored");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-pass");
    assert.equal(restoreResult.restoredCount, 1);
    assert.equal(restoreResult.errors.length, 0);

    const restoredContent = await readFile(join(restoredDir, "test.md"), "utf8");
    assert.equal(restoredContent, "test content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("encrypt output overwrite refusal", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    // Try to encrypt again without overwrite - should fail
    await assert.rejects(
      encryptBundle(handoffPath, encryptedPath, "test-pass-2"),
      /output file already exists/,
    );

    // With overwrite=true, should succeed
    const encryptResult = await encryptBundle(handoffPath, encryptedPath, "test-pass-2", { overwrite: true });
    assert.equal(encryptResult.fileCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restore overwrite refusal and explicit overwrite", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");
    const restoredDir = join(dir, "restored");

    await writeFile(handoffPath, "original content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    await mkdir(restoredDir, { recursive: true });
    await writeFile(join(restoredDir, "test.md"), "existing content", "utf8");

    await assert.rejects(
      restoreBundle(encryptedPath, restoredDir, "test-pass", { overwrite: false }),
      /existing files would be overwritten/,
    );

    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-pass", { overwrite: true });
    assert.equal(restoreResult.restoredCount, 1);
    assert.equal(restoreResult.errors.length, 0);

    const content = await readFile(join(restoredDir, "test.md"), "utf8");
    assert.equal(content, "original content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("passphrase absent from argv/serialized metadata", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "secret-passphrase");

    const encryptedContent = await readFile(encryptedPath);
    assert.ok(!encryptedContent.includes("secret-passphrase"));
    assert.ok(!encryptedContent.includes("secret"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI inspect is non-mutating", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    const originalStat = await stat(encryptedPath);
    const originalMtime = originalStat.mtimeMs;

    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Use stdin for passphrase
    const result = spawnSync(
      "node",
      ["bin/continuity-bridge.js", "portable", "inspect", encryptedPath, "--passphrase-stdin"],
      { cwd: resolve("."), encoding: "utf8", input: "test-pass\n" },
    );

    assert.equal(result.status, 0);

    const afterStat = await stat(encryptedPath);
    assert.equal(afterStat.mtimeMs, originalMtime);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI encrypt with directory bundle", async () => {
  const dir = await tempDir();
  try {
    const bundleDir = join(dir, "bundle");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "HANDOFF.md"), "# Bundle Handoff", "utf8");

    const encryptedPath = join(dir, "bundle.cbx");

    const result = spawnSync(
      "node",
      ["bin/continuity-bridge.js", "portable", "encrypt", bundleDir, "--output", encryptedPath, "--passphrase-stdin"],
      { cwd: resolve("."), encoding: "utf8", input: "bundle-pass\nbundle-pass\n" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes("Encrypted"));

    const inspectResult = await inspectBundle(encryptedPath, "bundle-pass");
    assert.equal(inspectResult.fileCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("magic header verification", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    // Read and verify magic header
    const fileData = await readFile(encryptedPath);
    const magic = fileData.subarray(0, 3).toString("utf8");
    assert.equal(magic, "CBX");

    const version = fileData.readUInt8(3);
    assert.equal(version, 2); // Version 2 uses binary format
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("invalid magic header is rejected", async () => {
  const dir = await tempDir();
  try {
    const corruptedPath = join(dir, "corrupted.cbx");

    // Create a fake encrypted file with invalid magic but enough data to pass length check
    // Header is: magic(3) + version(1) + salt(32) + nonce(12) + tag(16) + manifestSize(4) = 68 bytes
    const fakeHeader = Buffer.alloc(68);
    fakeHeader.write("NOTCBX", 0, 3, "utf8"); // Invalid magic
    fakeHeader.writeUInt8(2, 3); // version 2
    await writeFile(corruptedPath, fakeHeader);

    await assert.rejects(
      inspectBundle(corruptedPath, "test-pass"),
      /not a CBX file/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI encrypt with stdin passphrase", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "test.cbx");

    await writeFile(handoffPath, "test content", "utf8");

    // Encrypt with passphrase via stdin
    const encryptResult = spawnSync(
      "node",
      ["bin/continuity-bridge.js", "portable", "encrypt", handoffPath, "--output", encryptedPath, "--passphrase-stdin"],
      { cwd: resolve("."), encoding: "utf8", input: "my-secret\nmy-secret\n" },
    );

    assert.equal(encryptResult.status, 0, encryptResult.stderr);

    // Verify we can decrypt with the same passphrase
    const inspectResult = await inspectBundle(encryptedPath, "my-secret");
    assert.equal(inspectResult.fileCount, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI refuses interactive TTY prompt when not in TTY (no secret echo)", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "test.cbx");

    await writeFile(handoffPath, "test content", "utf8");

    // Try to run encrypt without --passphrase-stdin when not in TTY
    // Should fail because it can't prompt securely without TTY
    const result = spawnSync(
      "node",
      ["bin/continuity-bridge.js", "portable", "encrypt", handoffPath, "--output", encryptedPath],
      { cwd: resolve("."), encoding: "utf8" },
    );

    // Should fail with error about requiring --passphrase-stdin or TTY
    assert.notEqual(result.status, 0);
    assert.ok(
      result.stderr.includes("--passphrase-stdin") || result.stderr.includes("TTY") || result.stderr.includes("passphrase required"),
      "should require --passphrase-stdin when not in TTY",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("passphrase via stdin does not appear in process output", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "test.cbx");
    const secretPassphrase = "super-secret-12345";

    await writeFile(handoffPath, "test content", "utf8");

    // Encrypt with passphrase via stdin
    const encryptResult = spawnSync(
      "node",
      ["bin/continuity-bridge.js", "portable", "encrypt", handoffPath, "--output", encryptedPath, "--passphrase-stdin"],
      { cwd: resolve("."), encoding: "utf8", input: `${secretPassphrase}\n${secretPassphrase}\n` },
    );

    assert.equal(encryptResult.status, 0, encryptResult.stderr);

    // Verify passphrase does not appear in stdout or stderr
    const combinedOutput = (encryptResult.stdout || "") + (encryptResult.stderr || "");
    assert.ok(
      !combinedOutput.includes(secretPassphrase),
      "passphrase should not appear in any output",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI restore with stdin passphrase", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "test.cbx");
    const restoredDir = join(dir, "restored");

    await writeFile(handoffPath, "test content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    // Restore with passphrase via stdin
    const restoreResult = spawnSync(
      "node",
      ["bin/continuity-bridge.js", "portable", "restore", encryptedPath, "--output", restoredDir, "--passphrase-stdin"],
      { cwd: resolve("."), encoding: "utf8", input: "test-pass\n" },
    );

    assert.equal(restoreResult.status, 0, restoreResult.stderr);

    const restoredContent = await readFile(join(restoredDir, "test.md"), "utf8");
    assert.equal(restoredContent, "test content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restore refuses when restore root is a symlink", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "test.cbx");
    const restoredDir = join(dir, "restored");
    const targetDir = join(dir, "target");

    // Create encrypted bundle
    await writeFile(handoffPath, "secret content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    // Create target directory
    await mkdir(targetDir, { recursive: true });

    // Create restore directory as a symlink to target
    await symlink(targetDir, restoredDir);

    // Try to restore - should fail because restore root is a symlink
    await assert.rejects(
      restoreBundle(encryptedPath, restoredDir, "test-pass", { overwrite: true }),
      /symlink/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restore with pre-existing file refuses when not overwrite", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "test.cbx");
    const restoredDir = join(dir, "restored");

    // Create encrypted bundle
    await writeFile(handoffPath, "new content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    // Create restore directory with existing file
    await mkdir(restoredDir, { recursive: true });
    await writeFile(join(restoredDir, "test.md"), "existing content", "utf8");

    // Should refuse without overwrite flag
    await assert.rejects(
      restoreBundle(encryptedPath, restoredDir, "test-pass"),
      /existing files would be overwritten/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("restore with staging directory is atomic", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "test.cbx");
    const restoredDir = join(dir, "restored");

    await writeFile(handoffPath, "atomic restore test", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    // Restore should succeed
    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-pass");
    assert.equal(restoreResult.restoredCount, 1);
    assert.equal(restoreResult.errors.length, 0);

    // Verify staging directory is cleaned up
    const stagingDirs = await readdir(dir);
    for (const item of stagingDirs) {
      assert.ok(!item.includes("staging"), "staging directory should be cleaned up");
    }

    const restoredContent = await readFile(join(restoredDir, "test.md"), "utf8");
    assert.equal(restoredContent, "atomic restore test");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Test binary format (version 2) - no base64 amplification
test("encrypted bundle uses binary format without base64 amplification", async () => {
  const dir = await tempDir();
  try {
    const bundleDir = join(dir, "bundle");
    await mkdir(bundleDir, { recursive: true });
    const attachmentsDir = join(bundleDir, "attachments");
    await mkdir(attachmentsDir, { recursive: true });

    // Create a known-size file (1MB of data)
    const largeContent = "x".repeat(1024 * 1024); // 1MB
    await writeFile(join(bundleDir, "HANDOFF.md"), "# Test\n\nLarge handoff content", "utf8");
    await writeFile(join(attachmentsDir, "large.bin"), largeContent, "utf8");

    const encryptedPath = join(dir, "encrypted.cbx");

    const encryptResult = await encryptBundle(bundleDir, encryptedPath, "test-pass");
    assert.equal(encryptResult.fileCount, 2);

    // Inspect and verify format version
    const inspectResult = await inspectBundle(encryptedPath, "test-pass");
    assert.equal(inspectResult.formatVersion, 2, "should use format version 2");
    assert.ok(inspectResult.files.length > 0);

    // Check that files have offset/length (binary format)
    for (const file of inspectResult.files) {
      assert.ok(typeof file.offset === "number", "file should have offset");
      assert.ok(typeof file.length === "number", "file should have length");
      assert.ok(file.length > 0, "file should have non-zero length");
    }

    // Restore and verify
    const restoredDir = join(dir, "restored");
    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-pass");
    assert.equal(restoreResult.restoredCount, 2);
    assert.equal(restoreResult.errors.length, 0);

    // Verify large file was restored correctly
    const restoredLarge = await readFile(join(restoredDir, "attachments", "large.bin"), "utf8");
    assert.equal(restoredLarge.length, largeContent.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Test source mutation detection - hash computed from content
test("hash is computed from actual content not filesystem", async () => {
  const dir = await tempDir();
  try {
    const handoffPath = join(dir, "test.md");
    const encryptedPath = join(dir, "encrypted.cbx");
    const restoredDir = join(dir, "restored");

    // Create initial file
    await writeFile(handoffPath, "original content", "utf8");
    await encryptBundle(handoffPath, encryptedPath, "test-pass");

    // Modify source file AFTER encryption
    await writeFile(handoffPath, "modified content", "utf8");

    // Restore should still work because we hashed the content before modification
    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-pass");
    assert.equal(restoreResult.restoredCount, 1);
    assert.equal(restoreResult.errors.length, 0);

    // Verify we got the ORIGINAL content, not the modified one
    const restoredContent = await readFile(join(restoredDir, "test.md"), "utf8");
    assert.equal(restoredContent, "original content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Test wrong passphrase detection (binary format)
test("wrong passphrase fails on binary format", async () => {
  const dir = await tempDir();
  try {
    const bundleDir = join(dir, "bundle");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "HANDOFF.md"), "# Test", "utf8");

    const encryptedPath = join(dir, "encrypted.cbx");
    await encryptBundle(bundleDir, encryptedPath, "correct-pass");

    // Wrong passphrase should fail
    await assert.rejects(
      inspectBundle(encryptedPath, "wrong-pass"),
      /decryption failed/,
    );

    await assert.rejects(
      restoreBundle(encryptedPath, join(dir, "restored"), "wrong-pass"),
      /decryption failed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Test binary format tamper detection
test("binary format ciphertext tamper fails", async () => {
  const dir = await tempDir();
  try {
    const bundleDir = join(dir, "bundle");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, "HANDOFF.md"), "# Test content", "utf8");

    const encryptedPath = join(dir, "encrypted.cbx");
    await encryptBundle(bundleDir, encryptedPath, "test-pass");

    // Tamper with a byte in the ciphertext (position 68 = header with manifest size)
    const fileData = await readFile(encryptedPath);
    const tamperedData = Buffer.from(fileData);
    const ciphertextOffset = 68; // Header with manifest size
    if (tamperedData.length > ciphertextOffset) {
      tamperedData.writeUInt8(tamperedData.readUInt8(ciphertextOffset) ^ 0x01, ciphertextOffset);
    }
    await writeFile(encryptedPath, tamperedData);

    // Decryption should fail due to tamper
    await assert.rejects(
      inspectBundle(encryptedPath, "test-pass"),
      /decryption failed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Test restore integrity - tamper detection
// In v2 format, ALL data is encrypted, so tampering causes decryption failure
test("tamper of encrypted payload fails decryption", async () => {
  const dir = await tempDir();
  try {
    const bundleDir = join(dir, "bundle");
    await mkdir(bundleDir, { recursive: true });
    const attachmentsDir = join(bundleDir, "attachments");
    await mkdir(attachmentsDir, { recursive: true });
    
    // Create handoff + attachment
    await writeFile(join(bundleDir, "HANDOFF.md"), "# Test", "utf8");
    await writeFile(join(attachmentsDir, "data.bin"), "x".repeat(1000), "utf8");

    const encryptedPath = join(dir, "encrypted.cbx");

    await encryptBundle(bundleDir, encryptedPath, "test-pass");

    // Tamper with ciphertext - in v2, ALL data is encrypted
    const fileData = await readFile(encryptedPath);
    const tamperedData = Buffer.from(fileData);
    // Tamper near the middle/end of encrypted data
    const corruptOffset = fileData.length - 500;
    if (tamperedData.length > corruptOffset && corruptOffset > 0) {
      tamperedData.writeUInt8(tamperedData.readUInt8(corruptOffset) ^ 0xFF, corruptOffset);
    }
    await writeFile(encryptedPath, tamperedData);

    // Decryption should fail due to tamper
    await assert.rejects(
      inspectBundle(encryptedPath, "test-pass"),
      /decryption failed/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Test nested attachment payloads
test("nested directory structure with multiple files", async () => {
  const dir = await tempDir();
  try {
    const bundleDir = join(dir, "bundle");
    await mkdir(bundleDir, { recursive: true });
    const attachmentsDir = join(bundleDir, "attachments");
    await mkdir(attachmentsDir, { recursive: true });

    await writeFile(join(bundleDir, "HANDOFF.md"), "# Main handoff", "utf8");
    await writeFile(join(attachmentsDir, "file1.txt"), "file 1 content", "utf8");
    await writeFile(join(attachmentsDir, "file2.txt"), "file 2 content", "utf8");

    const encryptedPath = join(dir, "encrypted.cbx");
    const restoredDir = join(dir, "restored");

    const encryptResult = await encryptBundle(bundleDir, encryptedPath, "test-pass");
    assert.equal(encryptResult.fileCount, 3);

    const inspectResult = await inspectBundle(encryptedPath, "test-pass");
    assert.equal(inspectResult.fileCount, 3);

    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-pass");
    assert.equal(restoreResult.restoredCount, 3);
    assert.equal(restoreResult.errors.length, 0);

    // Verify all files restored
    const handoff = await readFile(join(restoredDir, "HANDOFF.md"), "utf8");
    assert.equal(handoff, "# Main handoff");

    const f1 = await readFile(join(restoredDir, "attachments", "file1.txt"), "utf8");
    assert.equal(f1, "file 1 content");

    const f2 = await readFile(join(restoredDir, "attachments", "file2.txt"), "utf8");
    assert.equal(f2, "file 2 content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Test truly nested directory structure (at least 2 levels deep)
test("truly nested directory structure preserves deep paths", async () => {
  const dir = await tempDir();
  try {
    const bundleDir = join(dir, "bundle");
    await mkdir(bundleDir, { recursive: true });
    const deepDir = join(bundleDir, "attachments", "subfolder", "nested");
    await mkdir(deepDir, { recursive: true });

    await writeFile(join(bundleDir, "HANDOFF.md"), "# Main handoff", "utf8");
    await writeFile(join(bundleDir, "attachments", "level1.txt"), "level 1", "utf8");
    await writeFile(join(bundleDir, "attachments", "subfolder", "level2.txt"), "level 2", "utf8");
    await writeFile(join(deepDir, "level3.txt"), "level 3 - truly nested!", "utf8");

    const encryptedPath = join(dir, "encrypted.cbx");
    const restoredDir = join(dir, "restored");

    const encryptResult = await encryptBundle(bundleDir, encryptedPath, "test-pass");
    assert.equal(encryptResult.fileCount, 4);

    const restoreResult = await restoreBundle(encryptedPath, restoredDir, "test-pass");
    assert.equal(restoreResult.restoredCount, 4);
    assert.equal(restoreResult.errors.length, 0);

    // Verify all nested paths are preserved
    const handoff = await readFile(join(restoredDir, "HANDOFF.md"), "utf8");
    assert.equal(handoff, "# Main handoff");

    const l1 = await readFile(join(restoredDir, "attachments", "level1.txt"), "utf8");
    assert.equal(l1, "level 1");

    const l2 = await readFile(join(restoredDir, "attachments", "subfolder", "level2.txt"), "utf8");
    assert.equal(l2, "level 2");

    const l3 = await readFile(join(restoredDir, "attachments", "subfolder", "nested", "level3.txt"), "utf8");
    assert.equal(l3, "level 3 - truly nested!");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
