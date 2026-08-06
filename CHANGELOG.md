# Changelog

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
