import { createHash } from "node:crypto";

/**
 * Lore-compatible synthetic message ID.
 *
 * This intentionally matches Lore's public normalized-record contract so records
 * produced here remain stable and idempotent when sent through `lore push`.
 */
export function computeMessageId(sourceFileId, uuid, seq) {
  return createHash("sha256")
    .update(`${sourceFileId}\u0000${uuid}\u0000${seq}`)
    .digest("hex");
}

export function assertLoreBatch(batch) {
  const requiredSource = [
    "sourceFileId",
    "source",
    "sessionId",
    "kind",
    "path",
    "byteOffset",
    "lineCount",
    "indexedAt",
  ];
  for (const key of requiredSource) {
    if (batch?.sourceFile?.[key] === undefined || batch.sourceFile[key] === null) {
      throw new Error(`invalid Lore batch: sourceFile.${key} is required`);
    }
  }
  if (!Array.isArray(batch.messages) || !Array.isArray(batch.toolCalls)) {
    throw new Error("invalid Lore batch: messages and toolCalls must be arrays");
  }
  for (const [index, message] of batch.messages.entries()) {
    for (const key of ["messageId", "sourceFileId", "sessionId", "uuid", "seq", "role", "text"] ) {
      if (message[key] === undefined || message[key] === null) {
        throw new Error(`invalid Lore batch: messages[${index}].${key} is required`);
      }
    }
    if (!["user", "assistant", "system"].includes(message.role)) {
      throw new Error(`invalid Lore batch: messages[${index}].role is unsupported`);
    }
  }
  return batch;
}
