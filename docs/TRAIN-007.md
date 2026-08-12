# Train 007 — ContinuityBridge Workstation

Version: 0.7.0

## Product outcome

ContinuityBridge stops presenting its capabilities as separate developer utilities and becomes one desktop workstation a person can launch and use from beginning to end.

The workstation does not replace the working Node/Lore engines. It composes their public contracts into one user journey:

1. check local readiness;
2. import or refresh provider history;
3. recall original source evidence;
4. connect an authorized AI client to Lore;
5. carry selected evidence into a continuation task;
6. optionally add repository coordinates and explicitly selected local attachment artifacts;
7. preview without mutation;
8. build the portable continuation package.

## First run

The primary desktop entrypoint opens a guided first-run experience until the user completes or dismisses it.

It reports the state of:

- the packaged/source ContinuityBridge runtime;
- Lore CLI and MCP readiness;
- optional Git support;
- supported installed AI clients and their Lore connection state.

It explains the first continuity journey in product language and provides direct actions to choose the first export or open Connections. Missing Lore is surfaced with copyable setup instructions rather than forcing the user to understand the Python/Node split.

## Workstation areas

### Home

Home is the return-user dashboard.

It shows:

- whether the ContinuityBridge bridge runtime is available;
- whether the app is running from a bundled desktop build or a source/install environment;
- Lore CLI/database/MCP readiness;
- Git availability for repository-aware handoffs;
- detected Codex, Claude Code, and Cursor clients;
- which detected clients already have Lore configured;
- recent provider export sources;
- recent continuation handoffs.

### History

History contains the existing provider-export browser workflow inside the Workstation:

- ChatGPT and Claude ZIP/folder/JSON sources;
- local analysis before import;
- conversation filtering and preview;
- selected or complete import into Lore;
- optional JSONL output;
- credential-like redaction on by default;
- project override;
- one-click refresh through the existing incremental/resume import contract.

The Workstation stores only local recent-source metadata in `~/.continuity-bridge/workstation.json`; it does not copy provider exports into a new private archive.

### Recall

Recall is the user-facing library surface over Lore.

The user can:

- search Lore from inside ContinuityBridge;
- see the real Lore message ID associated with each result;
- inspect the matched evidence;
- retrieve surrounding context using that exact message ID;
- send selected evidence directly into Continue.

No synthetic IDs or model-generated summaries are introduced.

### Connections

Connections embeds the existing MCP configuration contract:

- inspect supported client installation/configuration state;
- preview the exact Lore MCP configuration and target location;
- require explicit confirmation before mutation;
- configure Codex, Claude Code, or Cursor using the existing safe client-specific strategies;
- re-check status after application.

### Continue

Continue unifies the Handoff Builder and Safe Attachment Continuity workflows.

The user supplies:

- the next task;
- a Lore search query and/or exact message IDs;
- optional repository path or explicit no-repository choice;
- optional ChatGPT/Claude attachment-bearing export;
- explicitly selected attachment references;
- optional portable bundle directory;
- Markdown or JSON output.

Preview deliberately omits the attachment-bundle mutation argument, so it retrieves evidence and renders the handoff without copying artifact files.

Build uses the same public handoff/attachment CLI contract as automation and copies only explicitly selected artifacts when a bundle is requested.

## Return-user state

`~/.continuity-bridge/workstation.json` stores only convenience metadata needed to return to work quickly:

- recent provider source paths;
- last import metadata;
- recent handoff paths/tasks;
- whether first-run onboarding was completed.

It is not another conversation database. Lore remains the single durable evidence/search/MCP store.

## Packaged runtime

Source installs historically required users to understand that the desktop UI was Python while provider parsing/handoff generation was Node.js.

0.7 adds packaged-runtime discovery:

- source/install mode still finds the repository or installed `continuity-bridge` CLI;
- PyInstaller builds embed the ContinuityBridge `bin/` and `src/` trees;
- the platform's Node.js 22 executable is embedded beneath the application runtime;
- desktop clients automatically use the embedded runtime when running from a packaged build.

Lore remains an external local dependency because it is the user's durable continuity database/MCP service rather than an implementation detail of the desktop executable. Git remains optional unless repository coordinates are requested.

## Distribution

`packaging/continuitybridge.spec` is the one canonical desktop release recipe.

`.github/workflows/release-desktop.yml` is deliberately manual/tag driven so ordinary product PRs do not consume three-platform packaging minutes. A workflow dispatch or a `v*` tag builds:

- `ContinuityBridge-windows-x64.zip` containing the Windows executable bundle;
- `ContinuityBridge-macos.zip` containing `ContinuityBridge.app`;
- `ContinuityBridge-linux-x64.tar.gz` containing the Linux executable bundle.

A `v*` tag additionally publishes the three archives as GitHub Release assets.

The packaged app includes the ContinuityBridge bridge engine and Node runtime. Users of a release bundle do not need to clone this repository or run `npm link` to launch the Workstation.

## Update and uninstall contract

Packaged application files and user-owned continuity data are deliberately separate.

Updating a packaged release means replacing the old app bundle/folder with the newer release after closing ContinuityBridge. Uninstalling the application means deleting that bundle/folder.

The application does not silently remove:

- `~/.continuity-bridge/` preferences/import manifests/recent metadata;
- Lore's durable database under `~/.lore/` or configured `LORE_DB`;
- portable handoff bundles created elsewhere.

Those are user-owned data and require an intentional separate deletion.

## Compatibility

`continuity-bridge-desktop` is the primary Workstation command. `continuity-bridge-gui` remains a compatibility alias to the same guided Workstation.

The original focused tools remain available as compatibility/troubleshooting entrypoints:

- `continuity-bridge-import`;
- `continuity-bridge-connections`;
- `continuity-bridge-handoff`.

They are no longer the required journey for a normal user.

## Acceptance journey

A release candidate is accepted when a user can perform this journey without opening another ContinuityBridge program:

1. launch the Workstation;
2. complete/dismiss guided first-run readiness;
3. open a ChatGPT or Claude export;
4. analyze and import/refresh it into Lore;
5. switch to Recall and find source evidence;
6. inspect the exact message ID and surrounding context;
7. send that evidence into Continue;
8. check/configure an installed AI client from Connections if needed;
9. add a current repository if relevant;
10. scan an attachment-bearing export and select only desired local artifacts if relevant;
11. preview the continuation package without copying files;
12. build the handoff/bundle;
13. move the bundle to another location and use the relative artifact paths and hashes produced by the existing 0.6 contract.

For packaged releases, the same journey must launch without a repository checkout or a separately installed ContinuityBridge Node CLI.

## Deliberate non-goals

Train 007 does not add:

- another database beside Lore;
- a hosted account/sync service;
- hidden browser scraping;
- automatic provider-private attachment downloading;
- automatic client configuration without confirmation;
- model-generated handoff interpretation;
- repository relationship graphs (the next repository-aware train owns that);
- recursive QA/audit machinery unrelated to the user journey.
