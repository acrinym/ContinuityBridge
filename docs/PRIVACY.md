# Privacy

ContinuityBridge processes private conversation history and explicitly selected local artifacts, so privacy is a product requirement rather than a disclaimer.

## Local-only execution

The application performs no provider or model network calls for import, inspection, attachment bundling, or handoff generation. Input is read from a local ZIP, directory, or JSON file. Output is either:

- shown as a bounded local desktop/CLI preview;
- written to a user-selected JSONL or handoff path;
- copied into a user-selected local attachment bundle; or
- sent over stdin to a local `lore push` process.

## Default credential redaction

Before conversation text reaches previews or normalized output, ContinuityBridge redacts common forms of:

- model-provider API keys;
- GitHub tokens;
- AWS access-key IDs;
- bearer tokens;
- private-key blocks;
- values assigned to common password, token, secret, and API-key fields.

Redaction is a safety net, not a perfect secret scanner. `--no-redact` and the desktop redaction checkbox are deliberate opt-outs.

## Paths and conversation attachment descriptions

Absolute export paths are not stored in Lore records. Non-sensitive `chatgpt-export://` and `claude-export://` URIs are used instead.

Raw attachment pointers, signed URLs, download URLs, and opaque provider file IDs are not copied into searchable conversation text. Useful file names and media types may be retained.

## Safe attachment continuity

Train 006 adds an explicit local portability lane for attachment artifacts. It does **not** weaken the pointer-suppression rule above.

Attachment inspection and bundling follow these boundaries:

- discovery is confined to the selected ChatGPT or Claude export root;
- absolute paths, parent-traversal candidates, data URLs, and remote URLs are rejected as local artifact candidates;
- symbolic links are not followed during export-root enumeration;
- provider-private reference values are never emitted in inspection JSON, `attachments.json`, or handoffs;
- provider-private references may be represented only by a one-way SHA-256 fingerprint for provenance comparison;
- no signed URL, provider `file_id`, or opaque asset pointer is used to download content;
- copy operations require explicit attachment IDs or an explicit all-attachments choice;
- copied files are hashed before and after transfer;
- missing and ambiguous artifacts stay visible instead of being silently omitted;
- portable handoffs reference copied artifacts using paths relative to the handoff file.

The generated `attachments.json` manifest contains safe provenance and integrity metadata, not the original remote provider pointer.

## Desktop settings

The import GUI stores preferences at `~/.continuity-bridge/desktop.json`. The Handoff Builder stores its own local preferences under `~/.continuity-bridge/handoff-builder.json`. These settings do not contain conversation previews or copied attachment contents.

## No bundled personal data

Tests and examples use synthetic fixtures. The repository must never contain real exports, real local artifacts from user conversations, local databases, private messages, credentials, or screenshots of private conversations.

## Public extraction boundary

Code derived from private utilities must be reviewed as if it came from an untrusted source. Only generic import, export, browsing, portability, and UI behavior may cross into this public project. Private profiles, classifiers, archives, personal names, specialized datasets, and private fixtures are prohibited.
