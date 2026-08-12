# ContinuityBridge Workstation

ContinuityBridge Workstation is the primary desktop product beginning with 0.7. It brings import, recall, AI-client connections, repository state, safe attachments, and handoff generation into one local application.

## What the Workstation does

The intended journey is:

1. launch ContinuityBridge;
2. check local readiness;
3. import or refresh ChatGPT/Claude history;
4. search the original evidence in Recall;
5. inspect exact source context;
6. connect an installed AI client to Lore when needed;
7. send selected evidence into Continue;
8. optionally add current repository state and explicitly selected local artifacts;
9. preview without copying files;
10. build the portable continuation package.

ContinuityBridge never needs a model API key to perform this journey.

## First run

The first launch opens a guided readiness view.

It checks:

- the ContinuityBridge runtime;
- Lore CLI/MCP readiness;
- optional Git availability;
- Codex, Claude Code, and Cursor installation/connection state.

From there you can choose your first provider export immediately or open Connections. If Lore is missing, copy the setup instructions and install/setup Lore before importing searchable continuity.

Lore setup currently uses:

```bash
npm install -g @jordanhindo/lore
lore setup
```

The packaged Workstation embeds the ContinuityBridge Node engine and Node runtime; those are not separate end-user setup steps.

## Home

Home answers four questions quickly:

- Is the ContinuityBridge runtime ready?
- Is Lore ready?
- Is Git available if this task needs repository coordinates?
- Which supported AI clients are installed and already connected to Lore?

Home also keeps short recent lists for provider exports and generated handoffs. These are path/history conveniences only; the Workstation does not copy conversations into a second database.

Selecting a recent source can reopen it in History for another incremental refresh.

## History

History opens ChatGPT and Claude exports.

Supported source forms remain the provider adapters' public contract:

- ZIP export;
- extracted export folder;
- JSON export forms supported by that provider adapter.

### Analyze

Analyze parses the selected export locally and shows the conversation list before any import mutation.

You can filter conversations and inspect a preview. Credential-like redaction stays enabled by default.

### Import selected

Select one or more conversations and import only those into Lore.

### Import all / Refresh into Lore

Running the same source again uses the existing destination-aware incremental import system. Unchanged conversations are skipped; changed/new conversations are pushed; confirmed progress is checkpointed for resume.

The Workstation does not maintain a separate refresh engine.

## Recall

Recall makes imported continuity usable from inside the product.

Enter a phrase, search Lore, and select a result. ContinuityBridge displays the real Lore message ID returned by the search and retrieves surrounding context using that exact ID.

This is original source evidence, not a generated summary.

Choose **Continue with selected evidence** to carry the exact message ID into the Continue screen.

## Connections

Connections detects supported local AI clients:

- Codex;
- Claude Code;
- Cursor.

For an installed client, ContinuityBridge can show whether Lore is already configured.

Before changing anything, the screen shows the target configuration location and exact Lore MCP configuration. The user must explicitly confirm the change.

Cursor configuration preserves unrelated JSON settings and creates a backup when modifying an existing file. Codex and Claude Code use their supported MCP command paths where available.

## Continue

Continue builds the package another AI needs to pick up real work.

### Task and evidence

Provide the next task. Evidence can come from:

- a Lore search query;
- exact Lore message IDs;
- a message ID carried directly from Recall.

The handoff engine retrieves bounded source context using those real identifiers.

### Repository

Choose a current Git repository to include:

- sanitized remote;
- branch;
- HEAD commit;
- working-tree state.

Or explicitly choose no repository.

### Safe attachments

When the source conversation references local artifacts:

1. choose the ChatGPT/Claude export that contains those references;
2. scan it;
3. inspect `available`, `missing`, or `ambiguous` status;
4. select only the references you want to carry;
5. choose a portable bundle folder.

ContinuityBridge resolves only local artifacts inside the selected export root. It does not follow signed provider URLs or use opaque provider IDs as download credentials.

### Preview

Preview retrieves evidence and renders the proposed handoff without passing an attachment bundle mutation target. Selected artifacts are therefore referenced but not copied.

### Build

Build writes the handoff and, when selected, copies local artifacts into the portable bundle. Copies are SHA-256 verified and referenced by relative path.

The bundle can then move to another directory/machine without relying on the original absolute path.

## Local data locations

ContinuityBridge Workstation convenience metadata:

```text
~/.continuity-bridge/workstation.json
```

Desktop preferences:

```text
~/.continuity-bridge/desktop.json
```

Incremental import manifests also live beneath the ContinuityBridge local state area according to the import contract.

Lore data is separate, normally beneath:

```text
~/.lore/
```

or the path selected through `LORE_DB`.

Portable handoff bundles live wherever you explicitly create them.

## Packaged releases

The release workflow produces:

- `ContinuityBridge-windows-x64.zip`;
- `ContinuityBridge-macos.zip` containing `ContinuityBridge.app`;
- `ContinuityBridge-linux-x64.tar.gz`.

A packaged release contains the Workstation, ContinuityBridge Node core, and Node runtime. It does not bundle Lore's database or your conversation history.

## Update

Close ContinuityBridge, download the newer platform archive, and replace the previous application bundle/folder.

Because continuity data is stored outside the application bundle, updating the app does not replace Lore history, recent-source metadata, or handoff bundles.

## Uninstall

Delete the packaged application bundle/folder.

That removes the application but deliberately leaves user-owned local data untouched.

If you also want to remove data, separately and intentionally remove the relevant paths:

- `~/.continuity-bridge/` for ContinuityBridge preferences/manifests/recent metadata;
- `~/.lore/` or the configured Lore database for durable imported evidence;
- any handoff bundles you created.

Do not remove those paths merely to uninstall the application if you want to preserve continuity for a future reinstall.

## Source/developer launch

```bash
pip install ./desktop
continuity-bridge-desktop
```

Compatibility/focused entrypoints remain:

```bash
continuity-bridge-gui
continuity-bridge-import
continuity-bridge-connections
continuity-bridge-handoff
```

The normal product journey should not require switching among them.
