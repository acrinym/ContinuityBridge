# User guide

ContinuityBridge is organized around one journey:

**bring in evidence → recall exact source context → attach project coordinates → connect tools → build a bounded continuation package.**

## Home

Home shows readiness for:

- ContinuityBridge runtime;
- Lore library / MCP;
- Git repository support;
- supported AI clients.

It also keeps convenience metadata for recent history sources and handoffs. Those lists are not another conversation database.

## History

History handles supported ChatGPT and Claude exports.

Use **Analyze** before mutating the Lore destination. You can then import selected conversations or the full supported export.

Repeated imports use destination-aware checkpoints. Unchanged conversations are skipped unless you explicitly request re-import behavior through the CLI.

## Recall

Recall searches Lore and works with source-backed evidence.

A result includes real identifiers rather than invented references. You can inspect surrounding source context and carry selected evidence to Continue.

### Repository-aware Recall

You may explicitly link selected evidence to:

- a Git repository;
- optional issue references;
- optional pull-request references.

The link store contains lightweight coordinates pointing to Lore evidence. It does not copy the conversation into a second database.

If one piece of evidence belongs to multiple repositories, choose the intended repository filter before continuing so ContinuityBridge does not guess.

## Connections

Connections detects supported installed clients and previews the exact Lore MCP configuration.

1. choose the client;
2. inspect the proposed configuration;
3. explicitly confirm;
4. reload/restart the client when its own behavior requires it.

The packaged release points clients at the bundled `ContinuityBridgeLore` launcher.

## Capture

Capture is intentionally user-controlled.

1. Open **Capture**.
2. Start the local receiver.
3. Note the displayed loopback port and fresh token.
4. Load the bundled browser companion as described by the Workstation.
5. On a supported ChatGPT or Claude page, click **Capture current conversation**.
6. Stop capture when finished.

The receiver binds only to `127.0.0.1`. There is no background LAN listener and the browser extension does not run a background transcript observer.

Unsupported page structures are refused instead of being guessed.

Local tools may also emit the public `continuity-bridge/live-capture-v1` JSON format and use the inspect/submit CLI paths.

## Continue

Continue builds a portable evidence-backed continuation package.

Possible ingredients:

- the task to continue;
- selected Lore evidence;
- query-resolved exact Lore anchors;
- current Git remote, branch, HEAD, and dirty state;
- issue and pull-request coordinates;
- explicitly selected local artifacts.

**Preview does not copy artifacts.** Build is the mutation boundary.

When artifacts are included, ContinuityBridge copies only the selected local files, computes SHA-256 hashes, verifies the copies, and writes a portable manifest.

## Updating ContinuityBridge

Close the app, replace the extracted application folder / `.app` with the newer release, and reopen it.

The packaged runtime is separate from your evidence/state directories, so replacing the application does not silently erase the Lore database or ContinuityBridge state.

## Uninstalling

Delete the extracted application folder or `.app`.

That does not automatically delete:

- `~/.lore/` / configured `LORE_DB`;
- `~/.continuity-bridge/`;
- handoff bundles you saved elsewhere.

Delete those separately only if you intentionally want to remove the data.

## More

- [Getting started](GETTING-STARTED.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Privacy](PRIVACY.md)
- [Workstation internals / behavior](WORKSTATION.md)
