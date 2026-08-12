# ContinuityBridge Desktop

ContinuityBridge 0.7 ships one primary desktop workstation for the full local continuity journey.

## Launch

From a Python/source install:

```bash
pip install ./desktop
continuity-bridge-desktop
```

`continuity-bridge-gui` is a compatibility alias to the same guided Workstation. The original focused importer remains available as `continuity-bridge-import`, and the older specialist commands remain available when a focused utility is useful:

```bash
continuity-bridge-import
continuity-bridge-connections
continuity-bridge-handoff
```

## First run

The primary Workstation entrypoint opens a guided first-run view until the user completes or dismisses it. It checks the bridge runtime, Lore, optional Git support, and supported AI clients, then offers a direct path to choose the first ChatGPT or Claude export.

Missing components are reported as local readiness problems rather than Python/Node implementation details. The setup view can copy the required Lore setup commands and can take the user directly to Connections or History.

## Workstation

The Workstation has five user-facing areas.

### Home

- checks the embedded/source ContinuityBridge runtime;
- checks Lore CLI/database/MCP readiness;
- detects Git;
- detects Codex, Claude Code, and Cursor and whether Lore is configured;
- shows recent provider export sources;
- shows recent generated handoffs;
- provides copyable setup help when the local continuity stack is incomplete.

### History

- opens ChatGPT or Claude ZIP/folder/JSON exports;
- analyzes, filters, and previews conversations locally;
- imports selected or complete history into Lore;
- optionally writes JSONL;
- keeps credential-like redaction enabled by default;
- refreshes an existing source through the same incremental/resume contract used by the CLI.

### Recall

- searches Lore from inside ContinuityBridge;
- displays real Lore message IDs and available source metadata;
- retrieves surrounding context using the selected exact message ID;
- sends selected evidence directly into Continue.

### Connections

- shows supported client installation/configuration state;
- previews the exact Lore MCP configuration and target path;
- requires confirmation before mutation;
- configures Codex, Claude Code, or Cursor through the existing safe client-specific logic.

### Continue

- accepts a next task plus Lore search query and/or exact message IDs;
- attaches current Git repository coordinates when requested;
- scans supported provider exports for local attachment references;
- lets the user explicitly select attachment artifacts;
- previews handoffs without copying files;
- builds Markdown/JSON continuation packages and verified attachment bundles.

## Local workstation state

Return-user convenience state is stored in:

```text
~/.continuity-bridge/workstation.json
```

It contains recent local source/handoff paths and last-import metadata. It is not a second conversation database and does not copy provider history. Lore remains the durable evidence store.

Existing desktop preferences continue to use:

```text
~/.continuity-bridge/desktop.json
```

## Packaged application

`packaging/continuitybridge.spec` builds the desktop application with:

- the Python Workstation and first-run experience;
- the ContinuityBridge Node `bin/` + `src/` engine;
- the platform Node.js 22 runtime used during the build;
- license/notice files.

At runtime, `continuity_bridge_desktop.runtime` detects PyInstaller's bundle root and directs `BridgeClient` and `HandoffClient` to the embedded Node engine automatically.

`.github/workflows/release-desktop.yml` is deliberately manual/tag driven rather than a per-PR multi-platform job. A workflow dispatch or a `v*` tag builds:

- Windows portable executable bundle ZIP;
- macOS `.app` ZIP;
- Linux portable executable bundle tarball.

A version tag additionally publishes the three archives as GitHub Release assets. Lore remains an external local dependency because it is the durable continuity database/MCP service shared with authorized AI clients. Git remains optional unless repository coordinates are requested.

## Update and uninstall

### Packaged releases

To update, download the newer platform archive, close ContinuityBridge, and replace the old application bundle/folder. User continuity data is not stored inside the application bundle, so replacing the app does not remove Lore or workstation preferences.

To uninstall the application itself, delete the extracted `ContinuityBridge` folder on Windows/Linux or `ContinuityBridge.app` on macOS.

Optional user-owned local data remains separate:

- `~/.continuity-bridge/` — ContinuityBridge preferences, recent-source metadata, and import manifests;
- `~/.lore/` (or the configured `LORE_DB`) — Lore's durable evidence database;
- any portable handoff bundles the user created.

Delete those only when the user intentionally wants to remove that data as well. ContinuityBridge does not silently delete Lore history during application uninstall.

### Source installs

Re-run `pip install ./desktop` after updating the checkout. Remove the Python desktop package with:

```bash
pip uninstall continuity-bridge-desktop
```

The Node CLI can be unlinked/removed separately if it was installed from source.

## Runtime requirements for source installs

- Python 3.10+ with Tkinter
- Node.js 22+
- ContinuityBridge Node CLI
- Lore for durable memory/search/MCP access
- Git only for repository-aware handoffs
- one or more optional supported AI clients: Codex, Claude Code, Cursor

Packaged desktop releases embed Node.js and the ContinuityBridge Node CLI, removing those two source-install requirements for normal end users.

## Validation

```bash
npm run check:desktop
```

Platform packaging is exercised when the manual/tag release workflow is run. The normal product PR CI remains focused on the Node and desktop behavior rather than building three OS release bundles for every change.
