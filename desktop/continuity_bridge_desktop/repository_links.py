"""Lightweight repository-aware continuity links for the desktop workstation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
from typing import Callable, Iterable, Sequence
from urllib.parse import urlsplit, urlunsplit


DEFAULT_LINKS_PATH = Path.home() / ".continuity-bridge" / "repository-links.json"
SCHEMA = "continuity-bridge/repository-links-v1"
LINK_LIST_FIELDS = ("messageIds", "sessionIds", "handoffs", "issues", "pullRequests")


class RepositoryLinkError(RuntimeError):
    """Raised when repository coordinates cannot be inspected safely."""


RunFunction = Callable[..., subprocess.CompletedProcess[str]]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _unique(values: Iterable[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = str(value).strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def _normalize_persisted_entry(value: object) -> dict | None:
    """Keep valid repository coordinates and normalize every list field to strings."""
    if not isinstance(value, dict):
        return None
    repository = value.get("repository")
    if not isinstance(repository, dict):
        return None
    normalized = dict(value)
    normalized["repository"] = dict(repository)
    for field in LINK_LIST_FIELDS:
        items = value.get(field, [])
        normalized[field] = _unique(item for item in items if isinstance(item, str)) if isinstance(items, list) else []
    return normalized


def _safe_port(parsed) -> int | None:
    try:
        return parsed.port
    except ValueError:
        return None


def sanitize_reference(value: str) -> str:
    """Keep an explicit issue/PR reference while stripping URL secrets."""
    cleaned = str(value).strip()
    if not cleaned:
        return ""
    if cleaned.startswith("#") and cleaned[1:].isdigit():
        return cleaned
    try:
        parsed = urlsplit(cleaned)
    except ValueError:
        return cleaned
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return cleaned
    host = parsed.hostname or ""
    if not host:
        return cleaned
    port_value = _safe_port(parsed)
    port = f":{port_value}" if port_value else ""
    return urlunsplit((parsed.scheme.lower(), host.lower() + port, parsed.path, "", ""))


def normalize_remote(remote: str | None) -> str | None:
    """Return a credential-free stable remote identity."""
    value = str(remote or "").strip()
    if not value:
        return None

    # Common SCP-style Git remotes do not parse as URLs. Ignore the SSH user
    # entirely so git@host:path and another-user@host:path identify the same repo.
    scp_match = re.match(r"^[^@/]+@([^:/]+):(.+)$", value)
    if scp_match:
        host, path = scp_match.groups()
        return f"{host.lower()}/{path.removesuffix('.git').strip('/')}"

    try:
        parsed = urlsplit(value)
    except ValueError:
        return value.removesuffix(".git").rstrip("/")
    if parsed.scheme.lower() in {"http", "https", "ssh", "git"} and parsed.hostname:
        path = parsed.path.removesuffix(".git").strip("/")
        port_value = _safe_port(parsed)
        host = parsed.hostname.lower() + (f":{port_value}" if port_value else "")
        return f"{host}/{path}" if path else host
    return value.removesuffix(".git").rstrip("/")


@dataclass(frozen=True)
class RepositoryContext:
    key: str
    name: str
    remote: str | None
    branch: str | None
    head: str
    dirty: bool
    local_path: str

    def as_dict(self) -> dict:
        return {
            "key": self.key,
            "name": self.name,
            "remote": self.remote,
            "branch": self.branch,
            "head": self.head,
            "dirty": self.dirty,
            "localPath": self.local_path,
        }


class GitRepositoryClient:
    """Inspect local Git coordinates without shell interpolation."""

    def __init__(self, run_function: RunFunction | None = None) -> None:
        self._run_function = run_function or subprocess.run

    def _run(self, args: Sequence[str], cwd: str | Path) -> str:
        try:
            result = self._run_function(
                ["git", *args],
                cwd=str(cwd),
                text=True,
                capture_output=True,
                shell=False,
                check=False,
            )
        except OSError as error:
            raise RepositoryLinkError(str(error)) from error
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip() or "git command failed"
            raise RepositoryLinkError(detail)
        return result.stdout.strip()

    def inspect(self, path: str | Path) -> RepositoryContext:
        root = Path(self._run(["rev-parse", "--show-toplevel"], path)).resolve()
        head = self._run(["rev-parse", "HEAD"], root)
        branch = self._run(["branch", "--show-current"], root) or None
        dirty = bool(self._run(["status", "--porcelain"], root))
        remote: str | None = None
        try:
            remote = normalize_remote(self._run(["remote", "get-url", "origin"], root))
        except RepositoryLinkError:
            remote = None
        local_identity = os.path.normcase(str(root))
        key = f"remote:{remote}" if remote else f"local:{root.name}:{local_identity}"
        return RepositoryContext(
            key=key,
            name=root.name,
            remote=remote,
            branch=branch,
            head=head,
            dirty=dirty,
            local_path=str(root),
        )


class RepositoryLinkStore:
    """Persist lightweight links between Lore evidence, handoffs, and repositories."""

    def __init__(self, repositories: dict[str, dict] | None = None) -> None:
        self.repositories = repositories or {}

    @classmethod
    def load(cls, path: str | Path | None = None) -> "RepositoryLinkStore":
        target = Path(path).expanduser() if path else DEFAULT_LINKS_PATH
        try:
            payload = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return cls()
        if not isinstance(payload, dict) or payload.get("schema") != SCHEMA:
            return cls()
        repositories = payload.get("repositories")
        if not isinstance(repositories, dict):
            return cls()
        normalized: dict[str, dict] = {}
        for key, value in repositories.items():
            entry = _normalize_persisted_entry(value)
            if entry is not None:
                normalized[str(key)] = entry
        return cls(normalized)

    def save(self, path: str | Path | None = None) -> None:
        target = Path(path).expanduser() if path else DEFAULT_LINKS_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.tmp")
        temporary.write_text(
            json.dumps({"schema": SCHEMA, "repositories": self.repositories}, indent=2) + "\n",
            encoding="utf-8",
        )
        try:
            os.replace(temporary, target)
        except OSError:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
            raise

    def _entry(self, context: RepositoryContext) -> dict:
        existing = self.repositories.get(context.key)
        entry = existing if isinstance(existing, dict) else {}
        entry["repository"] = context.as_dict()
        entry.setdefault("messageIds", [])
        entry.setdefault("sessionIds", [])
        entry.setdefault("handoffs", [])
        entry.setdefault("issues", [])
        entry.setdefault("pullRequests", [])
        entry["updatedAt"] = _utc_now()
        self.repositories[context.key] = entry
        return entry

    def link_evidence(
        self,
        context: RepositoryContext,
        *,
        message_id: str,
        session_id: str | None = None,
        issue_refs: Iterable[str] = (),
        pull_request_refs: Iterable[str] = (),
    ) -> None:
        entry = self._entry(context)
        entry["messageIds"] = _unique([*entry.get("messageIds", []), message_id])
        if session_id:
            entry["sessionIds"] = _unique([*entry.get("sessionIds", []), session_id])
        entry["issues"] = _unique([*entry.get("issues", []), *(sanitize_reference(item) for item in issue_refs)])
        entry["pullRequests"] = _unique(
            [*entry.get("pullRequests", []), *(sanitize_reference(item) for item in pull_request_refs)]
        )

    def link_handoff(
        self,
        context: RepositoryContext,
        *,
        path: str | Path,
        message_ids: Iterable[str] = (),
        issue_refs: Iterable[str] = (),
        pull_request_refs: Iterable[str] = (),
    ) -> None:
        entry = self._entry(context)
        handoff_path = str(Path(path).expanduser())
        entry["handoffs"] = _unique([*entry.get("handoffs", []), handoff_path])
        entry["messageIds"] = _unique([*entry.get("messageIds", []), *message_ids])
        entry["issues"] = _unique([*entry.get("issues", []), *(sanitize_reference(item) for item in issue_refs)])
        entry["pullRequests"] = _unique(
            [*entry.get("pullRequests", []), *(sanitize_reference(item) for item in pull_request_refs)]
        )

    def repository_choices(self) -> list[tuple[str, str]]:
        choices: list[tuple[str, str]] = []
        for key, entry in self.repositories.items():
            repository = entry.get("repository") if isinstance(entry, dict) else None
            if not isinstance(repository, dict):
                continue
            label = repository.get("remote") or repository.get("name") or key
            branch = repository.get("branch")
            if branch:
                label = f"{label} [{branch}]"
            choices.append((str(label), key))
        return sorted(choices, key=lambda item: item[0].lower())

    def matches(self, key: str, *, message_id: str, session_id: str | None = None) -> bool:
        entry = self.repositories.get(key)
        if not isinstance(entry, dict):
            return False
        if message_id in entry.get("messageIds", []):
            return True
        return bool(session_id and session_id in entry.get("sessionIds", []))

    def keys_for_evidence(self, *, message_id: str, session_id: str | None = None) -> list[str]:
        return [
            key
            for key in self.repositories
            if self.matches(key, message_id=message_id, session_id=session_id)
        ]

    def related(self, key: str) -> dict:
        entry = self.repositories.get(key)
        if not isinstance(entry, dict):
            return {
                "repository": None,
                "messageIds": [],
                "sessionIds": [],
                "handoffs": [],
                "issues": [],
                "pullRequests": [],
            }
        return {
            "repository": entry.get("repository"),
            "messageIds": list(entry.get("messageIds", [])),
            "sessionIds": list(entry.get("sessionIds", [])),
            "handoffs": list(entry.get("handoffs", [])),
            "issues": list(entry.get("issues", [])),
            "pullRequests": list(entry.get("pullRequests", [])),
        }

    def key_for_context(self, context: RepositoryContext) -> str:
        return context.key
