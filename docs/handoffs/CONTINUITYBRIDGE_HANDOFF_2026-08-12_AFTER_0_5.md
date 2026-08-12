# ContinuityBridge Product Development Handoff — After 0.5 Handoff Builder / Reviewed Merge Train

Date: 2026-08-12
Repository: `acrinym/ContinuityBridge`
Default branch: `main`
Visibility: public
Package: `@acrinym/continuity-bridge`
Current shipped product version: `0.5.0`

This handoff captures the complete product and repository state immediately after the reviewed 0.5 train was merged. The product head immediately before this documentation-only handoff commit was:

`14cad888489f38746a4be7c19a7597ee29a75ec0`

That commit is the normal merge commit for PR #6, `Build evidence-backed Handoff Builder and product roadmap`.

The live `main` head after this handoff is committed will naturally be newer than the product head above. Always query the repository before making new changes.

---

## 1. Mission

ContinuityBridge exists to make user-owned AI conversation history portable and useful across tools.

The core problem is simple: a user may develop an idea, troubleshoot a system, make architectural decisions, or work through a coding problem in one AI conversation, then move into another AI environment and lose that context. ContinuityBridge makes that history available as evidence instead of forcing the user to paste giant transcripts or repeatedly reconstruct earlier decisions.

The public product promise is:

- local-first continuity;
- user-owned conversation history;
- no hosted memory service required;
- no model API credits required for the core import/search/handoff path;
- evidence and provenance before opaque generated summaries;
- interoperability through Lore and MCP rather than a new proprietary memory silo.

The first production path was ChatGPT export → normalized records → Lore. The product has since grown into a small continuity workstation with desktop import, Claude support, MCP client setup and verification, resumable incremental imports, and evidence-backed handoff generation.

The long-term goal is not merely “import transcripts.” The goal is to let a user move between AI tools while carrying the relevant original evidence, source identifiers, repository coordinates, and eventually safe local attachments needed to continue real work.

---

## 2. Public/private boundary — non-negotiable

This is a public repository. Keep it generic and clean.

Public ContinuityBridge must contain **zero private personal conversation history, private-repository archaeology, private assistant identity/personality material, private continuity-system internals, or recognizable derivatives of private project data**.

Public examples and fixtures must remain synthetic.

Do not publish:

- real user conversations;
- real private attachments;
- real secrets, tokens, signed URLs, or provider-private pointers;
- private project names or private repository details as fixtures/examples;
- private assistant identity/history/personality material;
- private continuity architecture copied from unrelated private systems;
- anonymized examples that are still recognizably derived from private records.

Public ContinuityBridge may contain generic capabilities such as:

- ChatGPT/Claude/general conversation import;
- local searchable continuity;
- generic project/repository association;
- generic evidence-backed handoffs;
- MCP client setup and verification;
- deletion/redaction/exclusion controls;
- safe attachment continuity;
- explicit user-controlled live capture when technically available.

The public positioning is **user-owned AI continuity**, not identity preservation.

---

## 3. Architectural authority

### Lore is the durable continuity backend

ContinuityBridge deliberately does **not** reimplement Lore.

Lore remains the shared local store/search/MCP layer. ContinuityBridge sits beside it as an ingestion, setup, verification, continuation, and portability product.

The architectural rule is:

> Use Lore’s public contracts. Do not build another memory database, search engine, or competing MCP server unless Lore’s public contract is proven insufficient for a required user-facing capability.

Lore provides the durable normalized history and retrieval surface. ContinuityBridge owns product-specific workflows around that store.

### Normalized ingestion contract

The original ChatGPT train was built against Lore’s public normalized record/push boundary rather than directly writing Lore’s SQLite database.

Relevant generic contract characteristics recovered during development:

