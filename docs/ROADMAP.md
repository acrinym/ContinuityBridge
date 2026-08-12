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

## Completed product trains

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

### 0.9 — Explicit live capture

- Public `continuity-bridge/live-capture-v1` payload contract.
- Same normalized Lore batch and incremental checkpoint boundary as imported history.
- Non-mutating inspect, explicit one-shot submit, and authenticated loopback receiver.
- Workstation Capture area with OFF/ON state, exact destination, port/token, manual JSON path, and explicit Start/Stop.
- Manifest V3 browser companion with one-shot extraction only after a user click.
- Supported visible ChatGPT/Claude message markers only; unsupported structures refuse instead of guessing.
- Credential/query/fragment stripping, default message redaction, and Workstation-owned receiver lifecycle.

Success condition achieved: supported active conversations can be deliberately refreshed into Lore and retrieved through the same Recall surface as imported history, with no hidden always-on capture service.

## Active train

### 1.0 — Finished public continuity workstation

Goal: remove the last toolchain-shaped gap from the downloadable app and make the packaged product usable without a source checkout, npm-based Lore install, or architecture knowledge.

Ship:

- Pin and install `@jordanhindo/lore` 0.2.0 during each platform release build so native runtime dependencies match Windows, macOS, or Linux.
- Bundle the complete Lore runtime alongside the existing embedded Node runtime and ContinuityBridge engine.
- Add a stable packaged `ContinuityBridgeLore` executable that forwards Lore CLI/MCP arguments into the bundled runtime while preserving stdio semantics.
- Prefer the bundled Lore launcher automatically in packaged Workstation builds while preserving explicit custom Lore command overrides and PATH-based source installs.
- Migrate the old saved default value `lore` to the bundled launcher when opening a packaged application.
- Configure Codex, Claude Code, and Cursor against the same stable packaged Lore executable rather than requiring a globally installed npm command.
- Add an explicit first-run **Initialize local memory** action that runs Lore setup through the selected local runtime; it detects/indexes supported local transcript sources and does not mutate AI-client configuration.
- Replace packaged setup instructions that previously required `npm install -g @jordanhindo/lore`.
- Include Lore license/third-party component notice with release documentation and retain packaged dependency license files.
- Verify the bundled Lore launcher during the existing manual/tag-driven platform release workflow before an archive is published.
- Version the Workstation, Node package, capture companion, and macOS bundle consistently at 1.0.0.

Release acceptance journey:

1. Download a Windows/macOS/Linux ContinuityBridge package and launch it without installing Node or Lore separately.
2. First run reports the bundled bridge/Lore runtime and offers **Initialize local memory**.
3. Initialize local memory or bring evidence in through History/Capture.
4. Search exact evidence in Recall and optionally narrow it by repository context.
5. Preview and configure an installed supported AI client to the packaged Lore MCP command.
6. Prove the client/Lore continuity path from a real returned message ID.
7. Build an evidence-backed continuation package with optional repository coordinates and safe local artifacts.
8. Update or remove the application without silently deleting user-owned Lore/ContinuityBridge data.

## Post-1.0 product directions

These are opportunities, not commitments:

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
