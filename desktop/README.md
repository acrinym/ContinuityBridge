# ContinuityBridge Desktop

ContinuityBridge 0.9 ships one primary desktop Workstation for the complete local continuity journey: history import, explicit live capture, Recall, repository context, AI-client connections, and portable continuation packages.

## Launch

From a Python/source install:

```bash
pip install ./desktop
continuity-bridge-desktop
```

`continuity-bridge-gui` is a compatibility alias to the same guided Workstation. Focused compatibility tools remain available:

```bash
continuity-bridge-import
continuity-bridge-connections
continuity-bridge-handoff
```

## First run

The guided first-run view checks the bridge runtime, Lore, optional Git support, and supported AI clients. It can send the user directly to History, Capture, or Connections. Capture remains OFF until explicitly started.

## Workstation areas

### Home

- checks the embedded/source ContinuityBridge runtime;
- checks Lore CLI/database/MCP readiness;
- detects optional Git support;
- detects Codex, Claude Code, and Cursor and whether Lore is configured;
- shows recent provider-export and handoff paths;
- provides copyable local setup help.

### History

- opens ChatGPT/Claude ZIP, folder, and supported JSON exports;
- analyzes, filters, and previews locally;
- imports selected or complete history into Lore;
- optionally writes JSONL;
- keeps credential-like redaction enabled by default;
- refreshes through the same incremental/resume contract as the CLI.

### Recall

- searches Lore from inside ContinuityBridge;
- displays real Lore message IDs and source/session metadata;
- retrieves bounded surrounding context with the selected exact ID;
- filters by explicitly linked repository context;
- sends selected evidence directly into Continue.

### Connections

- detects supported local AI clients;
- previews exact Lore MCP configuration/target locations;
- requires confirmation before mutation;
- configures Codex, Claude Code, or Cursor through existing safe client-specific logic.

### Capture

- clearly shows OFF / STARTING / ON;
- starts an authenticated receiver bound only to `127.0.0.1`;
- shows the exact Lore destination, port, and fresh per-run token;
- supports optional Lore project/source overrides;
- bundles a Manifest V3 browser companion for explicit-click visible ChatGPT/Claude capture;
- refuses unsupported browser structures rather than scraping arbitrary text;
- supports non-mutating inspection and explicit Lore submission of `continuity-bridge/live-capture-v1` JSON files;
- reuses the shared incremental checkpoint so unchanged repeated captures are skipped;
- stops the receiver process when the Workstation closes.

There is no background browser observer, LAN listener, provider-private API client, or second live-capture database.

### Continue

- accepts a next task plus a Lore query and/or exact message IDs;
- attaches current Git repository coordinates when requested;
- restores/surfaces linked repository evidence, issue/PR coordinates, and prior handoffs;
- scans supported exports for local attachment references;
- previews without copying artifacts;
- builds Markdown/JSON continuation packages and SHA-256-verified attachment bundles.

## Local workstation state

Return-user convenience state and incremental metadata live beneath:

```text
~/.continuity-bridge/
```

That includes recent source/handoff paths, preferences, repository links, and import/live-capture resume checkpoints. It is not a second conversation database. Lore remains the durable evidence store.

The Workstation's live receiver token is generated per application run and is not persisted in desktop settings.

## Packaged application

`packaging/continuitybridge.spec` bundles:

- the Python Workstation and guided first-run experience;
- the ContinuityBridge Node `bin/` + `src/` engine;
- the platform Node.js runtime used during the build;
- the `browser-extension/` explicit capture companion;
- license/notice files.

At runtime, `continuity_bridge_desktop.runtime` detects the PyInstaller bundle root and routes desktop clients to the embedded Node engine. Capture similarly locates the bundled browser companion from the packaged root.

`.github/workflows/release-desktop.yml` is manual/tag driven rather than a per-PR multi-platform job. A workflow dispatch or `v*` tag builds Windows, macOS, and Linux packages; a version tag additionally publishes them as GitHub Release assets.

Lore remains an external local dependency because it is the durable continuity database/search/MCP service. Git remains optional unless repository coordinates are requested.

## Update and uninstall

To update a packaged release, close ContinuityBridge, download the newer platform archive, and replace the old application bundle/folder. Closing the app also stops any Capture receiver it started.

To uninstall the app, delete the extracted ContinuityBridge folder on Windows/Linux or `ContinuityBridge.app` on macOS. User-owned data remains separate:

- `~/.continuity-bridge/` — preferences, checkpoint/recent/repository-link metadata;
- `~/.lore/` or configured `LORE_DB` — durable conversation evidence;
- any portable handoff bundles.

Delete those only when you intentionally want to delete continuity data too.

## Source requirements

- Python 3.10+ with Tkinter
- Node.js 22+
- ContinuityBridge Node CLI
- Lore for durable memory/search/MCP access
- Git only for repository-aware workflows
- optional supported AI clients: Codex, Claude Code, Cursor

Packaged releases embed Node.js, the ContinuityBridge Node engine, and the browser companion.

## Validation

```bash
npm run check:desktop
```

Platform package assembly remains a manual/tag release workflow rather than an every-PR build.