- push batches contain a source-file record, messages, and optional tool calls;
- Lore performs validated transactional upserts;
- messages have stable IDs, session IDs, role, sequence, timestamps, source/project/model metadata, and text;
- ContinuityBridge uses a Lore-compatible deterministic message-ID algorithm for imported provider records;
- the small compatibility algorithm is attributed under Lore’s MIT license in `NOTICE`.

Do not couple new product work directly to Lore’s internal SQLite schema merely for convenience.

### Runtime split

The repository currently has two intentional runtime surfaces:

1. **Node.js core/CLI**
   - provider importers;
   - normalized record generation;
   - Lore delivery;
   - incremental manifests;
   - Handoff Builder core;
   - repository coordinate capture.

2. **Python/Tkinter desktop applications**
   - export browse/search/selection/import;
   - MCP Control Center;
   - Handoff Builder desktop workflow.

The desktop applications call the same public CLI/core behaviors rather than maintaining a second incompatible parser or memory implementation.

---

## 4. Product trains shipped so far

### 0.1 — ChatGPT → Lore continuity

Merged PR: #1 — `Build ChatGPT-to-Lore continuity bridge`
Merge commit: `dc132b3dcc89b968c7a4abe64cac9a071f067a32`

Train 001 turned a blank public repository into a real working product lane.

It shipped:

- ChatGPT data-export ZIP support;
- extracted export-directory support;
- direct `conversations.json` support;
- numbered `conversations-*.json` support for large exports;
- natural ordering and merge of numbered files;
- duplicate conversation reconciliation, keeping the newest duplicate;
- deterministic traversal of the full ChatGPT conversation tree;
- preservation of regenerated/alternate branches rather than flattening to one path;
- parent-message reconstruction through non-message mapping nodes;
- structured content and code preservation;
- model/timestamp/session metadata preservation;
- safe attachment descriptions without copying signed provider URLs or raw asset pointers;
- normalized Lore-compatible records;
- deterministic Lore-compatible stable message IDs;
- direct `lore push` delivery over stdin;
- portable JSONL output;
- credential redaction by default;
- large-message truncation protection;
- synthetic fixtures only;
- CI, unit tests, smoke tests, architecture docs, and privacy docs.

Initial CLI shape included:

`continuity-bridge import-chatgpt <export.zip|directory|conversations.json> [options]`

Important options included Lore delivery, JSONL output, dry-run, redaction control, source/project overrides, Lore command override, and import limiting.

The foundational product promise established here remains unchanged: history stays local and can become searchable from authorized Lore/MCP clients without requiring OpenAI API usage.

### 0.2 — Desktop + Claude continuity

Merged PR: #2 — `Add desktop and Claude continuity`
Merge commit: `7e23905ca869bcf826e3b6586888a323cf9c1dbf`

Train 002 made the product useful to people who do not want to drive everything from a terminal and established the provider-neutral direction.

It shipped:

- installable Tkinter desktop application;
- open/browse/search/preview/select/import workflow;
- Claude ZIP import;
- Claude extracted-folder import;
- Claude JSON import;
- provider-neutral inspect commands;
- repeatable conversation selection for bounded imports;
- safe Claude content and attachment normalization;
- persisted local desktop settings;
- shared CLI contract between desktop and automation;
- dual Node/Python CI.

The important architectural choice was to reuse the public Node import contract from the desktop app rather than fork parsing behavior into Python.

### 0.3 — MCP Control Center

Merged PR: #4 — `Build Lore MCP Control Center`
Final merge commit: `165b042ef2cded19e9c2ad02084a05ef65c6b3a3`

Train 003 added a human-facing setup and verification surface around Lore MCP access.

It shipped:

- Lore executable detection;
- Lore database visibility;
- Lore CLI health checks;
- `lore serve` startup verification;
- Codex detection/configuration support;
- Claude Code detection/configuration support;
- Cursor detection/configuration support;
- exact configuration preview before mutation;
- explicit user confirmation before configuration changes;
- supported Codex/Claude MCP CLI application paths;
- safe Cursor JSON merging;
- timestamped Cursor backups;
- malformed Cursor configuration refusal;
- continuity proof flow: search Lore → spend the exact returned message ID → retrieve surrounding context;
- installable `continuity-bridge-connections` desktop command.

