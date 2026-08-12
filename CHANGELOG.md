# Changelog

## 0.7.0 — Train 7

- Added one unified ContinuityBridge Workstation with Home, History, Recall, Connections, and Continue areas.
- Added first-run/return-user readiness checks for the bridge runtime, Lore CLI/database/MCP server, Git, and supported AI clients.
- Added local recent-source, last-import, and recent-handoff state so users can return to real work without rediscovering paths.
- Integrated ChatGPT/Claude browse, selected import, full import, JSONL output, and incremental refresh into the Workstation.
- Added a user-facing Lore Recall library with real message IDs, source evidence, surrounding context retrieval, and direct transfer into Continue.
- Integrated Codex, Claude Code, and Cursor MCP status/configuration preview and explicit-confirmation setup into the same application.
- Integrated Handoff Builder and Safe Attachment Continuity into Continue, including non-mutating preview and explicit artifact-copy build behavior.
- Added packaged runtime discovery so desktop builds automatically use an embedded Node.js runtime and the bundled ContinuityBridge Node engine.
- Added PyInstaller packaging for Windows, macOS, and Linux plus a tagged GitHub Release workflow.
- Added `continuity-bridge-desktop` as the primary workstation command and made `continuity-bridge-gui` a compatibility alias to it.
- Added focused workstation-state and Lore-library contract tests and expanded desktop compile checks.
- Advanced repository-aware continuity behind the Workstation train so future project linking lands in a user-facing cockpit rather than another standalone subsystem.

## Unreleased — Dependency maintenance

- Added weekly Dependabot update lanes for npm, desktop Python, and GitHub Actions.
- Added grouped patch/minor updates while leaving major releases for human review.
- Added guarded merge-commit automation after exact-head CI success and paginated dependency-only file validation.
- Added a privileged-workflow safety test and operating documentation.

## 0.6.0 — Train 6

- Added `continuity-bridge attachments` to enumerate attachment references from ChatGPT and Claude exports without exposing signed URLs, opaque provider file IDs, or raw asset pointers.
- Added export-root-bounded local artifact resolution with explicit available, missing, and ambiguous states.
- Added explicit attachment selection before copying and portable `attachments.json` manifests.
- Added SHA-256 hashing, post-copy verification, deterministic bundle paths, conflict refusal, and explicit overwrite control.
- Added conversation/message/provider provenance for every attachment reference.
- Upgraded Handoff Builder to `continuity-bridge/handoff-v2` with selected attachment plans and portable artifact bundles referenced by relative path.
- Kept generated handoffs inside attachment bundles so moving the directory preserves artifact references.
- Added desktop attachment scan, multi-select, preview, and bundle creation through the same public CLI contract.
- Added synthetic local attachment fixtures and coverage for copied, missing, pointer-suppressed, hashed, and portable artifacts.
- Corrected the public roadmap so 0.6 Safe Attachment Continuity is the active train and 0.5 is completed.

## 0.5.0 — Train 5

- Added `continuity-bridge handoff` for evidence-backed cross-AI continuation packages.
- Added search-driven and explicit Lore message-ID evidence selection.
- Added bounded source-context retrieval using real Lore identifiers rather than model-generated summaries.
- Added repository remote, branch, head-commit, and working-tree coordinates with credential-safe remote handling.
- Added Markdown and JSON handoff formats with provenance and continuation rules.
- Added the `continuity-bridge-handoff` Tkinter desktop builder with preview and save workflows.
- Added the public product roadmap and explicit no-recursive-audit product principle.
- Added Node and Python coverage for command safety, Lore ID spending, remote credential scrubbing, rendering, and desktop command construction.

## 0.4.0 — Train 4

- Added destination-aware incremental manifests for Lore imports.
- Added automatic skipping of unchanged ChatGPT and Claude conversations.
- Added `--manifest`, `--no-manifest`, and `--reimport` controls.
- Added atomic per-conversation checkpoints after confirmed Lore pushes.
- Added crash-resume behavior that never checkpoints a failed conversation.
- Kept JSONL output as a complete portable snapshot instead of an incremental fragment.
- Added malformed-manifest refusal, dry-run planning, destination-isolation, and end-to-end resume tests.

## 0.3.0 — Train 3

- Added a desktop MCP Control Center for Lore, Codex, Claude Code, and Cursor.
- Added Lore executable, database, CLI, and stdio MCP startup checks.
- Added exact configuration previews and explicit user-confirmed setup actions.
- Added safe Cursor JSON merging with timestamped backups.
- Added client configuration detection and reload guidance.
- Added end-to-end continuity proof through Lore search and context retrieval using real returned IDs.
- Added command-construction, configuration-preservation, malformed-config, health, and proof tests.

## 0.2.0 — Train 2

- Added an installable Tkinter desktop application for browsing, searching, previewing, and selectively importing conversations.
- Added Claude ZIP, folder, and JSON ingestion as a first-class provider.
- Added redacted `inspect-chatgpt` and `inspect-claude` JSON summaries.
- Added repeatable `--conversation-id` selection for partial imports.
- Added safe Claude content and attachment normalization.
- Added Python tests, desktop documentation, dual-runtime CI, and public-extraction safeguards.

## 0.1.0 — Train 1

- Added ChatGPT export ZIP, directory, single JSON, and numbered-JSON resolution with duplicate reconciliation.
- Added full conversation-tree parsing with alternate-branch preservation.
- Added Lore-compatible normalized records and stable message IDs.
- Added direct `lore push` integration and portable JSONL output.
- Added default credential redaction and attachment-pointer suppression.
- Added synthetic fixtures, unit tests, smoke test, CI, architecture, and privacy documentation.
