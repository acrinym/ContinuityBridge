# ContinuityBridge User Guide

ContinuityBridge bridges AI conversation continuity across providers and sessions.

## Quick Start

### Importing Conversations

```bash
# Import ChatGPT exports
continuity-bridge import-chatgpt /path/to/chatgpt-export

# Import Claude exports  
continuity-bridge import-claude /path/to/claude-export
```

### Creating Handoffs

```bash
# Create a handoff from a conversation
continuity-bridge handoff --task "Explain the authentication system" --evidence

# With repository context
continuity-bridge handoff --task "Fix the login bug" --repo owner/repo --issue 123
```

## Portable Bundles

ContinuityBridge supports creating portable bundles that include all necessary artifacts.

### Creating a Bundle

```bash
# Bundle artifacts from a ChatGPT export
continuity-bridge attachments chatgpt /path/to/export --select "diagram.png" --output my-bundle/
```

### Encrypted Portable Bundles (.cbx)

For sensitive handoffs, you can create encrypted portable bundles:

```bash
# Encrypt a handoff file
continuity-bridge portable encrypt ./my-handoff.md --output encrypted.cbx

# Encrypt a bundle directory
continuity-bridge portable encrypt ./my-bundle/ --output encrypted.cbx
```

The encrypt command requires a passphrase, which must be provided via stdin (not as a command-line argument). You'll be prompted to enter and confirm the passphrase.

#### Inspecting an Encrypted Bundle

View bundle contents without decrypting:

```bash
continuity-bridge portable inspect encrypted.cbx
# Or with JSON output:
continuity-bridge portable inspect encrypted.cbx --json
```

#### Restoring an Encrypted Bundle

Decrypt and extract to a directory:

```bash
continuity-bridge portable restore encrypted.cbx --output ./restored/
```

Use `--overwrite` to replace existing files:

```bash
continuity-bridge portable restore encrypted.cbx --output ./restored/ --overwrite
```

## Capture Mode

Real-time conversation capture:

```bash
# Start capture server
continuity-bridge capture server --port 8765 --token your-secret-token

# Submit a capture
continuity-bridge capture submit --source chatgpt --conversation-id abc123 --messages-file messages.json
```

## Desktop Application

The ContinuityBridge desktop application provides a GUI for all operations. Download from the releases page for your platform.

### Handoff Builder

Create and manage handoffs with the visual builder:

1. Select a conversation source
2. Choose artifacts to include
3. Add task context
4. Generate handoff

### Portable Operations

The desktop app also supports encrypted bundle operations:

- **Encrypt**: Create encrypted .cbx bundles
- **Inspect**: Preview bundle contents
- **Restore**: Decrypt and extract bundles

## Security Considerations

- Passphrases are never passed via command-line arguments
- Encrypted bundles use AES-256-GCM with scrypt key derivation
- All artifacts are SHA-256 verified during bundle and restore operations
- No passphrase recovery is possible—lost passphrases cannot be recovered

See [SECURITY.md](../SECURITY.md) for full security details.
