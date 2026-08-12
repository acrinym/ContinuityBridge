# Incremental Lore imports

Repeated ChatGPT and Claude exports often contain thousands of conversations that have not changed. ContinuityBridge now keeps a small local manifest so Lore delivery only revisits new or changed conversations.

## Default behavior

When `--to-lore` is used, ContinuityBridge loads:

```text
~/.continuity-bridge/import-manifest.json
```

For each selected conversation it compares the provider-derived `resumeToken` against the last successful Lore checkpoint for the same destination. Unchanged conversations are skipped. New or changed conversations are pushed normally.

The destination identity includes:

- Lore delivery kind;
- source namespace;
- project override;
- `LORE_DB` value or the default Lore database location.

This prevents a checkpoint for one project or Lore database from suppressing delivery to another.

## Checkpoint timing

A conversation is recorded in the manifest only after `lore push` succeeds for that exact normalized batch. The updated manifest is written through a temporary file and atomically renamed after every confirmed conversation.

If conversation 12 fails during a large run:

- conversations 1–11 remain checkpointed;
- conversation 12 is not checkpointed;
- later conversations are not attempted;
- the next run resumes with conversation 12 instead of starting from the beginning.

Lore's stable message IDs remain the final idempotency boundary if a process is interrupted after Lore accepts a batch but before its local checkpoint can be written.

## Commands

Normal resumable import:

```bash
continuity-bridge import-chatgpt export.zip --to-lore
continuity-bridge import-claude export.zip --to-lore
```

Use a different manifest:

```bash
continuity-bridge import-chatgpt export.zip \
  --to-lore \
  --manifest ./state/team-lore-manifest.json
```

Force every selected conversation through Lore and refresh the checkpoints:

```bash
continuity-bridge import-chatgpt export.zip --to-lore --reimport
```

Disable manifest planning for one run:

```bash
continuity-bridge import-chatgpt export.zip --to-lore --no-manifest
```

Plan without pushing or checkpointing:

```bash
continuity-bridge import-chatgpt export.zip --to-lore --dry-run
```

## JSONL remains complete

Incremental skipping applies only to Lore delivery. `--output` always writes a complete normalized JSONL snapshot of every selected conversation, including conversations Lore already has.

A combined run therefore behaves deliberately:

```bash
continuity-bridge import-chatgpt export.zip \
  --to-lore \
  --output ./complete-snapshot.jsonl
```

- JSONL receives the complete selected archive.
- Lore receives only new or changed conversations.

This avoids producing a portable file that silently omits old history.

## Manifest safety

- The manifest contains identifiers, resume tokens, counts, destination keys, and timestamps—not conversation text.
- New files are written with owner-only permissions where the platform supports POSIX modes.
- Invalid JSON, unsupported versions, or malformed roots fail closed.
- The manifest lives outside the repository by default and must never be committed.