#### Review fixes made before merge

Two substantive review findings were fixed on PR #4:

1. **Tkinter thread safety**
   - worker threads previously reached into Tk-backed variables;
   - the Lore command is now captured on the main thread;
   - workers receive a plain string and create their client from that value.

2. **Event-loop resilience**
   - the event poller could stop permanently if a render/messagebox handler raised;
   - unexpected handler errors are now caught;
   - busy state is restored;
   - the next poll is always scheduled from `finally`.

The review-fix commit on the PR branch was:

`cb30cff749d00693c508e0bdcea46113f761431e`

Because the maintenance train had landed first and both trains touched release metadata, current `main` was merged into the Train 003 branch with a genuine two-parent merge commit:

`a3f56ae6d56fa5109f9c0a053cb6b6c407e06ff3`

That branch was fully qualified before the normal PR merge.

### Maintenance train — guarded Dependabot updates

Merged PR: #3 — `Automate safe Dependabot updates`
Merge commit: `4c2b5f2d80c24a55c04c62d6187173c53c6bf5b5`

This was product maintenance infrastructure, not a recursive audit project.

It shipped:

- weekly Dependabot lanes for root npm, desktop Python, and GitHub Actions;
- grouped patch/minor updates;
- majors explicitly left for manual review;
- privileged `pull_request_target` policy that never checks out or executes PR code;
- changed-file boundary enforcement;
- tight workflow-diff validation allowing action-reference changes only;
- exact-head CI gating;
- stale-head protection;
- guarded automated merge using a **normal merge commit**, not squash.

A review finding discovered that the changed-file guard only read the first 100 changed files. That was fixed before merge:

- `gh api --paginate` now retrieves every changed-file page;
- pages are combined before validation;
- regression assertions cover pagination.

The corrected PR head was:

`29421c2c867bce6d3829435b1b02f5f50c766d16`

### 0.4 — Incremental Lore imports and crash resume

Merged PR: #5 — `Add resumable incremental Lore imports`
Final merge commit: `2ada59d96df25b367a27a187f4781dac522cb4a0`

Train 004 addressed the obvious large-history problem: repeatedly importing a refreshed provider export should not push thousands of unchanged conversations again.

It shipped:

- versioned local import manifest;
- destination-aware manifest identity;
- unchanged-conversation skipping using provider resume tokens/hashes;
- `--manifest`;
- `--no-manifest`;
- `--reimport`;
- dry-run import planning without checkpoint writes;
- per-conversation atomic checkpointing only after confirmed `lore push` success;
- crash-resume behavior where completed conversations remain checkpointed and the failed conversation remains pending;
- JSONL output remains a complete portable snapshot even when Lore delivery is incremental;
- malformed/unsupported manifest refusal;
- owner-restricted manifest mode where supported;
- temporary-write replacement behavior.

The manifest intentionally stores no conversation text.

After PR #4 merged, `main` was merged into Train 004 with a genuine two-parent commit so the branch physically contained all reviewed predecessor changes:

`8df4581c7412766c193cedab81900ff941669d79`

That exact merged-base head passed full CI before PR #5 was merged with a normal merge commit.

### 0.5 — Evidence-backed Handoff Builder + roadmap

Merged PR: #6 — `Build evidence-backed Handoff Builder and product roadmap`
Final merge commit / product head before this handoff commit:

`14cad888489f38746a4be7c19a7597ee29a75ec0`

Train 005 made ContinuityBridge useful at the moment the user switches AI tools.

It shipped:

