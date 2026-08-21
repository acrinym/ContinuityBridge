# Troubleshooting Guide

## Encrypted Portable Bundles

### Common Issues

#### "decryption failed: wrong passphrase or corrupted data"

**Cause**: The passphrase entered is incorrect or the bundle was corrupted.

**Solutions**:
- Verify you're using the correct passphrase
- Check that the .cbx file wasn't modified after creation
- Try re-encrypting the bundle with a new passphrase

#### "passphrase required via --passphrase-stdin or TTY prompt"

**Cause**: The CLI can't prompt for a passphrase in non-interactive mode.

**Solutions**:
- Use `--passphrase-stdin` flag and provide passphrase via stdin
- Run the command in an interactive terminal
- For scripting, pipe the passphrase: `echo -e "passphrase\npassphrase" | continuity-bridge portable encrypt ...`

#### "preflight validation failed: path escapes restore root"

**Cause**: The bundle contains a path that would write outside the target directory.

**Solutions**:
- This should not happen with normally-created bundles
- Check the bundle wasn't tampered with
- Try restoring to a fresh directory

#### "existing files would be overwritten"

**Cause**: The restore target already contains files with the same names.

**Solutions**:
- Use `--overwrite` flag to replace existing files
- Restore to a different directory
- Delete existing files in the target directory

#### "restore root is a symlink, refusing to restore"

**Cause**: The restore target is a symbolic link.

**Solutions**:
- Restore to a regular directory path
- Remove the symlink and create a regular directory instead

#### "path component is a symlink"

**Cause**: One of the directories in the restore path is a symbolic link.

**Solutions**:
- Check that the restore directory doesn't contain symlinks
- Restore to a different directory without symlinks

### Testing Encrypted Bundles

To verify an encrypted bundle works:

```bash
# 1. Inspect the bundle
continuity-bridge portable inspect encrypted.cbx --json

# 2. Restore to a test directory
continuity-bridge portable restore encrypted.cbx --output ./test-restore/

# 3. Verify contents
ls -la ./test-restore/
```

### Bundle Size

Encrypted bundles may be larger than unencrypted because:
- Binary file contents are base64-encoded in the JSON payload
- Each file includes its SHA-256 hash
- The encryption adds overhead (salt, nonce, auth tag)

## Import Issues

### "No conversations found"

**Cause**: The export directory structure isn't recognized.

**Solutions**:
- Ensure you're pointing to the correct export directory
- For ChatGPT: use the folder containing `conversations.json`
- For Claude: use the folder containing `conversations.json`

### "Attachment not found"

**Cause**: An artifact referenced in a conversation isn't in the export.

**Solutions**:
- Re-export with all attachments
- Use `--select` to explicitly choose available artifacts

## Capture Issues

### "Connection refused"

**Cause**: The capture server isn't running or is on a different port.

**Solutions**:
- Start the server: `continuity-bridge capture server --port 8765`
- Verify the port matches your client configuration
- Check for firewall blocking

### "Invalid token"

**Cause**: The capture submission uses the wrong token.

**Solutions**:
- Ensure the token matches the server's configured token
- Check for typos in the token

## Desktop Application

### "Lore not found"

**Cause**: The bundled Lore runtime isn't available.

**Solutions**:
- Download a complete release package
- Ensure the application was properly installed

### Performance Issues

**Solutions**:
- Close unnecessary conversations
- Clear old workstation state
- Use selective import instead of full imports
