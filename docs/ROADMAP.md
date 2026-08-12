# ContinuityBridge Product Roadmap

ContinuityBridge is a local-first continuity product for moving user-authorized conversation evidence between AI tools without requiring model API credits or a hosted memory service.

The roadmap is organized around user-visible product capabilities. Tests and safety checks exist to protect those capabilities; they are not a separate product and should not grow into recursive review or audit machinery.

## Product principles

1. **User-owned continuity.** Conversation records, indexes, manifests, generated handoffs, and explicitly bundled artifacts stay under the user's control.
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

## Active train

### 0.6 — Safe attachment continuity

Goal: let a user deliberately carry local artifacts referenced by supported conversation exports alongside an evidence-backed handoff, without exposing provider-private pointers or searching arbitrary filesystem locations.

Ship:

- Attachment-reference enumeration for ChatGPT and Claude exports.
- Local artifact resolution bounded to the selected export root.
- Explicit attachment selection before any copy operation.
- A user-selected portable bundle containing copied artifacts and `attachments.json`.
- SHA-256 content hashes and copy verification.
- Conversation/message/provider provenance for each attachment reference.
- Explicit `missing` and `ambiguous` states instead of silently dropping unavailable artifacts.
- No signed provider URLs, opaque file IDs, or raw asset pointers in inspection, manifests, or handoffs.
- Relative artifact paths from the generated handoff so the entire bundle can move to another machine or directory.
- Handoff Builder integration for selected attachments.
- Desktop scan, select, preview, and bundle workflow over the same CLI contract.
- Synthetic attachment fixtures only.

Success condition: open a supported export containing synthetic attachment references, inspect which artifacts are actually local, explicitly choose what to carry, build a portable handoff bundle, verify copied artifacts by SHA-256, move the bundle to another path, and resolve its artifacts using only relative paths and provenance—without provider credentials or signed URLs.

## Next product trains

### 0.7 — Repository-aware continuity links

- Associate conversations and handoffs with repository remotes, branches, commits, issues, and pull requests.
- Preserve links as lightweight metadata rather than inventing another graph database.
- Let searches narrow by project/repository context.

### 0.8 — Explicit live capture

- User-controlled capture from supported local/browser/desktop surfaces when technically available.
- Clear on/off state and destination.
- Incremental writes through the same normalized public contract.
- No hidden scraping and no assumption that provider-private APIs exist.

### 0.9 — Additional providers and import families

Prioritize sources with stable user exports or local transcript stores. Candidate adapters include Gemini exports and additional coding-agent/session formats not already handled directly by Lore.

Every provider must pass the same fidelity, privacy, stable-ID, and synthetic-fixture requirements.

### 1.0 — Finished public continuity workstation

Release criteria:

- Import/browse supported chat exports.
- Incrementally refresh existing history.
- Configure and prove MCP access from supported clients.
- Build evidence-backed handoffs tied to code state.
- Carry safe local attachments when explicitly requested.
- Clear install/update/uninstall paths on Windows, macOS, and Linux.
- Documentation that takes a new user from installation to a proven cross-AI recall without requiring architecture knowledge.

## Later directions

These are product opportunities, not commitments:

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
