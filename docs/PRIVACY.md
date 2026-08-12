# Privacy

ContinuityBridge processes private conversation history and explicitly selected local artifacts, so privacy is a product requirement rather than a disclaimer.

## Local-first execution

Import, inspection, attachment bundling, repository linking, handoff generation, local-memory initialization, and live-capture processing run against local files/processes. ContinuityBridge does not require a hosted memory account or model-provider API call for these workflows.

Output is either:

- shown as a bounded local desktop/CLI preview;
- written to a user-selected JSONL or handoff path;
- copied into a user-selected local attachment bundle; or
- sent through the selected local Lore CLI/push process.

## Bundled Lore runtime vs. user data

ContinuityBridge 1.0 packaged releases include a pinned Lore runtime and its production dependencies. That bundled code is application software, not a bundled conversation database.

Durable Lore evidence remains outside the application package at the normal user-owned database location (`~/.lore/lore.db` by default or configured `LORE_DB`). ContinuityBridge convenience/checkpoint metadata remains under `~/.continuity-bridge/`.

Replacing or deleting the application package therefore does not silently replace or delete user evidence.

The packaged `ContinuityBridgeLore` executable is a launcher into the bundled Lore runtime. It does not proxy conversation contents through a ContinuityBridge service.

## Explicit local-memory initialization

**Initialize local memory** is a user-triggered action. It invokes Lore's local `setup` command through the selected runtime so Lore can detect/index supported local transcript sources and verify retrieval.

ContinuityBridge does not run this automatically at startup and does not use this action to mutate Codex, Claude Code, or Cursor configuration. Users can skip it and instead import/capture evidence explicitly.

## Default credential redaction

Before conversation text reaches previews or normalized output, ContinuityBridge redacts common forms of model-provider API keys, GitHub tokens, AWS access-key IDs, bearer tokens, private-key blocks, and values assigned to common password/token/secret/API-key fields.

Redaction is a safety net, not a perfect secret scanner. Explicit redaction opt-outs remain deliberate user choices. Live capture uses redaction by default.

## Paths and conversation attachment descriptions

Absolute export paths are not stored in Lore records. Non-sensitive provider/capture URIs are used instead.

Raw attachment pointers, signed URLs, download URLs, and opaque provider file IDs are not copied into searchable conversation text. Useful file names and media types may be retained.

## Explicit live capture

Live capture has the following boundaries:

- capture is OFF until the user starts the Workstation receiver or explicitly runs `capture submit`;
- `capture submit` and `capture serve` refuse mutation unless `--to-lore` is present;
- the HTTP receiver binds only to `127.0.0.1` and exposes no LAN bind option;
- capture POSTs require a bearer token;
- the Workstation creates a fresh token each application run and does not persist it in desktop settings;
- closing the Workstation stops the receiver process it started;
- the browser companion has no always-running page observer and injects extraction only after an explicit Capture click;
- only recognized visible ChatGPT/Claude message markers are accepted; unsupported structures are refused rather than guessed;
- captured source URLs have credentials, query strings, and fragments removed before normalization;
- live capture uses the same Lore push and incremental checkpoint boundaries as imported history;
- no provider cookies, private APIs, signed URLs, or hidden desktop transcript stores are exported by ContinuityBridge;
- local/desktop tools without a supported transcript surface can emit the public `continuity-bridge/live-capture-v1` JSON contract instead.

The browser companion stores its loopback port/token in extension-local browser storage for usability. The token authorizes only that local receiver and stops being useful after the receiver stops or its token changes.

## AI-client configuration

Connections always previews the exact target/configuration and requires explicit confirmation before changing supported client configuration.

In packaged 1.0 builds, the configured MCP command may point to the local packaged `ContinuityBridgeLore` executable. Bundling the executable does not itself configure any AI client.

## Safe attachment continuity

Attachment inspection and bundling remain confined to the selected ChatGPT/Claude export root. Absolute paths, parent traversal, data/remote URLs, and symbolic-link traversal are rejected; provider-private reference values are not emitted; copy operations require explicit selection; copied files are SHA-256 verified; missing/ambiguous artifacts stay visible; portable handoffs use relative artifact paths.

The generated `attachments.json` manifest contains safe provenance and integrity metadata, not the original remote provider pointer.

## Desktop settings

The Workstation stores convenience preferences under `~/.continuity-bridge/`. These settings do not contain conversation previews or copied attachment contents. Repository-link metadata contains coordinates and Lore IDs rather than message bodies. The live receiver token is intentionally not saved.

Packaged Lore command migration recognizes prior `ContinuityBridgeLore` paths so app-folder replacement can retarget to the current sibling launcher; explicit custom Lore paths are preserved.

## No bundled personal data

Tests and examples use synthetic fixtures. The repository and release application payload must never include real conversation exports, real local artifacts from user conversations, local databases, private messages, credentials, or screenshots of private conversations.

## Third-party runtime

Packaged 1.0 releases include pinned `@jordanhindo/lore` 0.2.0 and production dependencies installed during the target-platform release build. The project NOTICE records Lore's MIT license, and package-local third-party license files remain in the bundled runtime tree.

## Public extraction boundary

Code derived from private utilities must be reviewed as if it came from an untrusted source. Only generic import, export, browsing, portability, capture, packaging, and UI behavior may cross into this public project. Private profiles, classifiers, archives, personal names, specialized datasets, and private fixtures are prohibited.
