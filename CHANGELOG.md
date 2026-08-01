# Changelog

## Unreleased — Dependency maintenance

- Added weekly Dependabot update lanes for npm, desktop Python, and GitHub Actions.
- Added grouped patch/minor updates while leaving major releases for human review.
- Added guarded squash auto-merge after exact-head CI success and dependency-only file validation.
- Added a privileged-workflow safety test and operating documentation.

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
