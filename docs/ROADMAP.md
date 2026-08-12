# ContinuityBridge Product Roadmap

ContinuityBridge is a local-first continuity product for moving user-authorized conversation evidence between AI tools without requiring model API credits or a hosted memory service.

The roadmap is organized around user-visible product capabilities. Tests and safety checks exist to protect those capabilities; they are not a separate product and should not grow into recursive review or audit machinery.

## Product principles

1. **User-owned continuity.** Conversation records, indexes, manifests, generated handoffs, local workstation state, and explicitly bundled artifacts stay under the user's control.
2. **Evidence before summaries.** Preserve original messages, provenance, stable identifiers, and artifact hashes so another AI can inspect the source instead of trusting an opaque rewrite.
3. **One store, not another store.** Lore remains the durable local memory/search/MCP layer unless its public contract becomes insufficient.
4. **Provider-neutral surfaces.** ChatGPT and Claude are current sources, not architectural assumptions.
5. **Explicit mutation.** Import, client configuration, attachment copying, deletion, and live capture must be intentional and inspectable.
6. **No audit-the-audit machinery.** Build product behavior. Add focused tests and guardrails only where they protect real user-facing behavior.
7. **No private implementation leakage.** Public fixtures, docs, examples, and identifiers stay synthetic and generic.

## Completed foundation

### 0.1 — ChatGPT → Lore continuity

- ChatGPT ZIP, folder, and JSON import.
- Full conversation-tree preservation, including regenerated branches.
- Stable Lore-compatible IDs.
- Credential redaction and safe attachment descriptions.
- JSONL export and direct `lore push` delivery.

### 0.2 — Desktop + Claude

- Installable Tkinter desktop browser/importer.
- Claude ZIP, folder, and JSON import.
- Search, preview, selection, and local settings.
- Shared CLI contract between desktop and automation.

### 0.3 — MCP Control Center

- Lore health and MCP startup verification.
- Codex, Claude Code, and Cursor connection management.
- Exact configuration preview before mutation.
- Continuity proof through Lore search → real message ID → surrounding context.

### 0.4 — Incremental imports and resume

- Destination-aware local manifests.
- Skip unchanged conversations on repeated Lore imports.
- Atomic checkpoints after confirmed pushes.
- Crash resume and forced re-import controls.
- Complete JSONL snapshots even when Lore delivery is incremental.

### 0.5 — Handoff Builder

- Search-driven or explicit-message-ID evidence selection.
- Bounded Lore context retrieval using only real returned IDs.
- Repository coordinates: remote, branch, head commit, and dirty/clean state.
- Markdown and JSON handoff formats.
- No model call and no generated interpretation layer.
- Source/session/message provenance for every evidence block.
- Desktop Handoff Builder surface over the same core contract.

Success condition achieved: a user can hand another AI one generated file and that AI can locate the source conversations and current code state without a giant pasted transcript.

### 0.6 — Safe attachment continuity

- Attachment-reference enumeration for ChatGPT and Claude exports.
- Local artifact resolution bounded to the selected export root.
- Explicit attachment selection before any copy operation.
- User-selected portable bundles containing copied artifacts and `attachments.json`.
- SHA-256 content hashes and copy verification.
- Conversation/message/provider provenance for each attachment reference.
- Explicit `missing` and `ambiguous` states instead of silently dropping unavailable artifacts.
- No signed provider URLs, opaque file IDs, or raw asset pointers in inspection, manifests, or handoffs.
- Relative artifact paths from generated handoffs so a bundle can move to another machine or directory.
- Handoff Builder and desktop scan/select/preview/bundle integration.

Success condition achieved: a user can deliberately carry locally available artifacts alongside continuation evidence without giving the next AI provider-private download tokens or arbitrary filesystem access.

## Active train

### 0.7 — ContinuityBridge Workstation

Goal: turn the existing continuity engines into one normal-person desktop product with one launch point and one complete journey from local history to continued work.

Ship:

- One `ContinuityBridge` desktop application with Home, History, Recall, Connections, and Continue areas.
- A Home readiness view that detects the bundled bridge runtime, Lore/MCP health, Git support, and supported AI clients.
- Guided local setup help when Lore or optional Git support is missing.
- Recent history sources and recent handoffs persisted locally for quick return/refresh.
- History import and incremental refresh inside the workstation rather than a separate importer utility.
- A real Recall library surface that searches Lore, exposes real message IDs, and retrieves surrounding source context.
- One-click transfer of selected Recall evidence into the Continue workflow.
- Integrated client connection status, exact MCP configuration preview, confirmation, and application for Codex, Claude Code, and Cursor.
- Integrated continuation package construction with task/evidence selection, repository coordinates, attachment scanning/selection, non-mutating preview, and explicit bundle build.
- Bundled Node runtime and ContinuityBridge Node engine inside packaged desktop builds so end users do not need to understand the Python/Node split.
- Windows portable executable bundle, macOS `.app` bundle, and Linux portable application bundle generated by the release workflow.
- Tagged releases publish those platform packages as GitHub Release assets.
- Existing specialist desktop commands remain available for compatibility, while `continuity-bridge-desktop` and `continuity-bridge-gui` launch the unified workstation.

Success condition: download a platform package, launch ContinuityBridge, check local readiness, import or refresh a ChatGPT/Claude export, search old evidence inside the app, connect an installed AI client, send exact evidence into Continue, optionally add repository state and local attachment artifacts, preview without copying, then build a portable continuation package without opening another ContinuityBridge utility or requiring a source checkout.

## Next product trains

### 0.8 — Repository-aware continuity links

- Associate conversations and handoffs with repository remotes, branches, commits, issues, and pull requests.
- Preserve links as lightweight metadata rather than inventing another graph database.
- Let Recall narrow by project/repository context.
- Surface related handoffs and code coordinates inside the Workstation where users can actually act on them.

### 0.9 — Explicit live capture

- User-controlled capture from supported local/browser/desktop surfaces when technically available.
- Clear on/off state and destination.
- Incremental writes through the same normalized public contract.
- No hidden scraping and no assumption that provider-private APIs exist.

### 1.0 — Finished public continuity workstation

Release criteria:

- Import/browse supported chat exports.
- Incrementally refresh existing history.
- Search and inspect source evidence inside the Workstation.
- Configure and prove MCP access from supported clients.
- Build evidence-backed handoffs tied to code state.
- Carry safe local attachments when explicitly requested.
- Downloadable Windows, macOS, and Linux application packages.
- Clear update/uninstall guidance for packaged and source installs.
- Documentation that takes a new user from download to proven cross-AI recall without requiring architecture knowledge.

## Later directions

These are product opportunities, not commitments:

- Additional providers and import families with stable exports or local transcript stores.
- IDE-native Handoff Builder panels.
- Portable encrypted continuity bundles.
- Multi-machine synchronization through user-selected storage.
- More granular relationship views between conversation evidence and code changes.
- Provider plugins loaded through a stable adapter contract.

## Explicit non-goals

ContinuityBridge will not become:

- another general-purpose AI memory database beside Lore;
- a hosted archive of private conversations by default;
- an autonomous system that changes client configuration without user confirmation;
- an identity-preservation or assistant-personality product;
- a provider-URL downloader or blind filesystem scraper for attachments;
- recursive auditing, review-of-review, test-of-test, or governance machinery whose main output is more internal inspection.

The direction remains simple: make continuity easier to **import, find, connect, carry, and continue**.
