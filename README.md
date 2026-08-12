# ContinuityBridge

> **Your AI tools should not forget each other.**

ContinuityBridge is a local-first desktop and command-line bridge that carries user-authorized conversation evidence and explicitly selected local artifacts between AI tools.

It imports **ChatGPT** and **Claude** exports into [Lore](https://github.com/jordanhindo/lore), helps configure Lore MCP clients, resumes refreshed imports efficiently, builds evidence-backed handoffs, and can package local attachment artifacts into portable verified bundles.

**No model API key. No API credits. No hosted memory service. Your history and bundles stay on your machine.**

```text
ChatGPT export ─┐
                ├──▶ ContinuityBridge Desktop / CLI
Claude export ──┘     browse · search · preview · select
                       normalize · preserve · redact
                       inspect · bundle · handoff
                                  │
                         ┌────────┴────────┐
                         ▼                 ▼
                       Lore         portable bundle
                  local DB · MCP    handoff · hashes
                         │           attachments
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Codex     Claude Code    Cursor
             └──── other Lore clients ────┘
```

## Why this exists

AI products usually remember only what happened inside their own application. A product discussion in ChatGPT may be invisible to the coding agent in an IDE. A debugging breakthrough in Claude may be invisible when the next task opens in Codex. Context gets copied by hand, flattened into summaries, or lost after compaction.

ContinuityBridge treats that history as **user-owned continuity**:

1. Discuss a product, feature, or code problem in one AI tool.
2. Export that history through the provider's normal data-export path.
3. Browse and select conversations locally.
4. Import them into Lore.
5. Retrieve the original evidence from another authorized AI client later.
6. When a referenced local artifact matters, explicitly carry it in a verified handoff bundle.

The agents do not become the same assistant. They gain access to the same user-authorized evidence.

## What ships today

### Conversation import and inspection

- ChatGPT ZIP, extracted-folder, JSON, and numbered `conversations-*.json` import.
- Claude ZIP, extracted-folder, and JSON import.
- Full ChatGPT conversation-tree preservation, including alternate responses.
- Claude message ordering and explicit parent-link preservation.
- Lore-compatible stable message IDs for idempotent re-import.
- Code, structured text, model names, timestamps, and safe attachment descriptions.
- Signed URL, opaque asset-pointer, and provider file-ID suppression.
- Default credential redaction.
- Portable JSONL output and direct `lore push` delivery.

### Incremental imports

- Destination-aware local manifests.
- Automatic skipping of unchanged conversations.
- Per-conversation checkpoints only after confirmed Lore push success.
- Crash resume without checkpointing failed conversations.
- `--manifest`, `--no-manifest`, and `--reimport` controls.
- Complete JSONL snapshots even when Lore delivery is incremental.

### MCP Control Center

The desktop Control Center can:

- detect and validate Lore;
- verify `lore serve` startup;
- configure supported Codex, Claude Code, and Cursor MCP connections;
- preview configuration changes before mutation;
- preserve unrelated Cursor JSON settings with backups;
- prove continuity using Lore search → exact message ID → bounded context.

### Evidence-backed Handoff Builder

`continuity-bridge handoff` creates a bounded continuation package from real Lore evidence plus current Git repository coordinates.

It supports:

- Lore search-driven anchors or explicit message IDs;
- real `lore get` and `lore context` retrieval;
- repository remote, branch, HEAD, and clean/dirty state;
- Markdown and JSON formats;
- source/session/message provenance;
- optional absolute local path only when explicitly requested;
- no model call and no generated interpretation layer.

The installable `continuity-bridge-handoff` Tkinter application exposes the same core behavior with preview/save controls.

### Safe Attachment Continuity — 0.6

ContinuityBridge can inspect attachment references inside supported exports and deliberately carry matching **local export artifacts** alongside a handoff.

The attachment lane is designed around explicit user choice:

- enumerate attachment references without copying anything;
- resolve local artifacts only inside the selected export root;
- show `available`, `missing`, or `ambiguous` state;
- select exact attachment IDs or explicitly select all;
- copy chosen local files into a user-selected bundle;
- record SHA-256 hashes and verify each copy;
- preserve conversation/message/provider provenance;
- keep unavailable selected references visible in `attachments.json`;
- refuse conflicting existing files unless overwrite is explicitly enabled;
- never follow signed provider URLs or use provider-private file IDs to download content;
- reference copied artifacts from handoffs using relative paths.

The desktop Handoff Builder adds provider/export selection, attachment scanning, multi-select, non-mutating preview, and portable bundle creation over the same CLI contract.

## Quick start

### 1. Install Lore

```bash
npm install -g @jordanhindo/lore
lore setup
```

### 2. Install ContinuityBridge

```bash
git clone https://github.com/acrinym/ContinuityBridge.git
cd ContinuityBridge
npm install
npm link
```

### 3A. Launch desktop tools

Python 3.10+ with Tkinter is required.

```bash
pip install ./desktop
continuity-bridge-gui
continuity-bridge-connections
continuity-bridge-handoff
```

From a source checkout, the standard import desktop app also runs with:

```bash
python desktop/continuity_bridge_gui.py
```

### 3B. Import from the CLI

```bash
continuity-bridge import-chatgpt ~/Downloads/chatgpt-export.zip --to-lore
continuity-bridge import-claude ~/Downloads/claude-export.zip --to-lore
```

### 4. Search from any Lore-connected client

```bash
lore search "a phrase from an old conversation" --relevant
```

Use returned message/session IDs to retrieve only the surrounding source evidence needed for the current task.

## Inspect before importing

```bash
continuity-bridge inspect-chatgpt ./chatgpt-export.zip --json
continuity-bridge inspect-claude ./claude-export.zip --json
```

Validate without writing:

```bash
continuity-bridge import-chatgpt ./export.zip --dry-run
continuity-bridge import-claude ./export.zip --dry-run
```

Write normalized Lore batches without changing Lore:

```bash
continuity-bridge import-chatgpt ./export.zip --output ./chatgpt-lore.jsonl
continuity-bridge import-claude ./export.zip --output ./claude-lore.jsonl
```

## Safe attachment workflow

### Inspect references

```bash
continuity-bridge attachments chatgpt ./chatgpt-export --json
continuity-bridge attachments claude ./claude-export.zip
```

Inspection does not copy files. It reports stable attachment IDs, safe metadata, local availability, and source provenance.

### Create an artifact bundle

Using explicit IDs:

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

A bundle contains `attachments.json` plus copied files beneath `attachments/`. Each copied artifact has a recorded SHA-256 and byte size. Missing/ambiguous selections remain in the manifest.

### Carry attachments in a handoff

```bash
continuity-bridge handoff \
  --task "Continue implementation" \
  --message-id <lore-message-id> \
  --repo . \
  --attachment-provider chatgpt \
  --attachment-export ./chatgpt-export \
  --attachment-id <attachment-id> \
  --attachment-bundle ./portable-handoff
```

With an attachment bundle, the handoff is written inside the bundle as `HANDOFF.md` or `HANDOFF.json` unless an in-bundle output path is supplied. Artifact and manifest paths in the handoff are relative, so the whole directory can be moved together.

See [`docs/TRAIN-006.md`](docs/TRAIN-006.md) for the complete product contract.

## Main CLI surfaces

```text
continuity-bridge import-chatgpt <path> [options]
continuity-bridge import-claude <path> [options]
continuity-bridge inspect-chatgpt <path> [options]
continuity-bridge inspect-claude <path> [options]
continuity-bridge attachments <chatgpt|claude> <path> [options]
continuity-bridge handoff --task <text> [--query <text> | --message-id <id>] [options]
```

Run any specialized surface with `--help` for its exact controls.

## Privacy and ownership

ContinuityBridge performs local file processing and launches local child processes. It does not call OpenAI, Anthropic, or another model/provider service while importing, inspecting attachments, bundling artifacts, or generating handoffs.

Credential-like strings are scrubbed from normalized conversation text by default. Use `--no-redact` only when verbatim retention is deliberate.

Safe Attachment Continuity does **not** download provider assets. It never emits raw signed URLs, provider file IDs, or asset pointers into inspection results, manifests, or handoffs. Local artifact discovery stays inside the selected export root, and copying requires explicit selection.

The repository contains synthetic fixtures only. Real exports, copied user artifacts, local settings, Lore databases, generated JSONL, bundles, caches, and credentials must remain outside Git.

See [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Conversation fidelity

ChatGPT exports represent conversations as trees rather than simple transcripts. ContinuityBridge walks every reachable branch deterministically and stores original parent-message relationships instead of silently discarding regenerated responses.

Claude exports are normalized from their ordered message collections. Explicit parent IDs are retained when present; otherwise exported message order forms the conversation chain.

For both providers:

- stable source/session IDs enable safe re-import;
- model and timestamp metadata are preserved when available;
- unknown structured content remains readable without exposing raw signed pointers;
- oversized messages are bounded and marked as truncated;
- provider-specific filesystem paths are replaced with non-sensitive source URIs.

## Architecture

ContinuityBridge deliberately does **not** create another memory database.

- **Provider adapters** understand source-specific exports.
- **Normalized import core** produces Lore-compatible records and inspection summaries.
- **Attachment portability core** resolves only local export artifacts and builds explicit verified bundles.
- **Desktop apps** operate over the same public CLI contracts instead of implementing parallel parsers.
- **Lore** owns durable conversation storage, search, retrieval, exclusions, CLI, and MCP access.
- **AI clients remain replaceable.** Any authorized Lore client can retrieve the same indexed history.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DESKTOP.md`](docs/DESKTOP.md), and [`docs/ROADMAP.md`](docs/ROADMAP.md).

## What this is not

ContinuityBridge does not:

- bypass provider account security;
- scrape another person's conversations;
- expose a hidden API to ordinary ChatGPT or Claude account history;
- download attachments from signed/private provider URLs;
- crawl arbitrary filesystem locations looking for possible matches;
- make different models share an identity or private internal state;
- upload an entire archive into every prompt;
- require a model to summarize or rewrite source history;
- build recursive audit/review machinery as a product.

It gives user-authorized tools a bounded, searchable, portable route to the user's own evidence.

## Development

Requires Node.js 22+. Desktop work additionally requires Python 3.10+.

```bash
npm install
npm run check
npm run smoke
npm run check:desktop
```

The synthetic test suite covers provider parsing, ZIP/folder/JSON resolution, split-export reconciliation, branch preservation, secret redaction, attachment-pointer suppression, stable identifiers, incremental imports, Lore handoffs, attachment discovery, missing-artifact preservation, SHA-256 verified copying, bundle-relative handoff paths, and desktop command construction.

## Roadmap

0.6 Safe Attachment Continuity is the active product train. Next is **0.7 Repository-aware continuity links**, followed by explicit live capture, additional provider/import families, and the 1.0 finished public continuity workstation.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the canonical sequence.

The direction remains simple: make continuity easier to **import, find, connect, carry, and continue**.

## Relationship to Lore

ContinuityBridge uses Lore's public `push` contract and compatible stable message-ID algorithm. Lore is an independent MIT-licensed project by Jordan Hindo. See [`NOTICE`](NOTICE).

## License

MIT. See [`LICENSE`](LICENSE).
