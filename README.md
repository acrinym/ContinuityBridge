# ContinuityBridge

> **Your AI tools should not forget each other.**

ContinuityBridge is a local-first bridge that carries conversation history from chat products into the shared memory used by your coding agents.

The first production lane imports your **ChatGPT data export** into [Lore](https://github.com/jordanhindo/lore). After that, Codex, Claude Code, Cursor, OpenClaw, Hermes, and any compatible MCP client can search the same conversations from the tools where you actually work.

**No OpenAI API key. No API credits. No hosted memory service. Your history stays on your machine.**

```text
ChatGPT conversations
        │
        ▼
ContinuityBridge
parse · normalize · preserve branches · redact secrets
        │
        ▼
      Lore
local SQLite history · search · CLI · MCP
        │
        ├── Codex
        ├── Claude Code
        ├── Cursor
        ├── OpenClaw
        ├── Hermes
        └── any compatible AI client
```

## Why this exists

AI products usually remember only what happened inside their own application. A product discussion in ChatGPT is invisible to the coding agent in your IDE. A debugging breakthrough in Codex may be invisible to the next agent you open. Context gets copied by hand, flattened into summaries, or lost after compaction.

ContinuityBridge treats conversation history as **user-owned continuity**:

- Discuss an application in ChatGPT.
- Export and import that history locally.
- Ask Codex to find the original product intent while working in the repository.
- Let another Lore-connected agent retrieve the same source conversation later.

The agents do not need to become the same assistant. They gain access to the same authorized evidence.

## What ships today

Train 001 provides a complete ChatGPT-export-to-Lore path:

- Reads the original ChatGPT export ZIP, an extracted export directory, `conversations.json`, or numbered `conversations-*.json` files.
- Reconciles duplicate conversations across large split exports.
- Preserves full conversation trees, including regenerated answers and alternate branches.
- Converts messages to Lore's public normalized-record contract.
- Uses Lore-compatible stable message IDs so repeated imports are idempotent.
- Preserves code, structured content, model names, timestamps, parent links, and human-readable attachment descriptions.
- Redacts common API keys, access tokens, passwords, bearer tokens, and private-key blocks by default.
- Pushes directly through `lore push` or writes portable JSONL for inspection and later ingestion.
- Requires no model call, embedding service, hosted database, or OpenAI API billing.

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

### 3. Import a ChatGPT export

```bash
continuity-bridge import-chatgpt ~/Downloads/chatgpt-export.zip --to-lore
```

### 4. Search it from any Lore-connected agent

From the shell:

```bash
lore search "a phrase from an old ChatGPT conversation" \
  --source chatgpt \
  --relevant
```

From Codex, Claude Code, Cursor, or another MCP client, use Lore's search and retrieval tools to locate the message, inspect its surrounding context, and continue the work with provenance intact.

## Inspect before importing

Count conversations and messages without writing anything:

```bash
continuity-bridge import-chatgpt ./export.zip --dry-run
```

Write normalized Lore batches to JSONL without changing the Lore store:

```bash
continuity-bridge import-chatgpt ./export.zip \
  --output ./chatgpt-lore.jsonl
```

Write JSONL and ingest it during the same run:

```bash
continuity-bridge import-chatgpt ./export.zip \
  --output ./chatgpt-lore.jsonl \
  --to-lore
```

## CLI

```text
continuity-bridge import-chatgpt <path> [options]
```

| Option | Effect |
|---|---|
| `--to-lore` | Push each conversation through Lore's validated write path. |
| `--output <file>` | Write one normalized JSON batch per line. |
| `--dry-run` | Parse and count without writing. |
| `--no-redact` | Disable credential redaction. |
| `--project <name>` | Assign one Lore project value to all imported messages. |
| `--source <name>` | Override the source namespace; defaults to `chatgpt`. |
| `--lore-command <path>` | Use a non-default Lore executable. |
| `--limit <count>` | Import only the first N conversations. |
| `--quiet` | Hide per-conversation progress while pushing. |

## Privacy and ownership

ContinuityBridge is serverless and local by default. It does not call OpenAI, Lore's author, this repository owner, or another external service while importing.

Credential-like strings are scrubbed before records are written to JSONL or sent to Lore. Use `--no-redact` only when you deliberately want verbatim secrets retained in your local history store.

The repository contains synthetic fixtures only. Your exports, Lore database, generated JSONL, and local configuration do not belong in Git.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the precise trust boundaries and deletion considerations.

## Conversation fidelity

ChatGPT exports represent conversations as trees rather than simple transcripts. Large histories may also be distributed across numbered files. ContinuityBridge:

1. discovers every supported conversation file;
2. reconciles repeated conversation records;
3. walks each tree deterministically;
4. keeps parent-message relationships;
5. preserves alternate assistant branches instead of silently selecting one;
6. creates stable Lore identifiers for safe re-imports.

Roles outside Lore's `user`, `assistant`, and `system` contract are retained as `system` records with the original role identified in the text. Signed attachment URLs and opaque pointers are not copied; useful names and media descriptions are retained.

## Architecture

ContinuityBridge deliberately does **not** create another memory database.

- **ContinuityBridge owns adapters and translation.** It understands source-specific exports and converts them into a stable shared contract.
- **Lore owns storage and retrieval.** It provides the local SQLite store, code-aware search, CLI access, and MCP tools.
- **AI clients remain replaceable.** Any authorized client that can use Lore can retrieve the same indexed history.

This separation prevents one chat vendor, model, IDE, or agent harness from becoming the permanent owner of your continuity.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current contracts and adapter path.

## What this is not

ContinuityBridge does not:

- bypass ChatGPT account security;
- scrape another person's conversations;
- provide a hidden API to normal ChatGPT account history;
- make different AI models share an identity or private internal state;
- send your full archive into every prompt;
- require a model to summarize or rewrite your source history.

It gives authorized tools a bounded, searchable route to the user's own records.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm test
npm run check
npm run smoke
```

The test suite uses synthetic conversations only and covers ZIP ingestion, split exports, duplicate reconciliation, branch preservation, redaction, stable identifiers, and the `lore push` handoff.

## Roadmap

The next coherent product trains are:

1. Incremental manifests and fast resume for very large exports.
2. Explicit, user-controlled live capture from supported desktop or browser surfaces.
3. IDE handoff envelopes that attach selected conversation evidence to a coding session.
4. More import adapters for AI chat products and general conversation archives.
5. Source-aware linking between conversations, projects, repositories, branches, issues, and pull requests.

The goal is simple: **one user-owned continuity layer, reachable from every AI tool the user chooses.**

## Relationship to Lore

ContinuityBridge uses Lore's public `push` contract and compatible stable message-ID algorithm. Lore is an independent MIT-licensed project by Jordan Hindo. See [NOTICE](NOTICE).

## License

MIT. See [LICENSE](LICENSE).