- `continuity-bridge handoff`;
- Lore search-driven evidence selection;
- repeatable explicit Lore message IDs;
- real `lore get` retrieval;
- real `lore context` retrieval;
- bounded context around anchors;
- repository name;
- sanitized Git origin remote;
- branch;
- current HEAD commit;
- dirty/clean working-tree state;
- Markdown handoff format;
- JSON handoff format;
- source/session/message provenance;
- optional absolute local-path disclosure only when explicitly requested;
- no model call to create the handoff;
- no generated interpretation layer replacing source evidence;
- receiving-client rule to verify live repository state before modifying code;
- installable `continuity-bridge-handoff` Tkinter desktop builder;
- public product roadmap through 1.0.

The Handoff Builder is intentionally an **evidence package**, not an AI-generated summary service.

#### OpenHands review

Before merge, `@openhands` was explicitly requested to review PR #6 for substantive correctness, security, and regression issues.

OpenHands reported the implementation solid overall and verified the full Node and desktop test surfaces. It identified one concrete correctness/documentation inconsistency:

- `md` was accepted as a `--format` alias, but the CLI help/error text said only `markdown` or `json`.

That was fixed and regression-tested. The final pre-sync Handoff Builder head was:

`6650a518959e3374637482040d3a8b4a1f60a26c`

OpenHands also raised a broad suggestion to validate `--lore-command` and `--repo` strings. The implementation was inspected before acting:

- `--lore-command` is deliberately allowed to be an executable path or PATH-resolved command/wrapper and is passed to `spawn` with `shell: false`;
- `--repo` is resolved as a filesystem path and Git itself validates that it is a usable repository before coordinates are consumed.

Arbitrary extra validation would have rejected legitimate user inputs without improving shell safety, so that suggestion was documented but not implemented.

After Train 004 merged, current `main` was merged into the Handoff Builder branch with a genuine two-parent commit:

`2c8a6b34b30ad65ce9af58857223a4a5a74ccb9c`

The exact synced tree passed full CI and was then merged normally as PR #6.

---

## 5. Review and merge workflow established in this thread

Treat this as the standing PR-completion workflow for ContinuityBridge unless explicitly overridden.

### Review sequence

Before merging a substantive product PR:

1. inspect all existing review threads;
2. request `@openhands` review when the product train is ready for substantive review;
3. wait for the review response within the active work session;
4. verify every finding against current code;
5. fix every actionable code issue;
6. reply directly on the relevant inline review thread explaining the fix;
7. resolve the thread through GitHub GraphQL/thread resolution;
8. re-check that no unresolved actionable review threads remain;
9. qualify the exact final PR head with CI;
10. merge only when explicitly authorized.

Do not create review-of-review machinery. The purpose of review is to fix product defects, not build a meta-product around reviewing.

### Merge method

**Do not squash.**

Normal merge commits are the preferred merge method for this repository/workflow.

When stacked branches need current `main`, preserve history with a real two-parent merge-from-main commit. Do not silently flatten reviewed ancestry through squash or rebase merely to make the graph prettier.

The 0.3–0.5 stack was deliberately landed this way.

### Merge receipts from the completed reviewed stack

- PR #3 → `4c2b5f2d80c24a55c04c62d6187173c53c6bf5b5`
- PR #4 → `165b042ef2cded19e9c2ad02084a05ef65c6b3a3`
- PR #5 → `2ada59d96df25b367a27a187f4781dac522cb4a0`
- PR #6 → `14cad888489f38746a4be7c19a7597ee29a75ec0`

---

## 6. Current user-facing product surface at 0.5

At this handoff, ContinuityBridge can do all of the following:

### Import and inspect

- import ChatGPT exports;
- import Claude exports;
- handle ZIP, extracted-folder, and supported JSON forms;
- preserve alternate conversation branches;
- inspect provider exports without committing them to Lore;
- browse/search/select conversations in the desktop importer;
- redact common credentials by default.

### Deliver and resume

