# ContinuityBridge

> **Your AI tools should not forget each other.**

ContinuityBridge 1.0 is a local-first continuity workstation for carrying user-authorized conversation evidence, repository/code context, and explicitly selected local artifacts between AI tools.

It imports **ChatGPT** and **Claude** exports, can explicitly capture supported active browser conversations, recalls exact source evidence through Lore, links evidence to repository context, connects supported AI clients through MCP, and builds portable evidence-backed continuation packages.

**Packaged 1.0 releases include the ContinuityBridge engine, Node.js runtime, pinned Lore runtime, and browser capture companion. No model API key, API credits, source checkout, global Node install, or global Lore npm install is required for the packaged journey.**

```text
ChatGPT / Claude exports ─┐
                         ├──▶ ContinuityBridge Workstation
explicit browser capture ┘     Home · History · Recall · Connections · Capture · Continue
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                  bundled/local Lore              portable handoff
              local evidence · search · MCP   repo state · refs · attachments
                         │
                 ┌───────┼────────┐
                 ▼       ▼        ▼
              Codex  Claude Code  Cursor
```

## Download and use

Tagged releases build:

- **Windows:** `ContinuityBridge-windows-x64.zip`
- **macOS:** `ContinuityBridge-macos.zip` containing `ContinuityBridge.app`
- **Linux:** `ContinuityBridge-linux-x64.tar.gz`
- **Integrity:** `SHA256SUMS.txt` with SHA-256 digests for every platform archive.

Extract the package and launch **ContinuityBridge**.

The current 1.0 packages are not code-signed/notarized. Windows SmartScreen or macOS Gatekeeper may therefore show the operating system's normal warning for an unsigned internet-downloaded application. Download only from this repository's GitHub Release, verify the archive against `SHA256SUMS.txt` when integrity matters, and use your operating system's normal review/allow flow rather than disabling platform security globally.

On first run, the packaged application detects its bundled continuity runtime and offers **Initialize local memory**. That action is optional and explicit: it asks bundled Lore to detect/index supported local transcript sources and verify retrieval. It does not silently configure Codex, Claude Code, or Cursor.

You can skip initialization and instead bring evidence in deliberately through **History** or **Capture**.

## The normal user journey

1. **Launch ContinuityBridge.** Packaged runtime readiness is checked without requiring a terminal.
2. **Bring in evidence.** Initialize supported existing local transcript sources, import a ChatGPT/Claude export, or explicitly capture a supported active browser conversation.
3. **Recall the source.** Search Lore, see real message IDs, and inspect bounded surrounding context.
4. **Add code context when relevant.** Link exact evidence to a Git repository plus optional issue/PR coordinates, then narrow later Recall by that repository.
5. **Connect clients.** Preview the exact Lore MCP configuration and explicitly apply it to supported installed clients. Packaged builds point clients at the stable bundled `ContinuityBridgeLore` command.
6. **Continue.** Carry exact evidence into a task, add current repository state and optional verified local artifacts, preview without copying, then build the portable continuation package.

## What is inside a packaged 1.0 release

- the ContinuityBridge Python Workstation;
- the ContinuityBridge Node engine;
- a platform Node.js runtime;
- pinned `@jordanhindo/lore` 0.2.0 plus its production runtime dependencies;
- `ContinuityBridgeLore`, the stable packaged Lore launcher used by the Workstation and MCP clients;
- the Manifest V3 explicit browser capture companion;
- project and third-party notices.

`ContinuityBridgeLore` is a launcher, not another memory implementation. It forwards Lore commands to the bundled Node/Lore runtime while preserving normal CLI/stdin/stdout behavior.

User evidence is **not** stored inside the application package. Lore's database remains under `~/.lore/` by default (or configured `LORE_DB`), and ContinuityBridge state remains under `~/.continuity-bridge/`.

## Workstation areas

### Home

Checks the packaged/source runtime, Lore, Git, and supported AI-client connection state. Recent export/handoff paths are convenience metadata, not another conversation database.

### History

Opens supported ChatGPT/Claude ZIP, folder, and JSON exports; analyzes before mutation; imports selected or complete history; and refreshes repeated imports through destination-aware incremental/resume checkpoints.

### Recall

Searches Lore, displays exact returned IDs and source/session metadata, retrieves surrounding source context with those IDs, and sends selected evidence to Continue.

Repository-aware Recall explicitly links evidence to a Git repository plus optional issue/PR references and can narrow later results by that repository. Lore remains the sole conversation-content store.

### Connections

Detects Codex, Claude Code, and Cursor, previews the exact Lore MCP change, requires confirmation, and applies the supported client-specific configuration path.

