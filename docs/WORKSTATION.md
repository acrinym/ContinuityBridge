# ContinuityBridge Workstation

ContinuityBridge Workstation is the primary desktop product beginning with 0.7. It brings import, explicit live capture, recall, AI-client connections, repository-aware continuity, safe attachments, and handoff generation into one local application.

## What the Workstation does

The intended journey is:

1. launch ContinuityBridge;
2. check local readiness;
3. import/refresh ChatGPT or Claude history, or explicitly capture a supported active conversation;
4. search the original evidence in Recall;
5. inspect exact source context;
6. optionally link that evidence to a Git repository, with optional issue and pull-request references;
7. connect an installed AI client to Lore when needed;
8. send selected evidence into Continue;
9. recover related evidence/prior handoffs for the repository when useful;
10. optionally add current repository state and explicitly selected local artifacts;
11. preview without copying files;
12. build the portable continuation package.

ContinuityBridge never needs a model API key to perform this journey.

## First run

The first launch opens a guided readiness view. It checks the ContinuityBridge runtime, Lore CLI/MCP readiness, optional Git availability, and Codex/Claude Code/Cursor connection state.

From there you can choose your first provider export, open Capture, or open Connections. Live Capture stays OFF until explicitly started.

Lore setup currently uses:

```bash
npm install -g @jordanhindo/lore
lore setup
```

The packaged Workstation embeds the ContinuityBridge Node engine and Node runtime; those are not separate end-user setup steps.

## Home

Home answers four questions quickly: whether the ContinuityBridge runtime is ready, whether Lore is ready, whether Git is available when repository coordinates matter, and which supported AI clients are installed/connected.

Home also keeps short recent lists for provider exports and generated handoffs. These are path/history conveniences only; the Workstation does not copy conversations into a second database.

## History

History opens ChatGPT and Claude ZIP, extracted-folder, and supported JSON exports. Analyze is local and non-mutating. Import selected or Import all/Refresh sends normalized records to Lore using the existing incremental/resume engine, so unchanged conversations are skipped and confirmed progress is checkpointed.

Credential-like redaction remains enabled by default.

## Capture

Capture is the explicit live-ingestion surface added in 0.9.

### Receiver state and destination

The page always shows whether the receiver is **OFF**, **STARTING**, or **ON**. The receiver does not start with the application.

When started by the Workstation:

- it binds only to `127.0.0.1`;
- it writes only through the configured Lore CLI;
- the exact destination is shown in the UI;
- it requires the fresh browser token generated for the current application run;
- closing ContinuityBridge stops the child receiver process.

The token is not stored in desktop settings.

Optional Project and Source overrides can force captured conversations into a chosen Lore namespace. If left blank, the source is `<provider>-live` and the project is derived from the captured title beneath `live://<provider>/...`.

### Browser companion

The packaged application contains `browser-extension/`, a Manifest V3 browser companion.

Load that folder as an unpacked browser extension, start the Capture receiver, then paste the shown port and token into the extension popup.

Nothing is captured automatically. The extension has no background capture worker and does not continuously observe pages. On a supported ChatGPT or Claude conversation page, press **Capture current conversation**. Only then does the extension inject a one-shot extractor into the active page, collect recognized visible message containers, and POST the public live-capture payload to the authenticated loopback receiver.

If the current page or visible message structure is not recognized, the extension refuses to capture rather than guessing arbitrary page text. It does not call provider-private APIs.

### Local/manual live-capture JSON

A local tool or desktop surface can emit the same public schema:

```text
continuity-bridge/live-capture-v1
```

Choose the JSON file in Capture and use **Inspect** to validate it without mutation. **Submit to Lore** is the explicit mutation action.

This is the supported integration path for desktop/local clients when ContinuityBridge does not have a stable public transcript surface to read. It avoids claiming hidden native-client scraping.

### Incremental live refresh

Live capture reuses the normal ContinuityBridge incremental manifest. A repeated capture with the same resume token returns `unchanged` and does not push another Lore batch. When new/changed visible messages produce a new resume token, the updated normalized batch is pushed and checkpointed only after Lore confirms the write.