- push normalized records to Lore;
- write portable JSONL snapshots;
- skip unchanged conversations during repeat Lore imports;
- checkpoint successful pushes;
- resume after partial failure;
- force reimport when explicitly requested.

### Connect AI clients

- verify Lore installation/CLI/database/MCP startup;
- detect and configure Codex;
- detect and configure Claude Code;
- detect and configure Cursor;
- preview configuration before mutation;
- require explicit confirmation;
- prove continuity by searching Lore and retrieving context using a real returned message ID.

### Build handoffs

- select evidence by Lore query;
- select exact evidence by message ID;
- retrieve bounded original context;
- capture Git coordinates;
- scrub credentials from HTTP(S) remotes;
- omit absolute local path unless explicitly requested;
- produce Markdown or JSON;
- build/save the same concept through the desktop Handoff Builder.

---

## 7. Important implementation behavior

### ChatGPT import fidelity

The ChatGPT importer walks the actual conversation tree rather than trusting a single “current” branch. Regenerated answers and alternate paths are preserved deterministically.

Roles supported directly by Lore remain user/assistant/system. Provider roles outside that set are not silently discarded; they are preserved through a system-compatible representation.

Attachment metadata is currently preserved conservatively: useful descriptive information such as filename/media type may remain, but opaque asset pointers and signed provider URLs are not copied into normalized records.

This conservative behavior is exactly why safe attachment continuity is the logical next train.

### Redaction

Default credential redaction covers common secret shapes such as:

- private key blocks;
- OpenAI-style secret keys;
- GitHub tokens;
- AWS access-key patterns;
- bearer tokens;
- common API/access/auth/client-secret/password assignment forms.

Redaction is default-on. Explicit opt-out exists where the user genuinely needs raw local content.

### Incremental manifests

Incremental state is delivery state, not a replacement archive.

Key rules:

- no conversation text in the manifest;
- destination identity matters;
- only confirmed successful Lore pushes produce checkpoints;
- dry-run does not mutate checkpoint state;
- portable JSONL remains complete rather than becoming a confusing delta file.

### Handoff evidence

The Handoff Builder does not fabricate source identifiers.

Search-derived IDs must be the IDs actually returned by Lore, and those exact IDs are then spent through `get`/`context`.

The receiving AI is expected to treat repository coordinates as point-in-time evidence and re-query live repository state before making changes.

---

## 8. Current repository documentation

Key docs on `main` include:

- `README.md`
- `CHANGELOG.md`
- `docs/ARCHITECTURE.md`
- `docs/PRIVACY.md`
- `docs/DESKTOP.md`
- `docs/DEPENDABOT.md`
- `docs/ROADMAP.md`
- `docs/TRAIN-001.md`
- `docs/TRAIN-002.md`
- `docs/TRAIN-003.md`
- `docs/TRAIN-004.md`
- `docs/TRAIN-005.md`

`docs/ROADMAP.md` currently still labels 0.5 as the “Active train,” even though 0.5 has now shipped and merged. Treat that as a small documentation state correction to make when the next product train begins; it is not evidence that 0.5 remains unmerged.

Current package metadata on `main` is version `0.5.0` and describes the product as a local-first AI continuity bridge for importing chat history, connecting Lore MCP clients, resuming changed imports, and building evidence-backed AI handoffs.

---

## 9. Validation state

The final reviewed/synced PR #6 head passed the repository’s full CI before merge.

The CI path exercises:

- Node install with scripts disabled;
- `npm run check`;
- provider smoke imports;
- desktop compilation/tests;
- Python desktop package installation.

Focused coverage now includes the actual product risks discovered in review, including:

- full changed-file pagination for privileged dependency automation;
- main-thread Tk variable access;
- resilient Tk event polling;
- exact Lore message-ID spending;
- malformed config refusal;
- repository credential scrubbing;
- incremental resume/checkpoint semantics;
- Handoff Builder format aliases;
- desktop command construction without shell interpolation.

