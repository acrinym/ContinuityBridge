"""Persistent user-owned workstation state for ContinuityBridge Desktop."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any


DEFAULT_STATE_PATH = Path.home() / ".continuity-bridge" / "workstation.json"
MAX_RECENT_SOURCES = 12
MAX_RECENT_HANDOFFS = 12


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class WorkstationState:
    recent_sources: list[dict[str, Any]] = field(default_factory=list)
    recent_handoffs: list[dict[str, Any]] = field(default_factory=list)
    last_import: dict[str, Any] | None = None
    first_run_complete: bool = False

    @classmethod
    def load(cls, path: str | Path | None = None) -> "WorkstationState":
        state_path = Path(path).expanduser() if path else DEFAULT_STATE_PATH
        try:
            payload = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls()
        if not isinstance(payload, dict):
            return cls()
        recent_sources = payload.get("recent_sources", [])
        recent_handoffs = payload.get("recent_handoffs", [])
        last_import = payload.get("last_import")
        return cls(
            recent_sources=[item for item in recent_sources if isinstance(item, dict)][:MAX_RECENT_SOURCES]
            if isinstance(recent_sources, list)
            else [],
            recent_handoffs=[item for item in recent_handoffs if isinstance(item, dict)][:MAX_RECENT_HANDOFFS]
            if isinstance(recent_handoffs, list)
            else [],
            last_import=last_import if isinstance(last_import, dict) else None,
            first_run_complete=bool(payload.get("first_run_complete", False)),
        )

    def save(self, path: str | Path | None = None) -> None:
        state_path = Path(path).expanduser() if path else DEFAULT_STATE_PATH
        state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "recent_sources": self.recent_sources[:MAX_RECENT_SOURCES],
            "recent_handoffs": self.recent_handoffs[:MAX_RECENT_HANDOFFS],
            "last_import": self.last_import,
            "first_run_complete": self.first_run_complete,
        }
        temporary = state_path.with_name(f".{state_path.name}.tmp")
        temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        temporary.replace(state_path)

    def remember_source(self, provider: str, path: str | Path, *, conversation_count: int | None = None) -> None:
        normalized = str(Path(path).expanduser())
        key = (provider.strip().lower(), normalized)
        self.recent_sources = [
            item
            for item in self.recent_sources
            if (str(item.get("provider", "")).lower(), str(item.get("path", ""))) != key
        ]
        self.recent_sources.insert(
            0,
            {
                "provider": provider.strip().lower(),
                "path": normalized,
                "conversation_count": conversation_count,
                "used_at": _utc_now(),
            },
        )
        del self.recent_sources[MAX_RECENT_SOURCES:]

    def remember_import(
        self,
        provider: str,
        path: str | Path,
        *,
        selected_count: int | None = None,
        detail: str = "",
    ) -> None:
        self.last_import = {
            "provider": provider.strip().lower(),
            "path": str(Path(path).expanduser()),
            "selected_count": selected_count,
            "detail": detail,
            "completed_at": _utc_now(),
        }
        self.remember_source(provider, path)

    def remember_handoff(self, path: str | Path, *, task: str, bundle: str | Path | None = None) -> None:
        normalized = str(Path(path).expanduser())
        self.recent_handoffs = [item for item in self.recent_handoffs if str(item.get("path", "")) != normalized]
        self.recent_handoffs.insert(
            0,
            {
                "path": normalized,
                "bundle": str(Path(bundle).expanduser()) if bundle else None,
                "task": task.strip(),
                "created_at": _utc_now(),
            },
        )
        del self.recent_handoffs[MAX_RECENT_HANDOFFS:]
