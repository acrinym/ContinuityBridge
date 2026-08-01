const MAX_SERIALIZED_OBJECT = 40_000;

function attachmentLabel(part) {
  const mime = part?.mime_type ?? part?.content_type ?? part?.media_type;
  const name = part?.name ?? part?.filename ?? part?.file_name ?? part?.title;
  if (name && mime) return `[attachment: ${name} (${mime})]`;
  if (name) return `[attachment: ${name}]`;
  if (mime?.startsWith("image/")) return "[image attachment]";
  if (mime?.startsWith("audio/")) return "[audio attachment]";
  if (mime?.startsWith("video/")) return "[video attachment]";
  if (part?.asset_pointer || part?.file_id || part?.url || part?.download_url) {
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
  if (typeof part.thinking === "string") return `[thinking]\n${part.thinking}`;
  if (typeof part.name === "string" && part.input !== undefined) {
    const input = JSON.stringify(part.input);
    return `[tool: ${part.name}]${input ? `\n${input}` : ""}`;
  }
  if (part.content !== undefined) return renderPart(part.content);
  if (part.result !== undefined) return renderPart(part.result);

  const serialized = JSON.stringify(part);
  if (!serialized) return "";
  return serialized.length <= MAX_SERIALIZED_OBJECT
    ? serialized
    : `${serialized.slice(0, MAX_SERIALIZED_OBJECT)}\n[structured content truncated]`;
}

export function extractClaudeMessageText(message) {
  const sections = [];
  if (typeof message?.text === "string" && message.text.trim()) sections.push(message.text);
  if (message?.content !== undefined) {
    const rendered = renderPart(message.content);
    if (rendered.trim() && !sections.includes(rendered)) sections.push(rendered);
  }

  for (const collection of [message?.attachments, message?.files]) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      const rendered = attachmentLabel(item) ?? renderPart(item);
      if (rendered && !sections.includes(rendered)) sections.push(rendered);
    }
  }

  return sections.join("\n");
}
