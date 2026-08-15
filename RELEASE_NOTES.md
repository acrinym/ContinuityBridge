# ContinuityBridge 1.0.0

**Your AI tools should not forget each other.**

ContinuityBridge 1.0.0 is the first finished public workstation release: a local-first application for bringing user-authorized conversation evidence into one searchable continuity layer, linking that evidence to repository context, and carrying bounded evidence-backed handoffs into the next AI session.

![ContinuityBridge 1.0.0](https://raw.githubusercontent.com/acrinym/ContinuityBridge/v1.0.0/assets/brand/release-v1.0.0.svg)

## Download

The tagged release publishes these portable bundles:

- **Windows x64:** `ContinuityBridge-windows-x64.zip`
- **macOS:** `ContinuityBridge-macos.zip` containing `ContinuityBridge.app`
- **Linux x64:** `ContinuityBridge-linux-x64.tar.gz`
- **Checksums:** `SHA256SUMS.txt`

The 1.0 packages are currently **unsigned / not notarized**. Windows SmartScreen and macOS Gatekeeper may therefore show the operating system's normal warning for an internet-downloaded unsigned application. Use the platform's normal review/allow flow; do not disable system security globally.

## What 1.0 does

### Bring in evidence

- import ChatGPT exports;
- import Claude exports;
- initialize supported existing local transcript sources through bundled Lore;
- explicitly capture recognized visible ChatGPT or Claude browser conversations through the bundled Manifest V3 companion;
- skip unchanged repeated imports/captures through destination-aware incremental checkpoints.

### Recall with provenance

- search the local Lore evidence store;
- work with real source/session/message identifiers;
- inspect bounded source context;
- attach exact evidence to a Git repository;
- preserve optional issue and pull-request coordinates;
- narrow later Recall by repository context.

### Connect AI clients

ContinuityBridge can preview and explicitly apply Lore MCP configuration for supported installed clients:

- OpenAI Codex;
- Claude Code;
- Cursor.

The packaged application exposes a stable `ContinuityBridgeLore` launcher so those clients do not need a global Lore or Node installation.

### Continue with a bounded handoff

Build Markdown or JSON continuation packages containing:

- the next task;
- exact Lore evidence anchors;
- bounded source context;
- Git remote / branch / HEAD / dirty state when requested;
- optional issue / pull-request coordinates;
- explicitly selected local artifacts copied into a SHA-256-verified portable bundle.

Preview remains non-mutating. Artifact copies happen only on explicit Build.

## Local-first boundaries

ContinuityBridge does not require a hosted ContinuityBridge account or model API key for the packaged journey.

- Lore data stays under `~/.lore/` by default, or the configured `LORE_DB`.
- ContinuityBridge state stays under `~/.continuity-bridge/`.
- Live capture is **OFF by default**.
- The capture receiver binds to `127.0.0.1` and requires a fresh per-run bearer token.
- The browser companion extracts only after **Capture current conversation** is clicked.
- Unsupported page structures are refused rather than guessed.
- AI-client configuration changes require explicit confirmation.
- Selected attachment copying is explicit.
- Captured source URLs have credentials, query strings, and fragments removed.

See [`docs/PRIVACY.md`](docs/PRIVACY.md) and [`SECURITY.md`](SECURITY.md).

## Runtime included in the package

Each platform bundle contains:

- the ContinuityBridge Workstation;
- the ContinuityBridge Node engine;
- a platform Node.js runtime;
- Lore 0.2.0 built from immutable source commit `7d10369ef265fb73e539223235979ef2f367bdb8`;
- `ContinuityBridgeLore`, the stable packaged Lore launcher;
- the explicit browser capture companion;
- license and third-party notices.

Lore is built from its committed lockfile on each target OS so native runtime dependencies are produced for that platform.

## Release verification

Before the 1.0 tag is published, the release workflow must pass on Windows, macOS, and Linux. Each platform build:

1. builds the pinned Lore runtime;
2. freezes ContinuityBridge and `ContinuityBridgeLore`;
3. runs packaged Lore against an isolated temporary SQLite store;
4. executes `setup` and `status`;
5. verifies the SQLite database was created;
6. creates the platform archive;
7. verifies both ContinuityBridge entrypoints exist inside that archive.

The publish job then generates `SHA256SUMS.txt` and attaches it alongside all three archives.

## Start here

- [Getting started](docs/GETTING-STARTED.md)
- [User guide](docs/USER-GUIDE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Privacy model](docs/PRIVACY.md)
- [Security policy](SECURITY.md)
- [Developer / contributor guide](CONTRIBUTING.md)
- [Maintainer release procedure](docs/RELEASING.md)
