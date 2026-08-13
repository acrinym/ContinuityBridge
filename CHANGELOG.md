# Changelog

## 1.0.0 — Train 10

- Made packaged ContinuityBridge releases self-contained for the continuity runtime by bundling pinned `@jordanhindo/lore` 0.2.0 alongside the existing embedded Node/ContinuityBridge engine.
- Added the stable packaged `ContinuityBridgeLore` launcher so Workstation features and external MCP clients can invoke the bundled Lore CLI without a global npm install.
- Added packaged-runtime selection that prefers `ContinuityBridgeLore`, migrates the old saved default `lore`, preserves explicit custom Lore paths, and keeps PATH-based behavior for source installs.
- Added an explicit first-run **Initialize local memory** action that runs Lore setup through the selected local runtime without silently configuring AI clients.
- Replaced packaged setup guidance that previously required users to install Lore globally with npm.
- Updated the release workflow to install Lore independently on Windows, macOS, and Linux, build a PyInstaller multi-program bundle, and verify the final packaged Lore launcher before publishing archives.
- Kept the release workflow manual/tag-driven rather than adding three-platform packaging to every pull request.
- Added bundled-runtime licensing notice and preserved third-party package license files in the release runtime tree.
- Versioned the Node package, desktop package, browser capture companion, and macOS bundle at 1.0.0.
- Added focused desktop coverage for bundled Lore discovery, saved-setting migration, environment override, and explicit shell-free Lore initialization.

## 0.9.0 — Train 9

- Added the public `continuity-bridge/live-capture-v1` conversation payload contract.
- Added normalization of live captures into the same Lore source/message batch contract used by exported history.
- Added `continuity-bridge capture inspect` as a non-mutating validation path.
- Added `capture submit` and `capture serve`, both requiring explicit `--to-lore` mutation intent.
- Added an authenticated loopback-only `127.0.0.1` receiver with a per-run browser token and serialized ingestion.
- Reused the existing incremental Lore manifest so unchanged repeated captures are skipped and successful updates checkpoint only after `lore push` succeeds.
- Added source-URL credential/query/fragment removal and default credential-like message-text redaction.
- Added a unified Workstation Capture area with clear OFF/ON state, exact Lore destination, Start/Stop, token/port, project/source overrides, and manual JSON inspection/submission.
- Added a bundled Manifest V3 browser companion for explicit-click ChatGPT/Claude visible-conversation capture with no background page observer or provider API call.
- Added Workstation-owned receiver lifecycle so closing ContinuityBridge stops the local receiver process.
- Added synthetic live-capture fixtures and focused Node/Python coverage for stable IDs, redaction, incremental skipping, receiver authorization, explicit mutation flags, and desktop command construction.

## 0.8.0 — Train 8

- Added a lightweight user-owned repository continuity link store at `~/.continuity-bridge/repository-links.json` without duplicating Lore conversation content.
- Added stable credential-free repository identity across common HTTPS and Git SSH remotes, with explicit local fallback when no remote exists.
- Added explicit Recall actions to link real Lore message/session IDs to a repository plus optional issue and pull-request references.
- Added repository-filtered Recall using only linked real Lore IDs.
- Added Recall → Continue restoration of linked repository, issue, and PR context.
- Added Continue “Find related continuity” to surface exact linked message IDs, prior handoffs, issue refs, and PR refs for the selected repository.
- Added “Add related evidence” to reuse exact linked Lore anchors in new continuation packages.
- Added automatic association of successfully built handoffs back to repository continuity metadata.
- Upgraded generated handoffs to `continuity-bridge/handoff-v3` with sanitized repository issue and pull-request coordinates.
- Added repeatable `--issue` and `--pull-request` handoff CLI options and refused unresolved repository refs instead of silently dropping them.
- Added focused Node and desktop tests for repository identity, persistence, filtering coordinates, URL credential stripping, and handoff command construction.

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

- Added destination-aware local manifests.
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
- Added synthetic fixtures, unit tests, smoke test, CI, architecture, privacy documentation.
