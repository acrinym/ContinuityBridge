# Getting started

This guide is for people who want to **use ContinuityBridge**, not build it.

## 1. Download the right archive

From the `v1.0.0` GitHub Release, download exactly one platform bundle:

| Platform | Release file |
| --- | --- |
| Windows x64 | `ContinuityBridge-windows-x64.zip` |
| macOS | `ContinuityBridge-macos.zip` |
| Linux x64 | `ContinuityBridge-linux-x64.tar.gz` |

Download `SHA256SUMS.txt` too if you want to verify the archive before opening it.

## 2. Verify the checksum (optional but recommended)

### Windows PowerShell

```powershell
Get-FileHash .\ContinuityBridge-windows-x64.zip -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

Compare the printed SHA-256 value with the matching line in `SHA256SUMS.txt`.

### macOS

```bash
shasum -a 256 ContinuityBridge-macos.zip
grep 'ContinuityBridge-macos.zip' SHA256SUMS.txt
```

### Linux

```bash
sha256sum ContinuityBridge-linux-x64.tar.gz
grep 'ContinuityBridge-linux-x64.tar.gz' SHA256SUMS.txt
```

## 3. Extract and launch

### Windows

Extract the ZIP, then run `ContinuityBridge.exe`.

### macOS

Extract the ZIP and open `ContinuityBridge.app`.

The 1.0 app is not notarized, so Gatekeeper may show the normal unsigned-download warning. Use macOS's standard review / Open flow for the app. Do not disable Gatekeeper globally.

### Linux

Extract the tarball:

```bash
tar -xzf ContinuityBridge-linux-x64.tar.gz
cd ContinuityBridge
./ContinuityBridge
```

## 4. First run

ContinuityBridge checks:

- its packaged runtime;
- bundled Lore;
- optional Git availability;
- optional supported AI clients.

You can choose **Initialize local memory** to let bundled Lore detect and index supported existing local transcript sources. That action is explicit and does **not** silently configure AI clients.

You may skip it completely and use **History** or **Capture** instead.

## 5. Bring in evidence

Choose one or more paths:

- **History:** import a ChatGPT or Claude export.
- **Capture:** start the local capture receiver and explicitly capture a supported active browser conversation.
- **Initialize local memory:** ask Lore to index supported existing transcript sources.

## 6. Recall what matters

Open **Recall**, search the local Lore library, inspect the returned source evidence, and select exact evidence for continuation.

If the work belongs to a repository, link the evidence to that repository and optional issue / pull-request coordinates.

## 7. Connect an AI client (optional)

Open **Connections**. ContinuityBridge can detect supported installed clients and preview the exact Lore MCP configuration before applying anything.

Supported 1.0 client integrations:

- Codex;
- Claude Code;
- Cursor.

Nothing is changed until you explicitly confirm it.

## 8. Continue

Open **Continue**, write the next task, add selected evidence, optionally add repository state and verified artifacts, preview the result, then Build.

The output is designed to be carried into the next AI session rather than requiring that new session to rediscover the entire history.

## Where your data lives

The application bundle is replaceable. Your continuity data lives outside it:

- Lore database: `~/.lore/` by default, or configured `LORE_DB`;
- ContinuityBridge state: `~/.continuity-bridge/`;
- handoff bundles: wherever you chose to save them.

See [Privacy](PRIVACY.md) for the full model.
