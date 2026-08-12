# ContinuityBridge Desktop

ContinuityBridge 1.0 ships one primary desktop Workstation for the complete local continuity journey: history import, explicit live capture, Recall, repository context, AI-client connections, and portable continuation packages.

## Packaged launch

Download the platform release, extract it, and launch **ContinuityBridge**. Packaged 1.0 releases include the ContinuityBridge Node engine, platform Node runtime, pinned Lore runtime, and browser capture companion.

A packaged user does not need to install Node.js or Lore globally.

## First run

The guided first-run view checks the packaged continuity runtime, optional Git support, and supported AI clients. The selected Lore command automatically points at the sibling `ContinuityBridgeLore` executable when it is present.

Choose **Initialize local memory** to explicitly run Lore setup through that packaged runtime. This can detect/index supported existing local transcripts and verify search. It does not silently configure AI clients.

You can skip initialization and instead bring evidence in through History or Capture.

## Workstation areas

### Home

- checks embedded ContinuityBridge/Node/Lore runtime readiness;
- checks the user-owned Lore database and MCP startup;
- detects optional Git support;
- detects Codex, Claude Code, and Cursor and whether Lore is configured;
- shows recent provider-export and handoff paths;
- provides packaged/source-appropriate setup help.

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
- configures Codex, Claude Code, or Cursor through existing safe client-specific logic;
- packaged builds configure the stable absolute `ContinuityBridgeLore` command with `serve` rather than relying on global PATH.

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

### Continue

- accepts a next task plus a Lore query and/or exact message IDs;
- attaches current Git repository coordinates when requested;
- restores/surfaces linked repository evidence, issue/PR coordinates, and prior handoffs;
- scans supported exports for local attachment references;
- previews without copying artifacts;
- builds Markdown/JSON continuation packages and SHA-256-verified attachment bundles.

## Packaged runtime layout

PyInstaller produces one application folder containing two executable boundaries:

```text
ContinuityBridge
ContinuityBridgeLore
```

On Windows they have `.exe` suffixes. On macOS both executables live inside the application bundle's `Contents/MacOS` area.

`ContinuityBridge` owns the GUI. `ContinuityBridgeLore` locates the bundled Node executable and bundled Lore JavaScript entrypoint, then replaces itself with that process. This lets both the Workstation and external MCP clients use ordinary Lore CLI/stdio behavior.

Bundle data includes:

- `bridge/` — ContinuityBridge Node engine;
- `runtime/` — platform Node executable;
- `lore-runtime/` — pinned `@jordanhindo/lore` 0.2.0 plus production dependencies;
- `browser-extension/` — explicit capture companion;
- license/notice files.

## Local user data

Return-user convenience/checkpoint metadata lives beneath:

```text
~/.continuity-bridge/
```

Durable Lore evidence remains outside the application package beneath:

```text
~/.lore/
```

or the configured `LORE_DB` path.

Replacing or uninstalling the package therefore does not silently replace/delete user evidence.

## Release build

`.github/workflows/release-desktop.yml` is manual/tag-driven. On each Windows/macOS/Linux runner it:

1. installs pinned `@jordanhindo/lore@0.2.0` into generated `packaging/lore-runtime/`;
2. verifies the Lore CLI entrypoint;
3. builds the two-executable PyInstaller application bundle;
4. verifies `ContinuityBridgeLore help` from the final package;
5. archives the package;
6. publishes `v*` tag builds as GitHub Release assets.

This platform packaging is deliberately not an every-PR matrix.

## Update and uninstall

Close ContinuityBridge, replace the old application bundle/folder with the newer release, then launch again. Closing also stops any Capture receiver owned by the Workstation.

To uninstall the app, delete the extracted ContinuityBridge folder on Windows/Linux or `ContinuityBridge.app` on macOS. User-owned data remains separate unless you intentionally remove `~/.continuity-bridge/`, `~/.lore/`/`LORE_DB`, or handoff bundles yourself.

## Source/developer launch

Source installs still use developer-managed runtimes:

```bash
npm install -g @jordanhindo/lore@0.2.0
pip install ./desktop
continuity-bridge-desktop
```

`CONTINUITYBRIDGE_LORE` can explicitly override Lore runtime selection. A custom saved Lore command is preserved; only the old generic packaged default `lore` migrates to `ContinuityBridgeLore`.

Compatibility entrypoints remain:

```bash
continuity-bridge-gui
continuity-bridge-import
continuity-bridge-connections
continuity-bridge-handoff
```

## Validation

```bash
npm run check:desktop
```

See `docs/TRAIN-010.md` for the 1.0 release contract.
