# Privacy

ContinuityBridge processes private conversation history, so privacy is a product requirement rather than a disclaimer.

## Local-only execution

The application performs no provider or model network calls. Input is read from a local ZIP, directory, or JSON file. Output is either:

- shown as a bounded local desktop/CLI preview;
- written to a user-selected JSONL path; or
- sent over stdin to a local `lore push` process.

## Default credential redaction

Before text reaches previews or output, ContinuityBridge redacts common forms of:

- model-provider API keys;
- GitHub tokens;
- AWS access-key IDs;
- bearer tokens;
- private-key blocks;
- values assigned to common password, token, secret, and API-key fields.

Redaction is a safety net, not a perfect secret scanner. `--no-redact` and the desktop redaction checkbox are deliberate opt-outs.

## Paths and attachments

Absolute export paths are not stored in Lore records. Non-sensitive `chatgpt-export://` and `claude-export://` URIs are used instead.

Raw attachment pointers, signed URLs, download URLs, and opaque provider file IDs are not copied into searchable text. Useful file names and media types may be retained.

## Desktop settings

The GUI stores preferences at `~/.continuity-bridge/desktop.json`. It does not store conversation previews, export contents, or credentials there.

## No bundled personal data

Tests and examples use synthetic fixtures. The repository must never contain real exports, local databases, private messages, credentials, or screenshots of private conversations.

## Public extraction boundary

Code derived from private utilities must be reviewed as if it came from an untrusted source. Only generic import, export, browsing, and UI behavior may cross into this public project. Private profiles, classifiers, archives, personal names, specialized datasets, and private fixtures are prohibited.
