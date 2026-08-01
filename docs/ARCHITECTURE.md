# Architecture

## Purpose

ContinuityBridge translates conversation history from chat products into a source-neutral record contract. It does not replace the memory store. Lore remains responsible for durable local storage, full-text search, retrieval, deletion, exclusions, CLI access, and MCP access.

## Data path

```text
ChatGPT / Claude ZIP, folder, or JSON
                  │
                  ▼
          provider resolver
                  │
                  ▼
          provider parser
                  │
          ┌───────┴────────┐
          ▼                ▼
 redacted inspection   normalized batches
          │                │
          ▼          ┌─────┴─────┐
  Desktop browser    ▼           ▼
                  JSONL       lore push
                                  │
                                  ▼
                           ~/.lore/lore.db
```

## Provider contract

A provider adapter implements:

1. export resolution from ZIP, directory, or JSON;
2. conversation loading and duplicate reconciliation;
3. stable conversation IDs;
4. Lore batch normalization;
5. bounded inspection summaries for human and GUI review.

Provider parsing remains outside the desktop package. The GUI invokes the public CLI, so automation and humans receive the same behavior.

## Boundary contract

Each conversation becomes one Lore source file and one logical session:

- `sourceFileId`: `<provider>:<conversation-id>`
- `sessionId`: same as `sourceFileId`
- `source`: `chatgpt` or `claude` by default
- `kind`: `primary`
- `resumeToken`: SHA-256 of the exported conversation object
- `path`: a non-sensitive provider export URI, never the user's filesystem path

Each message carries:

- stable synthetic `messageId`;
- source and session IDs;
- original or deterministic message UUID;
- parent UUID;
- deterministic sequence;
- normalized role;
- timestamp and model when exported;
- searchable redacted text;
- truncation state.

## ChatGPT fidelity

ChatGPT conversations can contain regenerated answers and alternate child branches. The adapter finds every root, traverses child nodes deterministically, retains every message once, and preserves parent relations.

## Claude fidelity

Claude exports are represented as ordered message collections. The adapter supports common root containers and message fields, preserves explicit parent IDs, and otherwise connects messages in exported chronological order.

## Why use `lore push`

The push interface is Lore's validated universal write boundary. ContinuityBridge does not write Lore's SQLite tables directly, so Lore can evolve its storage schema independently.

## Desktop process boundary

The Python desktop client constructs argument arrays and uses `shell=False`. Long-running work executes on worker threads; UI changes happen only on Tkinter's main thread through a queue.

## Extension model

A new provider should add an adapter and synthetic fixtures, then expose matching `inspect-<provider>` and `import-<provider>` commands. It should not create another database, MCP server, or search engine unless the shared-store contract proves insufficient.