Do not turn this into recursive test/audit infrastructure. Add tests when they protect shipped user-facing behavior.

---

## 10. Open PRs created automatically after the maintenance train

Immediately after Dependabot configuration landed, Dependabot opened four new **major-version** GitHub Actions updates:

- PR #7 — `actions/checkout` 4 → 7
- PR #8 — `dependabot/fetch-metadata` 2.3.0 → 3.1.0
- PR #9 — `actions/setup-python` 5 → 7
- PR #10 — `actions/setup-node` 4 → 7

These are expected.

They were **not** part of the reviewed 0.3–0.5 product stack and were deliberately not swallowed into that merge train.

The safe Dependabot workflow intentionally auto-merges only eligible patch/minor updates. Major updates require manual review.

Before doing anything with #7–#10 in a future chat:

1. re-query them live;
2. inspect their exact workflow diffs and current compatibility/runtime requirements;
3. keep them separate from unrelated product work unless there is a real reason to combine them;
4. do not assume “Dependabot opened it” means it is safe to merge;
5. use a normal merge commit if/when explicitly approved.

---

## 11. Next substantial product train — 0.6 Safe Attachment Continuity

This is the next roadmap train after the now-completed 0.5 Handoff Builder.

### Product outcome

A user should be able to create a portable continuity/handoff bundle that includes explicitly selected local attachment artifacts referenced by imported conversations, with integrity/provenance metadata, without leaking provider-private URLs or blindly scraping the filesystem.

### Roadmap commitments already established

0.6 should deliver:

- enumeration of attachments referenced by supported exports;
- explicit copy/export into a user-selected local bundle;
- content hashes;
- provenance links;
- no signed provider URLs or opaque remote tokens in output;
- Handoff Builder support for relative references to copied artifacts.

### Product behavior to preserve

The train should remain explicit and user-controlled.

Do not:

- crawl arbitrary user directories looking for “related” files;
- automatically upload artifacts anywhere;
- include provider signed URLs as a portability mechanism;
- treat missing export assets as if they were successfully captured;
- silently copy every attachment in an entire archive when the user selected only a bounded conversation/handoff;
- invent a second attachment database.

### Strong implementation direction

Start by inspecting the current ChatGPT and Claude attachment-normalization paths and the exact export structures already supported.

Build one coherent end-to-end product path rather than a stub:

1. identify attachment references attached to selected/imported evidence;
2. distinguish metadata-only references from locally resolvable exported files;
3. expose an explicit destination/bundle operation;
4. copy only authorized/local-resolvable artifacts;
5. compute a content hash for each copied artifact;
6. emit relative bundle paths and provenance metadata;
7. make missing/unavailable artifacts explicit rather than silently dropping them;
8. let Handoff Builder reference the bundled artifacts;
9. expose the same workflow through the desktop surface where practical;
10. use synthetic attachment fixtures only.

A good 0.6 acceptance journey is:

> Open/import a supported export containing synthetic attachments, choose evidence for a handoff, explicitly create a local bundle, receive copied artifacts with hashes and provenance, open the generated handoff on another machine/path, and resolve the artifacts through relative paths without provider credentials or signed URLs.

Do not reduce 0.6 to a schema-only or TODO-only slice.

---

## 12. Roadmap after 0.6

### 0.7 — Repository-aware continuity links

Associate conversations and handoffs with repository remotes, branches, commits, issues, and pull requests using lightweight metadata rather than a new graph database.

Search should eventually be able to narrow continuity evidence by project/repository context.

### 0.8 — Explicit live capture

Add user-controlled live capture from technically supported local/browser/desktop surfaces.

Requirements:

- explicit on/off state;
- clear destination;
- incremental writes through the normalized contract;
- no hidden scraping;
- no assumption that provider-private APIs exist.

### 0.9 — Additional providers/import families

Prioritize sources that have stable user exports or local transcript stores.

