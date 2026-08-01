const MAX_SERIALIZED_OBJECT = 40_000;

function attachmentLabel(part) {
  const mime = part.mime_type ?? part.content_type ?? part.media_type;
  const name = part.name ?? part.filename ?? part.file_name;
  if (name && mime) return `[attachment: ${name} (${mime})]`;
  if (name) return `[attachment: ${name}]`;
  if (mime?.startsWith("image/")) return "[image attachment]";
  if (mime?.startsWith("audio/")) return "[audio attachment]";
  if (part.asset_pointer || part.image_url || part.audio_asset_pointer) {
    return "[attachment]";
  }
  return null;
}

function renderPart(part) {
  if (part === null || part === undefined) return "";
  if (typeof part === "string") return part;
  if (typeof part === "number" || typeof part === "boolean") return String(part);
  if (Array.isArray(part)) return part.map(renderPart).filter(Boolean).join("\n");
  if (typeof part !== "object") return String(part);

  const attachment = attachmentLabel(part);
  if (attachment) return attachment;
  if (typeof part.text === "string") return part.text;
  if (typeof part.content === "string") return part.content;
  if (Array.isArray(part.parts)) return part.parts.map(renderPart).filter(Boolean).join("\n");
  if (part.content && typeof part.content === "object") return renderPart(part.content);
  if (typeof part.result === "string") return part.result;

  const serialized = JSON.stringify(part);
  if (!serialized) return "";
  return serialized.length <= MAX_SERIALIZED_OBJECT
    ? serialized
    : `${serialized.slice(0, MAX_SERIALIZED_OBJECT)}\n[structured content truncated]`;
}

export function extractMessageText(message) {
  const content = message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (typeof content.text === "string") return content.text;
  if (Array.isArray(content.parts)) return content.parts.map(renderPart).filter(Boolean).join("\n");
  if (content.content !== undefined) return renderPart(content.content);
  if (content.result !== undefined) return renderPart(content.result);
  return renderPart(content);
}
