# ContinuityBridge

> **Your AI tools should not forget each other.**

ContinuityBridge is a local-first continuity workstation for carrying user-authorized conversation evidence, repository/code context, and explicitly selected local artifacts between AI tools.

It imports **ChatGPT** and **Claude** exports into [Lore](https://github.com/jordanhindo/lore), can explicitly capture supported active browser conversations into the same local evidence store, lets you recall exact source evidence by repository context, connects Lore to supported AI clients, and builds portable evidence-backed continuation packages.

**No model API key. No API credits. No hosted ContinuityBridge memory service. Capture is OFF until you turn it on.**

```text
ChatGPT / Claude exports ─┐
                         ├──▶ ContinuityBridge Workstation
explicit browser capture ┘     Home · History · Recall · Connections · Capture · Continue
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                       Lore                      portable handoff
              local evidence · search · MCP   repo state · refs · attachments
                         │
                 ┌───────┼────────┐
                 ▼       ▼        ▼
              Codex  Claude Code  Cursor
```

## The normal user journey

1. **Launch ContinuityBridge.** First run checks the local continuity stack and explains what is missing.
2. **Bring in evidence.** Open **History** for a ChatGPT/Claude export, or open **Capture** and deliberately start the local receiver for an active supported browser conversation.
3. **Recall the source.** Search Lore, see real message IDs, and inspect bounded surrounding context.
4. **Add code context when relevant.** Link exact evidence to a Git repository plus optional issue/PR coordinates, then filter Recall by that repository later.
5. **Connect clients.** Preview and explicitly configure Lore MCP for supported local AI clients.
6. **Continue.** Carry exact evidence into a task, add current repository state and optional verified local artifacts, preview without copying, then build the portable continuation package.

## Downloadable desktop packages

Tagged releases build:

- **Windows:** `ContinuityBridge-windows-x64.zip`
- **macOS:** `ContinuityBridge-macos.zip` containing `ContinuityBridge.app`
- **Linux:** `ContinuityBridge-linux-x64.tar.gz`

The packaged application contains the Workstation, ContinuityBridge Node engine, Node.js runtime, and browser capture companion. Lore remains a separate local dependency because it is the durable evidence/search/MCP layer shared with authorized AI clients.

### Lore setup

```bash
npm install -g @jordanhindo/lore
lore setup
```

## Workstation areas

### Home

Checks the packaged/source runtime, Lore, Git, and supported AI-client connection state. It also keeps recent export/handoff paths for convenient return without creating another conversation database.

### History

Opens supported ChatGPT/Claude ZIP, folder, and JSON exports; analyzes before mutation; imports selected or complete history; and refreshes repeated imports through the destination-aware incremental/resume contract.

### Recall

Searches Lore, displays exact returned IDs and source/session metadata, retrieves surrounding source context with those IDs, and sends selected evidence to Continue.

Repository-aware Recall can explicitly link evidence to a Git repository plus optional issue/PR references, narrow future searches by that repository, and restore unambiguous repository context in Continue. Lore remains the sole conversation-content store.

### Connections

Detects Codex, Claude Code, and Cursor, previews the exact Lore MCP change, requires confirmation, and applies the supported client-specific configuration path.

### Capture

Capture is explicit and local:

- receiver is **OFF by default**;
- Start binds an authenticated HTTP receiver only to `127.0.0.1`;
- the Workstation shows the exact port, destination, and fresh per-run token;
- the bundled Manifest V3 browser companion reads recognized visible ChatGPT/Claude message containers only after the user presses **Capture current conversation**;
- unsupported page structures are refused rather than guessed;
- repeated unchanged captures are skipped by the same incremental checkpoint machinery used for history refresh;
- closing the Workstation stops the receiver it started;
- local/desktop tools can use the public `continuity-bridge/live-capture-v1` JSON contract when no stable native transcript surface exists.

There is no background page observer and no provider-private API client.

### Continue

Builds Markdown/JSON continuation packages from a task plus exact Lore evidence. Packages can include current Git remote/branch/HEAD/dirty state, optional issue/PR coordinates, and explicitly selected local artifacts copied into a SHA-256-verified portable bundle.

**Preview is non-mutating.** Artifact files are copied only during explicit Build.

## Explicit live-capture CLI

Read-only validation:

```bash
continuity-bridge capture inspect ./capture.json --json
```

Explicit one-shot ingestion:

```bash
continuity-bridge capture submit ./capture.json --to-lore
```

Explicit loopback receiver:

```bash
continuity-bridge capture serve --to-lore --port 43119
```

`submit` and `serve` refuse to run without `--to-lore`. The receiver has no LAN bind option.

## History import CLI

```bash
continuity-bridge inspect-chatgpt ./chatgpt-export.zip --json
continuity-bridge inspect-claude ./claude-export.zip --json

continuity-bridge import-chatgpt ./chatgpt-export.zip --to-lore
continuity-bridge import-claude ./claude-export.zip --to-lore
```

Portable JSONL remains available with `--output <file>`.

## Safe attachment continuity

```bash
continuity-bridge attachments chatgpt ./chatgpt-export --json
continuity-bridge attachments claude ./claude-export.zip --json
```

Copying requires explicit attachment IDs or `--all`. ContinuityBridge stays inside the selected export root, never follows provider-private signed URLs, records provenance, and verifies copied artifacts with SHA-256.

## Evidence-backed handoff CLI

```bash
continuity-bridge handoff \
  --task "Continue implementation" \
  --query "the product decision we made" \
  --repo . \
  --issue '#42' \
  --pull-request '#88' \
  --output ./HANDOFF.md
```

A resolvable repository is required when issue/PR references are supplied. Consumers are instructed to verify their live state before acting.

## Privacy and safety model

ContinuityBridge is local-first by design:

- no hosted ContinuityBridge account is required;
- exports are not uploaded to a ContinuityBridge server;
- live receiver is loopback-only and bearer-authenticated;
- browser capture happens only on an explicit click;
- captured source URLs lose credentials, query strings, and fragments;
- credential-like message text is redacted by default;
- provider-private attachment pointers are suppressed;
- AI-client mutation requires explicit confirmation;
- attachment copying requires explicit selection;
- Lore is accessed through its public CLI contracts rather than direct SQLite coupling.

See [`docs/PRIVACY.md`](docs/PRIVACY.md) for the detailed contract and [`docs/WORKSTATION.md`](docs/WORKSTATION.md) for the desktop user journey.

## Source installation

```bash
git clone https://github.com/acrinym/ContinuityBridge.git
cd ContinuityBridge
npm install
npm link
pip install ./desktop
continuity-bridge-desktop
```

Focused compatibility entrypoints remain available:

```bash
continuity-bridge-import
continuity-bridge-connections
continuity-bridge-handoff
```

## Architecture

```text
provider exports ──▶ provider adapters ─┐
                                        ├─▶ normalized Lore batch ─▶ shared incremental checkpoint ─▶ lore push
explicit live JSON/browser click ──────▶ live-capture normalizer ─┘
                                                                              │
                                                                              ▼
                                                                             Lore
                                                                              │
                                  ┌───────────────────────────────────────────┼──────────────┐
                                  ▼                                           ▼              ▼
                               Recall                                      MCP clients    Continue/handoff
```

ContinuityBridge does not maintain another conversation database, search engine, or hidden capture archive beside Lore.

## Development

```bash
npm run check
npm run smoke
npm run check:desktop
```

Desktop packaging is defined by `packaging/continuitybridge.spec` and `.github/workflows/release-desktop.yml`. Multi-platform packaging remains manual/tag-driven rather than consuming release-build resources on every product PR.

## Product roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md).

After 0.9 Explicit Live Capture, the next committed train is **1.0 — Finished public continuity workstation**: release finishing, onboarding, packaging, and user-proof—not another infrastructure subsystem.
