# Train 008 — Repository-Aware Continuity Links

Version: 0.8.0

## Product outcome

ContinuityBridge can now answer a practical question that generic semantic search cannot answer by itself:

> What conversation evidence and prior handoffs belong to *this repository / issue / pull request*?

The feature deliberately does not create another evidence database. Lore remains the durable conversation store. ContinuityBridge stores only lightweight links between repository identity and existing Lore IDs / handoff paths.

## User journey

1. Search Lore in **Recall**.
2. Select real source evidence.
3. Choose the local Git repository that evidence belongs to.
4. Optionally enter issue and pull-request references (`#42`, `#88`, or explicit URLs).
5. Choose **Link selected evidence**.
6. Later, filter Recall by that repository or open **Continue** with linked evidence.
7. In Continue, choose **Find related continuity** to see:
   - exact linked Lore message IDs;
   - linked session IDs;
   - previous handoff files;
   - issue references;
   - pull-request references.
8. Choose **Add related evidence** to put those exact message IDs into the handoff evidence list.
9. Build the continuation package.
10. The resulting `handoff-v3` carries current Git coordinates plus issue/PR coordinates, and the built handoff is linked back to the repository for the next continuation.

## Lightweight metadata contract

Repository links live at:

```text
~/.continuity-bridge/repository-links.json
```

Schema:

```text
continuity-bridge/repository-links-v1
```

The file stores only continuity coordinates:

- repository name / credential-free remote identity;
- current branch and commit last observed;
- optional local path chosen by the user;
- exact Lore message IDs;
- exact Lore session IDs;
- generated handoff paths;
- explicit issue references;
- explicit pull-request references.

It does **not** copy Lore message bodies, create embeddings, mirror Git history, fetch GitHub issues/PRs, or create a graph database.

## Repository identity

When `origin` exists, repository identity is based on a normalized credential-free remote. HTTPS and common Git SSH forms normalize to the same host/path identity where possible.

When no remote exists, ContinuityBridge falls back to an explicit local identity containing the repository name and resolved local path.

This is intentionally a continuity identifier, not a global repository registry.

## Recall behavior

Repository filtering is applied to real Lore search hits:

- an unfiltered search requests the normal bounded result set;
- a repository-filtered search requests a larger bounded Lore candidate set, then keeps only hits whose real message ID or session ID is linked to the selected repository;
- no synthetic or guessed Lore identifiers are created.

Linking evidence is explicit. Searching a phrase does not silently associate every result with the current repository.

## Continue behavior

The Continue screen can surface repository-related continuity before building:

- related Lore IDs can be added directly as exact evidence anchors;
- previous handoff paths are visible for human/action context;
- issue and PR refs can be restored from existing links or entered for the current continuation;
- successfully built handoffs are associated back to the repository link store.

## Handoff v3

`continuity-bridge handoff` adds repeatable repository-reference options:

```bash
--issue <ref>
--pull-request <ref>
```

References may be compact forms such as `#42` or explicit URLs. HTTP(S) credentials and URL fragments are stripped before handoff storage.

The generated handoff repository section now includes:

```json
{
  "name": "example",
  "remote": "https://github.com/acme/example.git",
  "branch": "main",
  "head": "...",
  "dirty": false,
  "issues": ["#42"],
  "pullRequests": ["#88"]
}
```

If issue/PR references are supplied but no Git repository can be resolved, handoff generation refuses rather than silently dropping the references.

## Safety boundaries

- No GitHub API token is required for repository linking.
- No issue or PR content is fetched implicitly.
- URL credentials are removed from explicit repository references.
- Linking evidence is an explicit user action.
- The link store contains IDs and paths, not copied conversation evidence.
- Lore remains the source of truth for conversation content.
- Current repository state must still be verified when a handoff is consumed.

## Acceptance journey

A release candidate is accepted when the user can:

1. recall an imported Lore message;
2. link it to a local Git repository plus an issue/PR reference;
3. restart ContinuityBridge and retain that link;
4. filter Recall by the repository;
5. send the linked evidence to Continue and restore the repository context;
6. surface previous handoffs / issue / PR coordinates for that repository;
7. add linked exact message IDs to the continuation evidence;
8. build a `handoff-v3` containing current Git coordinates and sanitized issue/PR refs;
9. see the newly built handoff become related continuity for the same repository.
