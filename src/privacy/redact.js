const REDACTIONS = [
  [/-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)? PRIVATE KEY-----/g, "[REDACTED PRIVATE KEY]"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED OPENAI KEY]"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, "[REDACTED GITHUB TOKEN]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED GITHUB TOKEN]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED AWS ACCESS KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{20,}=*/gi, "Bearer [REDACTED TOKEN]"],
  [/(\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']?)[^\s"']{12,}/gi, "$1[REDACTED]"],
];

export function redactCredentials(text) {
  let output = String(text);
  for (const [pattern, replacement] of REDACTIONS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}