In packaged 1.0 builds, the command is the stable packaged `ContinuityBridgeLore` executable with `serve` as the MCP argument. An explicit custom Lore command can still be used.

### Capture

Capture is explicit and local:

- receiver is **OFF by default**;
- Start binds an authenticated HTTP receiver only to `127.0.0.1`;
- the Workstation shows the exact port, destination, and fresh per-run token;
- the bundled Manifest V3 companion reads recognized visible ChatGPT/Claude message containers only after **Capture current conversation** is clicked;
- unsupported page structures are refused rather than guessed;
- unchanged repeated captures are skipped through the same incremental checkpoint machinery used for history refresh;
- closing the Workstation stops the receiver it started;
- local/desktop tools can emit the public `continuity-bridge/live-capture-v1` JSON contract when no stable native transcript surface exists.

There is no background page observer, LAN listener, or provider-private API client.

### Continue

Builds Markdown/JSON continuation packages from a task plus exact Lore evidence. Packages can include current Git remote/branch/HEAD/dirty state, optional issue/PR coordinates, and explicitly selected local artifacts copied into a SHA-256-verified portable bundle.

**Preview is non-mutating.** Artifact files are copied only during explicit Build.

## CLI workflows

Source/automation users retain the public CLI.

History:

```bash
continuity-bridge inspect-chatgpt ./chatgpt-export.zip --json
continuity-bridge inspect-claude ./claude-export.zip --json
continuity-bridge import-chatgpt ./chatgpt-export.zip --to-lore
continuity-bridge import-claude ./claude-export.zip --to-lore
```

Live capture:

```bash
continuity-bridge capture inspect ./capture.json --json
continuity-bridge capture submit ./capture.json --to-lore
continuity-bridge capture serve --to-lore --port 43119
```

Safe attachments:

```bash
continuity-bridge attachments chatgpt ./chatgpt-export --json
continuity-bridge attachments claude ./claude-export.zip --json
```

Evidence-backed handoff:

```bash
continuity-bridge handoff \
  --task "Continue implementation" \
  --query "the product decision we made" \
  --repo . \
  --issue '#42' \
  --pull-request '#88' \
  --output ./HANDOFF.md
```

## Source installation

Packaged releases do not need this section. For development/source use:

```bash
git clone https://github.com/acrinym/ContinuityBridge.git
cd ContinuityBridge
npm install
npm link
pip install ./desktop
npm install -g @jordanhindo/lore@0.2.0
continuity-bridge-desktop
```

Source builds resolve `lore` from PATH unless `CONTINUITYBRIDGE_LORE` or an explicit saved Lore path is supplied.

Focused compatibility entrypoints remain:

```bash
continuity-bridge-import
continuity-bridge-connections
continuity-bridge-handoff
```

## Privacy and safety model

ContinuityBridge is local-first by design:

- no hosted ContinuityBridge account is required;
- exports are not uploaded to a ContinuityBridge server;
- the packaged Lore database remains user-owned and outside the application bundle;
- local-memory initialization is explicit;
- AI-client configuration mutation requires explicit confirmation;
- live receiver is loopback-only and bearer-authenticated;
- browser capture happens only after an explicit click;
- captured source URLs lose credentials, query strings, and fragments;
- credential-like message text is redacted by default;
- provider-private attachment pointers are suppressed;
- attachment copying requires explicit selection;
- ContinuityBridge uses Lore's public CLI/push/MCP contracts rather than direct SQLite coupling.

See [`docs/PRIVACY.md`](docs/PRIVACY.md), [`docs/WORKSTATION.md`](docs/WORKSTATION.md), and [`docs/TRAIN-010.md`](docs/TRAIN-010.md).

## Update and uninstall

Close ContinuityBridge, replace the old application package with the newer release, and launch again. The packaged runtime can change without replacing user evidence because the database/state directories are outside the application bundle.

To uninstall the application, delete its extracted folder or `.app` bundle. That does not silently delete:

- `~/.lore/` or configured `LORE_DB`;
- `~/.continuity-bridge/`;
- portable handoff bundles.

Delete those separately only when you intentionally want to remove the associated data.

## Development

```bash
npm run check
npm run smoke
npm run check:desktop
```

Desktop packaging is defined by `packaging/continuitybridge.spec` and `.github/workflows/release-desktop.yml`. Normal product PRs use the lightweight CI suite; release-critical packaging/runtime changes additionally exercise Windows, macOS, and Linux package assembly before merge, and tags publish the same verified platform bundles.

## Product roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md).