Candidate future adapters include Gemini exports and additional coding-agent/session formats not already handled directly by Lore.

Every provider must meet the same fidelity/privacy/stable-ID/synthetic-fixture bar.

### 1.0 — Finished public continuity workstation

Release criteria already established:

- import/browse supported chat exports;
- incrementally refresh history;
- configure and prove MCP access;
- build evidence-backed handoffs tied to code state;
- carry safe local attachments when explicitly requested;
- clear install/update/uninstall paths on Windows, macOS, and Linux;
- documentation that takes a new user from install to proven cross-AI recall without requiring them to understand the architecture.

Later opportunities include IDE-native Handoff Builder panels, portable encrypted bundles, user-selected multi-machine storage sync, richer conversation/code relationship views, and provider plugins behind a stable adapter contract.

---

## 13. Explicit non-goals

ContinuityBridge should not become:

- another general-purpose memory database beside Lore;
- a hosted private-conversation archive by default;
- an autonomous client-configuration mutator;
- an assistant identity/personality preservation product;
- a recursive audit/review/test governance machine;
- a generic graph database merely because repository links exist;
- an excuse to copy private implementation details from unrelated systems into the public repo.

The product direction remains:

> make continuity easier to **import, find, connect, carry, and continue**.

---

## 14. Repository hygiene and engineering style

When continuing development:

- build substantial human-facing product trains;
- no placeholder behavior;
- no TODO-only slices;
- no no-op scaffolding;
- no “test the test harness that audits the audit” machinery;
- use existing authorities rather than parallel replacements;
- keep public fixtures synthetic;
- keep secrets/export archives/local databases/caches/local settings out of Git;
- redact logs where user data could leak;
- preserve one shared behavior contract between CLI and desktop rather than duplicating parsers;
- keep Lore as the memory/search/MCP authority;
- preserve API-free/local-first core behavior.

If a feature needs optional hosted AI later, it must remain optional rather than becoming a hidden requirement for basic continuity.

---

## 15. GitHub/About metadata note

Earlier in development, repository files and package metadata were updated to the intended public positioning. The connected GitHub tooling available at the time did not expose repository About/description editing.

The intended concise GitHub About description was:

`Local-first bridge that makes ChatGPT conversations searchable by Codex, Claude Code, Cursor, and any Lore/MCP client—without API credits.`

Do not assume the repository About field was changed unless live GitHub metadata confirms it.

The package description on current `main` is newer/broader and reflects the 0.5 product surface.

---

## 16. Start-of-next-chat procedure

Do not ask for a giant pasted history. Use this handoff plus live repository state.

At the beginning of the next ContinuityBridge development chat:

1. query `acrinym/ContinuityBridge` live;
2. confirm current `main` head;
3. read this handoff;
4. read `docs/ROADMAP.md` and `docs/TRAIN-005.md` as needed;
5. query all open PRs, especially Dependabot #7–#10, because their status may have changed;
6. distinguish maintenance PRs from the next product train;
7. correct the roadmap’s stale “0.5 active” label when beginning 0.6;
8. continue 0.6 Safe Attachment Continuity as a substantial end-to-end product train;
9. do not merge future product work without explicit merge authorization;
10. when a PR reaches merge stage, follow the review-thread → fix → reply → GraphQL resolve → OpenHands review → final exact-head CI → normal merge-commit workflow.

### Canonical product coordinates at handoff creation

- Repository: `acrinym/ContinuityBridge`
- Default branch: `main`
- Public: yes
- Shipped package version: `0.5.0`
- Product head immediately before this handoff commit: `14cad888489f38746a4be7c19a7597ee29a75ec0`
- Product PRs #1–#6: merged
- New maintenance PRs #7–#10: open major-version Dependabot updates at the time this handoff was written
- Next product train: **0.6 Safe Attachment Continuity**

The next AI should recover detail from the live repository and this handoff rather than treating this file as a substitute for current GitHub state.
