# Privacy

ContinuityBridge processes private conversation history and explicitly selected local artifacts, so privacy is a product requirement rather than a disclaimer.

## Local-first execution

Import, inspection, attachment bundling, repository linking, handoff generation, and local/manual live-capture processing do not call provider or model APIs. Input comes from user-selected exports/files or from an explicitly started loopback receiver. Output is either:

- shown as a bounded local desktop/CLI preview;
- written to a user-selected JSONL or handoff path;
- copied into a user-selected local attachment bundle; or
- sent over stdin to a local `lore push` process.

The optional browser companion reads recognized visible message containers only after the user presses its Capture button and sends the public capture payload only to the authenticated loopback ContinuityBridge receiver at `127.0.0.1`. It does not send captured text to ContinuityBridge-hosted services or provider APIs.

## Default credential redaction

Before conversation text reaches previews or normalized output, ContinuityBridge redacts common forms of model-provider API keys, GitHub tokens, AWS access-key IDs, bearer tokens, private-key blocks, and values assigned to common password/token/secret/API-key fields.

Redaction is a safety net, not a perfect secret scanner. `--no-redact` and the desktop export-import redaction controls are deliberate opt-outs. Live capture uses redaction by default.

## Paths and conversation attachment descriptions

Absolute export paths are not stored in Lore records. Non-sensitive provider/capture URIs are used instead.

Raw attachment pointers, signed URLs, download URLs, and opaque provider file IDs are not copied into searchable conversation text. Useful file names and media types may be retained.

## Explicit live capture

Train 009 adds live capture with the following boundaries:

- capture is OFF until the user starts the Workstation receiver or explicitly runs `capture submit`;
- `capture submit` and `capture serve` refuse mutation unless `--to-lore` is present;
- the HTTP receiver binds only to `127.0.0.1` and exposes no LAN bind option;
- capture POSTs require a bearer token;
- the Workstation creates a fresh token each application run and does not persist it in desktop settings;
- closing the Workstation stops the receiver process it started;
- the browser companion has no always-running page observer and injects extraction only after an explicit Capture click;
- only recognized visible ChatGPT/Claude message markers are accepted; unsupported structures are refused rather than guessed;
- captured source URLs have user credentials, query strings, and fragments removed before normalization;
- live capture uses the same Lore push and incremental checkpoint boundaries as imported history;
- no provider cookies, private APIs, signed URLs, or hidden desktop transcript stores are exported by ContinuityBridge;
- local/desktop tools without a supported transcript surface can emit the public `continuity-bridge/live-capture-v1` JSON contract instead.

The browser companion stores its loopback port/token in that extension's local browser storage for usability. The token authorizes only the local receiver and stops being useful after that Workstation receiver stops or its token changes.

## Safe attachment continuity

Attachment inspection and bundling remain confined to the selected ChatGPT/Claude export root. Absolute paths, parent traversal, data/remote URLs, and symbolic-link traversal are rejected; provider-private reference values are not emitted; copy operations require explicit selection; copied files are SHA-256 verified; missing/ambiguous artifacts stay visible; portable handoffs use relative artifact paths.

The generated `attachments.json` manifest contains safe provenance and integrity metadata, not the original remote provider pointer.

## Desktop settings

The Workstation stores convenience preferences under `~/.continuity-bridge/`. These settings do not contain conversation previews or copied attachment contents. Repository-link metadata contains coordinates and Lore IDs rather than message bodies. The live receiver token is intentionally not saved in Workstation settings.

## No bundled personal data

Tests and examples use synthetic fixtures. The repository must never contain real exports, real local artifacts from user conversations, local databases, private messages, credentials, or screenshots of private conversations.

## Public extraction boundary

Code derived from private utilities must be reviewed as if it came from an untrusted source. Only generic import, export, browsing, portability, capture, and UI behavior may cross into this public project. Private profiles, classifiers, archives, personal names, specialized datasets, and private fixtures are prohibited.