Captured source-page URLs have credentials, query strings, and fragments removed before they enter normalized metadata. Message text uses the normal credential-like redaction contract unless explicitly disabled through the CLI.

## Recall

Recall searches Lore and displays the real returned message ID, source/session metadata, and surrounding context retrieved with that exact ID. Imported and live-captured conversations therefore use the same evidence surface.

Choose **Continue with selected evidence** to carry the exact message ID into Continue.

### Repository-aware Recall

Beginning with 0.8, Recall can explicitly associate a real Lore evidence record with a local Git repository. Select a result, choose the repository, optionally add issue/PR references, then choose **Link selected evidence**.

The link is lightweight metadata: Lore remains the conversation-content store.

The repository filter narrows real Lore search results by linked message/session IDs. Recall → Continue restores linked repository/ref context when exactly one repository is known, or when the active repository filter disambiguates the result. If evidence belongs to multiple repositories and no filter selects one, ContinuityBridge preserves the current Continue context and asks the user to choose.

## Connections

Connections detects Codex, Claude Code, and Cursor and shows whether Lore is already configured. Before changing anything, ContinuityBridge shows the exact target/configuration and requires explicit confirmation.

Cursor configuration preserves unrelated JSON settings and backs up existing configuration. Codex and Claude Code use their supported MCP command paths where available.

## Continue

Continue builds the evidence-backed package another AI needs to pick up real work.

Evidence can come from a Lore query, exact Lore message IDs, a message carried from Recall, or exact IDs linked to the selected repository. Query-based handoffs read the exact resolved anchor IDs from the file actually written before repository backlink metadata is saved.

### Repository

Choose a Git repository to include sanitized remote, branch, HEAD, and working-tree state, or explicitly choose no repository.

### Related continuity

**Find related continuity** surfaces exact linked Lore message IDs, prior generated handoffs, issue references, and pull-request references. **Add related evidence** adds those exact Lore IDs to the continuation evidence list.

Issue/PR references are optional repository coordinates. A resolvable Git repository is required when either is supplied. ContinuityBridge does not silently fetch their live contents; the consuming user/AI must verify current state.

### Safe attachments

Choose a ChatGPT/Claude export, scan its references, inspect available/missing/ambiguous state, select only the artifacts to carry, and choose a portable bundle folder. ContinuityBridge resolves only local artifacts inside the selected export root and never follows provider-private signed download URLs.

### Preview and Build

Preview retrieves evidence and renders the proposed handoff without copying attachment files. Build writes the handoff and explicitly selected SHA-256-verified artifacts. `handoff-v3` includes sanitized issue/PR coordinates under repository metadata when supplied.

## Local data locations

Workstation convenience metadata:

```text
~/.continuity-bridge/workstation.json
```

Repository continuity links:

```text
~/.continuity-bridge/repository-links.json
```

Desktop preferences:

```text
~/.continuity-bridge/desktop.json
```

The shared incremental manifest beneath `~/.continuity-bridge/` tracks confirmed import and live-capture resume tokens. It stores checkpoint metadata, not another copy of conversation text.

Lore data remains separate, normally beneath `~/.lore/` or the configured `LORE_DB` path. Portable handoff bundles live wherever you explicitly create them.

## Packaged releases

The release workflow produces:

- `ContinuityBridge-windows-x64.zip`;
- `ContinuityBridge-macos.zip` containing `ContinuityBridge.app`;
- `ContinuityBridge-linux-x64.tar.gz`.

A packaged release contains the Workstation, ContinuityBridge Node core, Node runtime, and browser capture companion. It does not bundle Lore's database or your conversation history.

## Update

Close ContinuityBridge, download the newer platform archive, and replace the previous application bundle/folder. User-owned continuity data remains outside the app bundle.

## Uninstall

Delete the packaged application bundle/folder. This removes the application and bundled browser companion but deliberately leaves user-owned local data untouched.

If you also want to remove data, separately and intentionally remove:

- `~/.continuity-bridge/` for preferences/manifests/recent/repository-link metadata;
- `~/.lore/` or configured Lore database for durable imported/captured evidence;
- any handoff bundles you created.

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
