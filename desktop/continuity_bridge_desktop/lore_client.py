"""User-facing Lore search and context retrieval for the ContinuityBridge workstation."""

from __future__ import annotations

from dataclasses import dataclass
import json
import subprocess
from typing import Callable, Sequence


class LoreLibraryError(RuntimeError):
    pass


@dataclass(frozen=True)
class LoreHit:
    message_id: str
    session_id: str | None
    source: str | None
    title: str
    text: str
    timestamp: str | None


RunFunction = Callable[..., subprocess.CompletedProcess[str]]


class LoreLibraryClient:
    def __init__(self, lore_command: str = "lore", run_function: RunFunction | None = None) -> None:
        self.lore_command = lore_command.strip() or "lore"
        self._run_function = run_function or subprocess.run

    def _run(self, command: Sequence[str], *, timeout: float = 30.0) -> subprocess.CompletedProcess[str]:
        try:
            result = self._run_function(
                list(command),
                text=True,
                capture_output=True,
                check=False,
                shell=False,
                timeout=timeout,
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
    def _first_text(item: dict, *keys: str) -> str:
        for key in keys:
            value = item.get(key)
            if value is not None and str(value).strip():
                return str(value)
        return ""

    def search(self, query: str, *, limit: int = 30) -> list[LoreHit]:
        cleaned = query.strip()
        if not cleaned:
            raise ValueError("Enter something to search for.")
        if limit < 1:
            raise ValueError("Search limit must be positive.")
        result = self._run(
            [self.lore_command, "search", cleaned, "--relevant", "--json", "--limit", str(limit)]
        )
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise LoreLibraryError("Lore returned invalid search JSON") from error

        hits: list[LoreHit] = []
        for item in self._hits(payload):
            message_id = self._first_text(item, "messageId", "message_id", "id")
            if not message_id:
                continue
            session_id = self._first_text(item, "sessionId", "session_id") or None
            source = self._first_text(item, "source", "provider") or None
            title = self._first_text(item, "title", "sessionTitle", "session_title") or "Conversation evidence"
            text = self._first_text(item, "text", "preview", "content")
            timestamp = self._first_text(item, "timestamp", "createdAt", "created_at") or None
            hits.append(
                LoreHit(
                    message_id=message_id,
                    session_id=session_id,
                    source=source,
                    title=title,
                    text=text,
                    timestamp=timestamp,
                )
            )
        return hits

    def context(self, message_id: str, *, messages: int = 11) -> dict:
        cleaned = message_id.strip()
        if not cleaned:
            raise ValueError("A Lore message ID is required.")
        if messages < 1:
            raise ValueError("Context message count must be positive.")
        # Lore's public context contract is message-ID based. Older Lore builds do not
        # expose a context-window flag, so the workstation preserves compatibility and
        # lets Lore choose its bounded default window.
        result = self._run([self.lore_command, "context", cleaned, "--json"])
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise LoreLibraryError("Lore returned invalid context JSON") from error
        if not isinstance(payload, dict):
            raise LoreLibraryError("Lore returned an unsupported context response")
        return payload
