# ContinuityBridge

> **Your AI tools should not forget each other.**

ContinuityBridge is a local-first continuity workstation for carrying user-authorized conversation evidence, code state, and explicitly selected local artifacts between AI tools.

It imports **ChatGPT** and **Claude** exports into [Lore](https://github.com/jordanhindo/lore), lets you search that evidence inside the desktop app, connects Lore to supported AI clients, refreshes existing history incrementally, and builds portable evidence-backed continuation packages.

**No model API key. No API credits. No hosted memory service. Your history and bundles stay on your machine.**

```text
ChatGPT export ─┐
                ├──▶ ContinuityBridge Workstation
Claude export ──┘     Home · History · Recall · Connections · Continue
                                  │
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
                 Lore                    portable handoff
          local evidence · MCP        repo state · attachments
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
       Codex   Claude Code  Cursor
```

## The normal user journey

ContinuityBridge 0.7 is one desktop application instead of three disconnected utilities.

1. **Launch ContinuityBridge.** Home checks whether the local continuity stack is ready.
2. **Open History.** Choose a ChatGPT or Claude export, inspect it locally, and import or refresh it into Lore.
3. **Open Recall.** Search the original evidence, see the real Lore message ID, and inspect surrounding context.
4. **Open Connections.** See which supported AI clients are installed and whether Lore MCP is already configured. Preview the exact change before applying it.
5. **Continue.** Carry a recalled message or a new Lore query into a continuation task, add repository state when relevant, optionally select local attachment artifacts, preview without copying, then build the portable package.

The Workstation stores recent source/handoff paths locally so returning to a real project does not require rediscovering everything.

## Downloadable desktop packages

Tagged releases build three self-contained Workstation packages:

- **Windows:** `ContinuityBridge-windows-x64.zip`
- **macOS:** `ContinuityBridge-macos.zip` containing `ContinuityBridge.app`
- **Linux:** `ContinuityBridge-linux-x64.tar.gz`

The packaged application contains the ContinuityBridge Node engine and its Node.js runtime. A packaged user does **not** need to clone this repository, run `npm install`, or understand the Python/Node split.

Lore remains a separate local dependency because it is the durable evidence database and MCP service shared by authorized AI clients.

### Lore setup

```bash
npm install -g @jordanhindo/lore
lore setup
```

The Workstation Home screen detects Lore and provides copyable setup help when it is missing.

Git is optional unless you want current repository coordinates in generated handoffs.

## Source installation

Developers and source users can still install the individual packages directly.

```bash
git clone https://github.com/acrinym/ContinuityBridge.git
cd ContinuityBridge
npm install
npm link
pip install ./desktop
continuity-bridge-desktop
```

`continuity-bridge-gui` is retained as a compatibility alias and now opens the same unified Workstation.

The specialist utilities remain available for compatibility and troubleshooting:

```bash
continuity-bridge-connections
continuity-bridge-handoff
```

## Workstation areas

### Home

Home checks and summarizes:

- packaged/source bridge runtime availability;
- Lore executable, local database, CLI health, and MCP startup;
- Git availability;
- Codex, Claude Code, and Cursor installation/configuration state;
- recent ChatGPT/Claude export sources;
- recent generated handoffs.

No AI client is configured automatically. Configuration remains an explicit user action.

### History

History supports:

- ChatGPT ZIP, folder, JSON, and numbered `conversations-*.json` imports;
- Claude ZIP, folder, and JSON imports;
- local analysis before mutation;
- conversation filtering and preview;
- selected or complete import into Lore;
- optional JSONL output;
- credential-like string redaction on by default;
- project override;
- one-click refresh through the existing incremental/resume engine.

Repeated Lore imports are destination-aware and skip unchanged conversations while preserving crash-resume checkpoints.

### Recall

Recall makes the durable Lore history usable without leaving ContinuityBridge.

It can:

- search Lore with relevance ranking;
- display real returned message IDs;
- show source/session metadata when Lore provides it;
- retrieve surrounding context using the exact selected message ID;
- send that evidence directly into Continue.

ContinuityBridge does not invent identifiers or ask a model to summarize the evidence before you inspect it.

### Connections

Connections can:

- detect Codex, Claude Code, and Cursor;
- show whether Lore is configured for each installed client;
- preview the exact MCP configuration and target location;
- require explicit confirmation before mutation;
- use each supported client's safe configuration strategy;
- re-check the resulting connection state.

### Continue

Continue combines the existing Handoff Builder and Safe Attachment Continuity product paths.

A continuation package can include:

- a user-written next task;
- a Lore search query and/or exact message IDs;
- bounded source context;
- Git remote, branch, HEAD, and clean/dirty coordinates;
- explicitly selected local attachment artifacts from a supported provider export;
- SHA-256 hashes and artifact provenance;
- Markdown or JSON handoff output.

**Preview is non-mutating.** Selected attachment references can appear in a preview, but local files are not copied until the user explicitly builds a bundle.

## Safe attachment continuity

Attachment handling is deliberately conservative:

- enumerate provider attachment references without downloading them;
- resolve local artifacts only inside the selected export root;
- show `available`, `missing`, or `ambiguous` state;
- require explicit attachment selection before copying;
- copy chosen files into a user-selected bundle;
- record SHA-256 hashes and verify every copy;
- preserve conversation/message/provider provenance;
- keep unavailable selected references visible in `attachments.json`;
- refuse conflicting existing files unless overwrite is explicitly enabled;
- never follow signed provider URLs or use opaque provider IDs as download credentials;
- reference copied artifacts from handoffs with relative paths.

## Command-line workflows

The CLI remains the automation surface used by the desktop application.

### Inspect before importing

```bash
continuity-bridge inspect-chatgpt ./chatgpt-export.zip --json
continuity-bridge inspect-claude ./claude-export.zip --json
```

### Import directly into Lore

```bash
continuity-bridge import-chatgpt ./chatgpt-export.zip --to-lore
continuity-bridge import-claude ./claude-export.zip --to-lore
```

### Write portable JSONL instead

```bash
continuity-bridge import-chatgpt ./export.zip --output ./chatgpt-lore.jsonl
continuity-bridge import-claude ./export.zip --output ./claude-lore.jsonl
```

### Inspect attachment references

```bash
continuity-bridge attachments chatgpt ./chatgpt-export --json
continuity-bridge attachments claude ./claude-export.zip --json
```

### Build an attachment bundle

```bash
continuity-bridge attachments chatgpt ./chatgpt-export \
  --bundle ./portable-bundle \
  --attachment-id <attachment-id>
```

Or explicitly select every reference:

```bash
continuity-bridge attachments claude ./claude-export \
  --bundle ./portable-bundle \
  --all
```

### Build an evidence-backed handoff

```bash
continuity-bridge handoff \
  --task "Continue implementation" \
  --query "the product decision we made" \
  --repo . \
  --output ./HANDOFF.md
```

With selected local artifacts:

```bash
continuity-bridge handoff \
  --task "Continue implementation" \
  --query "the product decision we made" \
  --repo . \
  --attachment-provider chatgpt \
  --attachment-export ./chatgpt-export \
  --attachment-id <attachment-id> \
  --attachment-bundle ./portable-bundle
```

## Privacy and safety model

ContinuityBridge is local-first by design:

- it does not require a hosted ContinuityBridge account;
- it does not send conversation exports to a ContinuityBridge server;
- provider-private attachment pointers are suppressed from public output;
- credential-like strings are redacted by default during provider normalization;
- MCP client mutation requires explicit confirmation in the desktop UI;
- attachment copying requires explicit selection;
- generated handoffs carry source evidence and provenance instead of an opaque model-generated interpretation.

See [`docs/PRIVACY.md`](docs/PRIVACY.md) for the detailed contract.

## Architecture

```text
Provider exports
   │
   ▼
ContinuityBridge Node core
   │ normalize / stable IDs / redaction / incremental manifests
   ├──────────────▶ JSONL
   │
   ▼
Lore
   │ durable local evidence / search / get / context / MCP
   │
   ├──────────────▶ Codex / Claude Code / Cursor
   │
   ▼
ContinuityBridge Workstation
   │ Recall / Connections / Continue
   │
   └──────────────▶ handoff + optional verified local artifact bundle
```

The desktop Workstation calls the same public Node CLI and Lore contracts used by automation. It does not maintain a second provider parser or another memory database.

## Development

```bash
npm run check
npm run smoke
npm run check:desktop
```

Desktop packaging is defined in `desktop/ContinuityBridge.spec` and `.github/workflows/desktop-release.yml`. Pull requests that touch the desktop/runtime packaging build the Linux application bundle as a real packaging check; manual runs and version tags build all supported platforms.

## Product roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md).

The next committed product direction after the Workstation is repository-aware continuity inside the cockpit—not another standalone infrastructure layer.
