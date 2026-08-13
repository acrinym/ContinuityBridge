# ContinuityBridge Product Roadmap

ContinuityBridge is a local-first continuity product for moving user-authorized conversation evidence between AI tools without requiring model API credits or a hosted memory service.

The roadmap is organized around user-visible product capabilities. Tests and safety checks exist to protect those capabilities; they are not a separate product and should not grow into recursive review or audit machinery.

## Product principles

1. **User-owned continuity.** Conversation records, indexes, manifests, generated handoffs, local workstation state, repository links, and explicitly bundled artifacts stay under the user's control.
2. **Evidence before summaries.** Preserve original messages, provenance, stable identifiers, and artifact hashes so another AI can inspect the source instead of trusting an opaque rewrite.
3. **One store, not another store.** Lore remains the durable local memory/search/MCP layer unless its public contract becomes insufficient.
4. **Provider-neutral surfaces.** ChatGPT and Claude are current sources, not architectural assumptions.
5. **Explicit mutation.** Import, client configuration, attachment copying, repository linking, deletion, and live capture must be intentional and inspectable.
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

### 0.6 — Safe attachment continuity

- Attachment-reference enumeration for ChatGPT and Claude exports.
- Local artifact resolution bounded to the selected export root.
- Explicit attachment selection before any copy operation.
- Portable bundles with SHA-256 verified local artifacts and provenance.
- Explicit missing/ambiguous states and no provider-private download pointers.

### 0.7 — ContinuityBridge Workstation

- One Home / History / Recall / Connections / Continue application.
- Guided first-run readiness and return-user recent state.
- History import/refresh, Lore Recall, MCP client connection management, and continuation package generation in one cockpit.
- Packaged Node runtime + ContinuityBridge engine for Windows, macOS, and Linux release bundles.
- Preview remains non-mutating; artifact copying remains explicit.

### 0.8 — Repository-aware continuity links

- User-owned lightweight repository-link metadata; no copied message bodies or graph database.
- Credential-free repository identity with local fallback.
- Explicit evidence → repository / issue / pull-request links.
- Repository-filtered Recall and Recall → Continue context restoration.
- Related exact Lore evidence and prior handoffs surfaced in Continue.
- `handoff-v3` issue/PR coordinates and automatic handoff backlinking.
- Ambiguous multi-repository evidence requires explicit repository selection.
- Query-derived handoff anchors are linked using the exact resolved Lore message IDs.

Success condition achieved: repository/code context can narrow and restore continuity while Lore remains the sole conversation evidence store.

## Active train

### 0.9 — Explicit live capture

Goal: let a user deliberately carry supported active conversations into Lore without waiting for a full export, hidden scraping, or provider-private APIs.

Ship:

- Public `continuity-bridge/live-capture-v1` payload contract for ordered conversation messages.
- Normalization into the same Lore batch boundary as imported history.
- Shared incremental resume-token/checkpoint behavior so unchanged captures are skipped.
- `continuity-bridge capture inspect` for non-mutating validation.
- `continuity-bridge capture submit ... --to-lore` for explicit one-shot local/desktop ingestion.
- `continuity-bridge capture serve --to-lore` as an authenticated `127.0.0.1`-only receiver.
- A clear Workstation Capture area with OFF/ON state, exact destination, port, fresh token, Start/Stop, manual file path, and last result.
- A bundled Manifest V3 browser companion that performs one-shot extraction only after an explicit Capture click.
- Supported ChatGPT/Claude browser capture only when recognized visible message markers are present; otherwise refuse rather than guess.
- Credential/query/fragment stripping from captured source URLs and existing credential redaction on message text by default.
- Workstation-owned receiver lifecycle: closing the application stops its receiver child process.

Success condition: start Capture, explicitly capture a supported visible conversation into Lore, see unchanged repeated capture skip through the incremental checkpoint, capture a new message as an update, retrieve it through Recall, then stop Capture and leave no listener running.

## Next product train

### 1.0 — Finished public continuity workstation

Release criteria:

- Import/browse supported chat exports.
- Incrementally refresh existing history.
- Explicitly capture supported active conversations with clear on/off and destination state.
- Search and inspect source evidence inside the Workstation.
- Narrow recall and continuation by repository/code context.
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
- a graph database just to connect conversation evidence to code coordinates;
- a hosted archive of private conversations by default;
- an autonomous system that changes client configuration without user confirmation;
- an identity-preservation or assistant-personality product;
- a provider-URL downloader or blind filesystem scraper for attachments;
- a hidden always-on browser/desktop scraper;
- recursive auditing, review-of-review, test-of-test, or governance machinery whose main output is more internal inspection.

The direction remains simple: make continuity easier to **import, find, connect, carry, and continue**.
