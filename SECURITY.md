# Security policy

ContinuityBridge is a local-first desktop/CLI project that processes user-authorized conversation exports, explicit live-capture payloads, local repository coordinates, and explicitly selected local artifacts.

## Supported release

Security fixes target the current public release line. At the time of this document, that is **1.0.x**.

## Reporting a security issue

If GitHub Private Vulnerability Reporting is enabled for this repository, use that private channel.

If private reporting is not available, open a minimal public issue that **does not include exploit details or secrets** and ask for a private contact path.

Do not place any of the following in a public issue:

- conversation contents that are not intended for publication;
- passwords, API keys, bearer tokens, cookies, or signed URLs;
- private repository credentials or credential-bearing remotes;
- private attachment contents;
- detailed exploit steps for an unpatched vulnerability.

## Security boundaries

The project treats these as release-critical boundaries:

- live capture must remain loopback-only unless the product contract explicitly changes;
- the capture receiver requires bearer authorization;
- browser capture happens only after an explicit user action;
- captured source URLs must not retain credentials, query strings, or fragments;
- provider-private opaque attachment pointers are not portable evidence;
- copying local artifacts requires explicit selection and verification;
- AI-client configuration mutations require explicit confirmation;
- repository remote identity must not preserve embedded credentials;
- user evidence stays outside the replaceable application package;
- ContinuityBridge interacts with Lore through its public CLI/push/MCP contracts rather than coupling directly to Lore's SQLite internals.

## Release integrity

Tagged releases publish `SHA256SUMS.txt` for the Windows, macOS, and Linux archives.

The 1.0 packages are currently unsigned / not notarized. A checksum proves that a downloaded archive matches the GitHub Release asset; it is not a substitute for future platform code signing.
