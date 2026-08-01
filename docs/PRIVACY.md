# Privacy

ContinuityBridge processes private conversation history, so privacy is a product requirement rather than a disclaimer.

## Local-only execution

The application performs no network calls. Input is read from a local ZIP, directory, or JSON file. Output is either:

- written to a path chosen by the user, or
- sent over stdin to a local `lore push` process.

## Default credential redaction

Before a message leaves the parser, ContinuityBridge redacts common forms of:

- OpenAI API keys
- GitHub tokens
- AWS access-key IDs
- bearer tokens
- private-key blocks
- values assigned to common password, token, secret, and API-key fields

Redaction is a safety net, not a perfect secret scanner. Users should still protect their export files and Lore database.

`--no-redact` disables this behavior intentionally.

## Paths and attachments

The absolute export path is not stored in Lore records. A non-sensitive `chatgpt-export://conversation/<id>` URI is used instead.

Raw attachment pointers and signed URLs are not copied into searchable text. File names and media types may be retained so an AI can understand that an image, audio file, or document was part of the conversation.

## No bundled personal data

Tests and examples use synthetic fixtures. The repository must never contain real exports, local databases, private messages, credentials, or screenshots of private conversations.
