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

Success condition achieved: a user can launch one application and go from exported history to real source recall to a portable continuation package without opening separate ContinuityBridge utilities.

## Active train

### 0.8 — Repository-aware continuity links

Goal: make code context a first-class way to find and continue evidence without creating another graph database or duplicating Lore.

Ship:

- A small user-owned `repository-links.json` that links repositories to real Lore message/session IDs and generated handoff paths.
- Stable repository identity derived from credential-free Git remotes, falling back to explicit local repository identity when no remote exists.
- Explicit issue and pull-request references stored as lightweight continuity coordinates.
- Recall filtering by linked repository context.
- An explicit “link selected evidence” action that associates the chosen Lore record with current repository coordinates plus optional issue/PR refs.
- Recall → Continue transfer that restores the linked local repository and related issue/PR context when available.
- Continue “Find related continuity” that surfaces linked Lore message IDs, prior handoffs, issues, and pull requests for the selected repository.
- “Add related evidence” to reuse exact linked Lore message IDs rather than inventing summaries.
- Generated handoffs upgraded to `continuity-bridge/handoff-v3` with issue and pull-request coordinates under repository metadata.
- Repository-reference URL credential scrubbing and explicit repository verification rules.
- Automatic association of successfully built handoffs back to the selected repository context.

Success condition: link recalled evidence to a repository, issue, or pull request; later choose that repository in Continue; recover the exact linked Lore evidence and prior handoffs; build a continuation package that carries current Git coordinates plus those issue/PR references without introducing another evidence database.

## Next product trains

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
- recursive auditing, review-of-review, test-of-test, or governance machinery whose main output is more internal inspection.

The direction remains simple: make continuity easier to **import, find, connect, carry, and continue**.
