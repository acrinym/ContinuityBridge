# Handoff Builder

ContinuityBridge handoffs are portable evidence packages for continuing work in another AI client without pasting an entire transcript or asking a model to summarize private history first.

## What goes into a handoff

A handoff contains:

- the continuation task supplied by the user;
- optional Git repository coordinates: repository name, credential-scrubbed origin remote, branch, HEAD commit, and dirty/clean working-tree state;
- one or more Lore anchor message IDs;
- bounded source context around each anchor;
- source, session, project, timestamp, role, and model metadata when Lore exposes them;
- continuation rules telling the receiving client to verify current repository state and retrieve additional Lore context only when needed.

Local absolute repository paths are omitted unless `--include-local-path` is explicitly selected.

## CLI

Search Lore and build Markdown on stdout:

```bash
continuity-bridge handoff \
  --task "Continue parser ambiguity fixes" \
  --query "parser ambiguity"
```

Write a handoff for an exact known Lore message:

```bash
continuity-bridge handoff \
  --task "Continue issue 42" \
  --message-id 9f3c...a71b \
  --repo . \
  --output HANDOFF.md
```

Build machine-readable JSON:

```bash
continuity-bridge handoff \
  --task "Review authentication design" \
  --query "authentication design" \
  --format json \
  --output handoff.json
```

### Options

| Option | Meaning |
|---|---|
| `--task <text>` | Required continuation goal. |
| `--query <text>` | Run a recency-blended Lore search and use returned hits as anchors. |
| `--message-id <id>` | Include an exact Lore message; repeat for several. |
| `--limit <count>` | Maximum search-derived anchors; default 5. |
| `--context-messages <count>` | Maximum context messages retained around each anchor; default 11. |
| `--lore-command <path>` | Override the Lore executable. |
| `--repo <path>` | Capture Git coordinates from the specified repository. |
| `--no-repo` | Omit repository coordinates. |
| `--include-local-path` | Opt in to embedding the absolute local repository path. |
| `--output <file>` | Write to a file instead of stdout. |
| `--format markdown|json` | Select output format. |

At least one `--query` or `--message-id` is required.

## Desktop

Install the desktop package and launch:

```bash
pip install ./desktop
continuity-bridge-handoff
```

The desktop builder provides:

- task entry;
- Lore search query;
- repeatable exact message IDs;
- search-anchor and context bounds;
- repository chooser or explicit repository omission;
- Markdown/JSON output;
- preview before writing;
- saved non-sensitive runtime preferences.

The desktop application invokes the same public command as the CLI and uses argument arrays with `shell=False`.

## Evidence-selection behavior

For search-driven handoffs, ContinuityBridge calls Lore search first. It then uses the actual message IDs returned by Lore for `get` and `context` retrieval. It never fabricates an identifier.

For explicit IDs, the requested IDs are used directly. Search and explicit evidence can be combined.

Context is deliberately bounded. A handoff is a starting package, not a transcript dump. The receiving AI can use the included stable message/session IDs to retrieve additional evidence from Lore when needed.

## Repository behavior

Repository coordinates are collected from local Git only. The handoff does not include file contents or a repository archive.

HTTP(S) origin URLs are sanitized to remove embedded username/password/token userinfo before rendering. SSH remotes are preserved as ordinary Git coordinates.

The receiving AI is explicitly instructed to query the live repository again before changing code because the handoff records a point-in-time commit and working-tree state.

## What Handoff Builder does not do

It does not:

- call a language model;
- invent a narrative summary of the selected conversations;
- create another continuity database;
- dump the complete Lore store;
- execute repository code;
- upload the handoff anywhere;
- assume that evidence in the handoff is newer than the live repository.

The package carries **source evidence plus coordinates**. Interpretation remains with the user and the receiving AI at continuation time.
