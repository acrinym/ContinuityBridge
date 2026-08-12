# ContinuityBridge Desktop

ContinuityBridge 0.7 ships one primary desktop workstation for the full local continuity journey.

## Launch

From a Python/source install:

```bash
pip install ./desktop
continuity-bridge-desktop
```

`continuity-bridge-gui` is a compatibility alias to the same unified Workstation.

The older specialist commands remain available when a focused utility is useful:

```bash
continuity-bridge-connections
continuity-bridge-handoff
```

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
- sends the selected evidence directly into Continue.

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

`desktop/ContinuityBridge.spec` builds the desktop application with:

- the Python Workstation;
- the ContinuityBridge Node `bin/` + `src/` engine;
- a platform Node.js runtime;
- license/notice files.

At runtime, `continuity_bridge_desktop.runtime` detects PyInstaller's bundle root and directs `BridgeClient`/`HandoffClient` to the embedded Node engine automatically.

The release workflow produces:

- Windows portable executable bundle ZIP;
- macOS `.app` ZIP;
- Linux portable executable bundle tarball.

Lore remains an external local dependency because it is the durable continuity database/MCP service shared with authorized AI clients. Git remains optional unless repository coordinates are requested.

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

The desktop release workflow additionally performs a real Linux PyInstaller bundle build on packaging-related pull requests and builds all three platform packages for manual runs/tags.
