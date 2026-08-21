# Security policy

ContinuityBridge is a local-first desktop/CLI project that processes user-authorized conversation exports, explicit live-capture payloads, local repository coordinates, and explicitly selected local artifacts.

## Supported release

Security fixes target the current public release line. At the time of this document, that is **1.0.x**.

## Reporting a security issue

If GitHub Private Vulnerability Reporting is enabled for this repository, use that private channel.

If private reporting is not available, open a minimal public issue that **does not include exploit details or secrets** and ask for a private contact path.

Do not place any of the following in a public issue:

- conversation contents that are not intended for publication;
- passwords, API keys, bearer tokens, cookies, or signed URLs;
- private repository credentials or credential-bearing remotes;
- private attachment contents;
- detailed exploit steps for an unpatched vulnerability.

## Security boundaries

The project treats these as release-critical boundaries:

- live capture must remain loopback-only unless the product contract explicitly changes;
- the capture receiver requires bearer authorization;
- browser capture happens only after an explicit user action;
- captured source URLs must not retain credentials, query strings, or fragments;
- provider-private opaque attachment pointers are not portable evidence;
- copying local artifacts requires explicit selection and verification;
- AI-client configuration mutations require explicit confirmation;
- repository remote identity must not preserve embedded credentials;
- user evidence stays outside the replaceable application package;
- ContinuityBridge interacts with Lore through its public CLI/push/MCP contracts rather than coupling directly to Lore's SQLite internals.

## Encrypted Portable Bundles

ContinuityBridge's encrypted portable bundles (.cbx files) provide strong security guarantees for sensitive handoffs.

### Encryption Specification

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: scrypt with parameters N=2^14, r=8, p=1
- **Salt**: 32 bytes, randomly generated per encryption
- **Nonce**: 12 bytes, randomly generated per encryption
- **Auth Tag**: 16 bytes (included in AES-256-GCM)

### Security Properties

1. **Passphrase Protection**
   - Passphrases are never passed via command-line arguments
   - Passphrases are read from stdin only
   - Interactive TTY prompts use secure no-echo input
   - No passphrase logging or storage

2. **Tamper Detection**
   - AES-256-GCM provides authenticated encryption
   - Any modification to ciphertext is detected
   - Wrong passphrase is detected during decryption

3. **Integrity Verification**
   - Each file in the bundle has SHA-256 hash
   - Hashes are verified during restore
   - Corrupted files are rejected

4. **Path Traversal Protection**
   - Absolute paths are rejected
   - Parent traversal (..) is rejected
   - Symlinks in source are skipped during encryption
   - Symlinks in restore target cause failure

### File Format

```
[Magic: "CBX"][Version: 1][Salt: 32B][Nonce: 12B][AuthTag: 16B][Encrypted JSON payload]
```

The encrypted payload contains:
- Schema version
- Creation timestamp
- Handoff file content (UTF-8)
- File list with relative paths and SHA-256 hashes
- File contents (stored as binary)

### Limitations

- **No passphrase recovery**: Lost passphrases cannot be recovered
- **No key rotation**: Bundle must be re-encrypted to change passphrase
- **Single-user scope**: Encrypted bundles are not designed for multi-user sharing

## Release integrity

Tagged releases publish `SHA256SUMS.txt` for the Windows, macOS, and Linux archives.

The 1.0 packages are currently unsigned / not notarized. A checksum proves that a downloaded archive matches the GitHub Release asset; it is not a substitute for future platform code signing.

## Reporting Security Issues

If you discover a security vulnerability in ContinuityBridge, please report it responsibly via the project's security policy or contact the maintainers directly.
