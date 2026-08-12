"""Search and browse Lore continuity directly from the desktop workstation."""

from __future__ import annotations

from dataclasses import dataclass
import json
import subprocess
from typing import Callable, Sequence


class LoreLibraryError(RuntimeError):
    """Raised when Lore search or context retrieval fails."""


@dataclass(frozen=True)
class LoreHit:
    message_id: str
    session_id: str | None
    source: str | None
    project: str | None
    role: str | None
    text: str


RunFunction = Callable[..., subprocess.CompletedProcess[str]]


class LoreLibraryClient:
    """Small public Lore search/context surface for the Workstation library."""

    def __init__(self, lore_command: str = "lore", run_function: RunFunction | None = None) -> None:
        self.lore_command = lore_command.strip() or "lore"
        self._run_function = run_function or subprocess.run

    def _run(self, command: Sequence[str]) -> subprocess.CompletedProcess[str]:
        try:
            result = self._run_function(
                list(command),
                text=True,
                capture_output=True,
                shell=False,
                check=False,
                timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise LoreLibraryError(str(error)) from error
        if result.returncode != 0:
            raise LoreLibraryError(result.stderr.strip() or result.stdout.strip() or "Lore command failed")
        return result

    @staticmethod
    def _hits(payload: object) -> list[dict]:
        if isinstance(payload, dict) and isinstance(payload.get("hits"), list):
            return [item for item in payload["hits"] if isinstance(item, dict)]
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        return []

    @staticmethod
    def _value(item: dict, *keys: str) -> str | None:
        for key in keys:
            value = item.get(key)
            if value is not None and str(value).strip():
                return str(value)
        return None

    def search(self, query: str, *, limit: int = 25) -> list[LoreHit]:
        cleaned = query.strip()
        if not cleaned:
            raise ValueError("Enter something to search for.")
        if limit < 1 or limit > 200:
            raise ValueError("Search limit must be between 1 and 200.")
        result = self._run(
            [self.lore_command, "search", cleaned, "--relevant", "--json", "--limit", str(limit)]
        )
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise LoreLibraryError("Lore returned invalid search JSON") from error

        hits: list[LoreHit] = []
        for item in self._hits(payload):
            message_id = self._value(item, "messageId", "message_id", "id")
            if not message_id:
                continue
            hits.append(
                LoreHit(
                    message_id=message_id,
                    session_id=self._value(item, "sessionId", "session_id", "session"),
                    source=self._value(item, "source", "provider"),
                    project=self._value(item, "project", "projectName", "project_name"),
                    role=self._value(item, "role"),
                    text=self._value(item, "text", "preview", "content") or "",
                )
            )
        return hits

    def context(self, message_id: str) -> dict:
        cleaned = message_id.strip()
        if not cleaned:
            raise ValueError("Message ID is required.")
        result = self._run([self.lore_command, "context", cleaned, "--json"])
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise LoreLibraryError("Lore returned invalid context JSON") from error
        if not isinstance(payload, dict):
            raise LoreLibraryError("Lore returned an unsupported context payload")
        return payload


def render_context(payload: dict) -> str:
    """Render common Lore context shapes as readable conversation evidence."""
    rows = payload.get("messages")
    if not isinstance(rows, list):
        rows = payload.get("context")
    if not isinstance(rows, list):
        return json.dumps(payload, indent=2, ensure_ascii=False)

    blocks: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        role = str(row.get("role") or row.get("author") or "message")
        message_id = str(row.get("messageId") or row.get("message_id") or row.get("id") or "")
        text = row.get("text")
        if text is None:
            text = row.get("content")
        if isinstance(text, (dict, list)):
            text = json.dumps(text, ensure_ascii=False)
        header = role if not message_id else f"{role} · {message_id}"
        blocks.append(f"[{header}]\n{str(text or '').strip()}")
    return "\n\n".join(blocks) if blocks else json.dumps(payload, indent=2, ensure_ascii=False)
