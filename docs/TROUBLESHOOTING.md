# Troubleshooting

Start with the **Home** readiness panel and **Check again**. It separates runtime, Lore, Git, and client status so one missing optional integration does not look like a total application failure.

## The app is blocked by Windows SmartScreen or macOS Gatekeeper

ContinuityBridge 1.0 packages are not code-signed/notarized.

Download only from the official GitHub Release, verify `SHA256SUMS.txt` when integrity matters, and use your operating system's normal per-application review/allow path. Do not globally disable SmartScreen or Gatekeeper.

## Lore says it is not ready

Packaged builds include Lore; they do not require a global npm install.

Try **Initialize local memory** on Home. If initialization fails, copy the local error and include it in a bug report.

Source installs are different: they must provide a compatible `lore` command or `CONTINUITYBRIDGE_LORE` override.

## Capture says OFF

That is the normal safe default.

Open Capture and explicitly press Start. The Workstation will show the active loopback port and fresh token.

## Browser capture cannot connect

Check that:

- Capture is ON in the Workstation;
- the extension is using the current displayed port/token;
- the receiver address is `127.0.0.1`;
- the Workstation has not been closed/restarted since the token was copied.

A new application run gets a fresh token.

## Browser capture refuses the page

Refusal is intentional when the visible page does not match a supported ChatGPT/Claude message structure.

ContinuityBridge does not fall back to scraping arbitrary page text. Use an export or the public live-capture JSON contract if the provider UI has changed and support has not yet caught up.

## An unchanged capture/import was skipped

That is expected incremental behavior. ContinuityBridge checkpoints confirmed destination writes and skips unchanged source evidence on later refreshes.

## Git repository context is unavailable

Git is optional for basic history, Recall, Capture, Connections, and non-repository handoffs.

Install Git only if you want repository-aware continuity coordinates or repository state in handoffs.

## A repository link points to the wrong project

If the same evidence has been linked to multiple repositories, select the intended repository filter before using Recall → Continue.

ContinuityBridge intentionally avoids choosing an arbitrary repository when the relationship is ambiguous.

## An AI client is installed but not connected

Open Connections and inspect the preview.

ContinuityBridge will not silently mutate the client's configuration. Apply the supported configuration explicitly, then reload/restart the client if its own integration requires it.

## My data disappeared after replacing the app

The application package is not the primary evidence store.

Check:

- `~/.lore/` or your configured `LORE_DB`;
- `~/.continuity-bridge/`;
- the location where you saved handoff bundles.

If those directories are present, reinstall/replacement of the app should not itself remove the continuity data.

## Reporting a bug

Open a GitHub issue and include:

- OS and version;
- ContinuityBridge version;
- what area you were using (History / Recall / Connections / Capture / Continue);
- expected result;
- actual result;
- exact visible error text;
- whether the packaged release or source install is in use.

**Do not post private conversation text, credentials, bearer tokens, private repository URLs, or confidential attachments unless you intentionally redact them first.**

Security-sensitive reports should follow [`../SECURITY.md`](../SECURITY.md).
