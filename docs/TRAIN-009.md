# Train 009 — Explicit Live Capture

## Product goal

ContinuityBridge 0.9 adds an intentional path for carrying a conversation into Lore while work is happening, without waiting for a full provider export and without pretending provider-private APIs are available.

The train is deliberately user-controlled. Capture is OFF by default. A capture reaches Lore only after the user either submits a public live-capture JSON file or starts the local receiver and explicitly presses Capture in the browser companion.

## Public live-capture contract

Schema:

```text
continuity-bridge/live-capture-v1
```

A payload contains:

- a provider/source identifier;
- a stable conversation ID;
- a human title;
- an optional source page URL;
- ordered user/assistant/system messages;
- optional provider/local message IDs, timestamps, and model names.

ContinuityBridge converts that payload into the same Lore normalized batch boundary used by imports. It does not write Lore SQLite directly.

Generated live records use:

```text
sourceFileId: live:<lore-source>:<conversation-id>
sessionId:    same as sourceFileId
path:         live-capture://<provider>/<conversation-id>
```

When no Lore source override is supplied, the source is `<provider>-live`. The default project is title-derived beneath `live://<provider>/...`.

## Incremental behavior

Live capture uses the existing ContinuityBridge incremental manifest contract.

For each normalized conversation:

1. compute a content resume token;
2. compare it with the checkpoint for the Lore destination;
3. skip the push when unchanged;
4. otherwise write the normalized batch through `lore push`;
5. checkpoint only after the Lore push succeeds.

Repeated browser captures therefore refresh a conversation instead of creating a new ContinuityBridge persistence subsystem.

## CLI

Read-only inspection:

```bash
continuity-bridge capture inspect ./capture.json --json
```

Explicit one-shot mutation:

```bash
continuity-bridge capture submit ./capture.json --to-lore
```

Explicit loopback receiver:

```bash
continuity-bridge capture serve --to-lore --port 43119
```

`submit` and `serve` refuse to run without `--to-lore`. The receiver always binds to `127.0.0.1`; there is no LAN bind option.

A random bearer token is generated when `--token` is omitted. The Workstation creates a fresh token on each application run and does not persist it in settings.

## Browser companion

`browser-extension/` is a Manifest V3 companion included in source/npm and packaged desktop releases.

It has no background capture script.

The only capture path is:

1. user starts the receiver in the Workstation;
2. user loads/opens the companion popup;
3. user supplies the Workstation port/token;
4. user presses **Capture current conversation**;
5. the extension injects a one-shot extractor into the active tab;
6. the extractor accepts only supported ChatGPT/Claude pages with recognized visible message markers;
7. the payload is sent to the authenticated loopback receiver.

If a supported message structure is not recognized, capture refuses rather than guessing or scraping arbitrary page content.

The extension does not call ChatGPT or Claude APIs, does not access provider cookies for transmission, and does not run continuous page observers.

## Workstation Capture area

The unified Workstation adds a **Capture** area showing:

- receiver state: OFF / STARTING / ON;
- exact loopback address and port;
- exact destination: Lore;
- a fresh local browser token;
- optional project/source overrides;
- Start / Stop controls;
- browser companion folder/setup information;
- a manual local live-capture JSON path with Inspect and Submit to Lore actions;
- the most recent capture result.

Closing ContinuityBridge stops a receiver process that the Workstation started.

## Safety boundaries

- Capture is OFF by default.
- Mutation always has an explicit Lore destination.
- The HTTP listener is loopback-only.
- Browser POSTs require a bearer token.
- Browser capture occurs only after a user click.
- Capture source URLs have credentials, query strings, and fragments removed before entering normalized metadata.
- Credential-like message text is redacted by default using the existing privacy contract.
- Message/body size bounds prevent unbounded local requests.
- Concurrent HTTP capture requests are serialized through the ingestion boundary.
- No provider-private API, signed URL, or hidden browser session endpoint is assumed.
- Native desktop-client transcript scraping is not claimed when a stable public/local transcript surface is unavailable; those tools can use the public JSON contract instead.

## Acceptance journey

1. Launch ContinuityBridge.
2. Open Capture and observe **OFF**.
3. Start the receiver and see the exact `127.0.0.1` endpoint and Lore destination.
4. Load the bundled browser companion and enter the Workstation token/port.
5. Open a supported visible ChatGPT/Claude conversation and explicitly press Capture.
6. The current visible conversation is normalized and pushed to Lore.
7. Press Capture again without changes and receive an `unchanged` result.
8. Add a new visible message and capture again; the updated batch is pushed and checkpointed.
9. Search Recall and retrieve the live conversation through Lore like imported history.
10. Stop Capture and confirm the receiver is OFF.

The same path can be exercised without a browser by inspecting and explicitly submitting a `live-capture-v1` JSON file.

## What this train does not do

- no always-on browser observer;
- no browser cookie/session export;
- no undocumented provider API client;
- no direct Lore database writes;
- no second live-capture database;
- no native-client filesystem scraping without a supported transcript contract;
- no recursive monitoring/audit subsystem.
