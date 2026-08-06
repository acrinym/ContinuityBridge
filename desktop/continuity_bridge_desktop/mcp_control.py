"""Local Lore and MCP client setup helpers for ContinuityBridge Desktop."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from typing import Callable, Mapping, Sequence


class MCPControlError(RuntimeError):
    """Raised when local continuity setup or verification cannot complete."""


@dataclass(frozen=True)
class LoreStatus:
    command: str
    executable: str | None
    installed: bool
    database_path: str
    database_exists: bool
    cli_ready: bool
    mcp_ready: bool
    session_count: int | None
    detail: str


@dataclass(frozen=True)
class ClientStatus:
    client: str
    command: str
    executable: str | None
    installed: bool
    configured: bool
    detail: str


@dataclass(frozen=True)
class ContinuityProof:
    query: str
    hit_count: int
    message_id: str | None
    session_id: str | None
    source: str | None
    preview: str
    context: dict | None


RunFunction = Callable[..., subprocess.CompletedProcess[str]]
PopenFunction = Callable[..., subprocess.Popen[str]]
WhichFunction = Callable[[str], str | None]


class MCPControlClient:
    """Inspect, configure, and prove the local Lore MCP path without a shell."""

    CLIENT_COMMANDS = {
        "codex": "codex",
        "claude": "claude",
        "cursor": "cursor-agent",
    }

    def __init__(
        self,
        *,
        lore_command: str = "lore",
        home: str | Path | None = None,
        environ: Mapping[str, str] | None = None,
        run_function: RunFunction | None = None,
        popen_function: PopenFunction | None = None,
        which_function: WhichFunction | None = None,
    ) -> None:
        self.lore_command = lore_command.strip() or "lore"
        self.home = Path(home).expanduser() if home else Path.home()
        self.environ = dict(os.environ if environ is None else environ)
        self._run_function = run_function or subprocess.run
        self._popen_function = popen_function or subprocess.Popen
        self._which_function = which_function or shutil.which

    @staticmethod
    def _command_name(command: str) -> str:
        return command.strip() or "lore"

    def resolve_command(self, command: str) -> str | None:
        """Resolve either an explicit executable path or a PATH command."""
        candidate = self._command_name(command)
        path = Path(candidate).expanduser()
        if path.is_absolute() or path.parent != Path("."):
            return str(path) if path.is_file() else None
        return self._which_function(candidate)

    def _run(
        self,
        command: Sequence[str],
        *,
        timeout: float = 20.0,
        check: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        try:
            result = self._run_function(
                list(command),
                text=True,
                capture_output=True,
                shell=False,
                timeout=timeout,
                env=self.environ,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise MCPControlError(str(error)) from error
        if check and result.returncode != 0:
            message = result.stderr.strip() or result.stdout.strip() or "command failed"
            raise MCPControlError(message)
        return result

    def database_path(self) -> Path:
        configured = self.environ.get("LORE_DB", "").strip()
        return Path(configured).expanduser() if configured else self.home / ".lore" / "lore.db"

    @staticmethod
    def _extract_session_count(payload: object) -> int | None:
        if isinstance(payload, dict):
            count = payload.get("count")
            if isinstance(count, int):
                return count
            sessions = payload.get("sessions")
            if isinstance(sessions, list):
                return len(sessions)
        if isinstance(payload, list):
            return len(payload)
        return None

    def _probe_lore_cli(self) -> tuple[bool, int | None, str]:
        result = self._run(
            [self.lore_command, "sessions", "--json", "--limit", "1"],
            timeout=20.0,
        )
        if result.returncode != 0:
            return False, None, result.stderr.strip() or result.stdout.strip() or "Lore CLI failed"
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError:
            return False, None, "Lore returned invalid JSON from sessions"
        return True, self._extract_session_count(payload), "Lore sessions query succeeded"

    def _probe_lore_server(self, *, startup_seconds: float = 0.8) -> tuple[bool, str]:
        """Start Lore's stdio MCP server briefly and confirm it remains alive."""
        try:
            process = self._popen_function(
                [self.lore_command, "serve"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                shell=False,
                env=self.environ,
            )
        except OSError as error:
            return False, str(error)

        time.sleep(startup_seconds)
        return_code = process.poll()
        if return_code is not None:
            _stdout, stderr = process.communicate(timeout=2)
            return False, stderr.strip() or f"lore serve exited with code {return_code}"

        process.terminate()
        try:
            process.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate(timeout=3)
        return True, "Lore MCP stdio server started successfully"

    def check_lore(self) -> LoreStatus:
        executable = self.resolve_command(self.lore_command)
        database = self.database_path()
        if executable is None:
            return LoreStatus(
                command=self.lore_command,
                executable=None,
                installed=False,
                database_path=str(database),
                database_exists=database.exists(),
                cli_ready=False,
                mcp_ready=False,
                session_count=None,
                detail="Lore executable was not found",
            )

        cli_ready, session_count, cli_detail = self._probe_lore_cli()
        mcp_ready = False
        mcp_detail = "MCP startup was not tested because Lore CLI health failed"
        if cli_ready:
            mcp_ready, mcp_detail = self._probe_lore_server()
        return LoreStatus(
            command=self.lore_command,
            executable=executable,
            installed=True,
            database_path=str(database),
            database_exists=database.exists(),
            cli_ready=cli_ready,
            mcp_ready=mcp_ready,
            session_count=session_count,
            detail=f"{cli_detail}; {mcp_detail}",
        )

    @classmethod
    def normalize_client(cls, client: str) -> str:
        normalized = client.strip().lower().replace(" ", "-")
        aliases = {
            "codex": "codex",
            "openai-codex": "codex",
            "claude": "claude",
            "claude-code": "claude",
            "cursor": "cursor",
            "cursor-agent": "cursor",
        }
        if normalized not in aliases:
            raise ValueError(f"unsupported MCP client: {client}")
        return aliases[normalized]

    @staticmethod
    def _contains_lore_configuration(output: str) -> bool:
        lowered = output.lower()
        return "lore" in lowered and ("serve" in lowered or "connected" in lowered or "enabled" in lowered)

    def check_client(self, client: str) -> ClientStatus:
        normalized = self.normalize_client(client)
        command = self.CLIENT_COMMANDS[normalized]
        executable = self.resolve_command(command)
        if executable is None:
            return ClientStatus(
                client=normalized,
                command=command,
                executable=None,
                installed=False,
                configured=False,
                detail=f"{command} was not found",
            )

        if normalized == "codex":
            inspect_command = [command, "mcp", "list", "--json"]
        elif normalized == "claude":
            inspect_command = [command, "mcp", "list"]
        else:
            inspect_command = [command, "mcp", "list"]

        result = self._run(inspect_command, timeout=20.0)
        output = "\n".join(part for part in (result.stdout.strip(), result.stderr.strip()) if part)
        configured = result.returncode == 0 and self._contains_lore_configuration(output)
        detail = output or ("Client MCP list succeeded" if result.returncode == 0 else "Client MCP list failed")
        return ClientStatus(
            client=normalized,
            command=command,
            executable=executable,
            installed=True,
            configured=configured,
            detail=detail,
        )

    def check_clients(self) -> list[ClientStatus]:
        return [self.check_client(client) for client in ("codex", "claude", "cursor")]

    def config_snippet(self, client: str) -> str:
        normalized = self.normalize_client(client)
        if normalized == "codex":
            return (
                "[mcp_servers.lore]\n"
                f"command = {json.dumps(self.lore_command)}\n"
                "args = [\"serve\"]\n"
                "enabled = true\n"
                "required = false\n"
            )
        payload = {
            "mcpServers": {
                "lore": {
                    "command": self.lore_command,
                    "args": ["serve"],
                    "env": {},
                }
            }
        }
        return json.dumps(payload, indent=2) + "\n"

    def config_location(self, client: str) -> Path:
        normalized = self.normalize_client(client)
        if normalized == "codex":
            return self.home / ".codex" / "config.toml"
        if normalized == "claude":
            return self.home / ".claude.json"
        return self.home / ".cursor" / "mcp.json"

    def apply_command(self, client: str) -> list[str] | None:
        normalized = self.normalize_client(client)
        if normalized == "codex":
            return ["codex", "mcp", "add", "lore", "--", self.lore_command, "serve"]
        if normalized == "claude":
            return [
                "claude",
                "mcp",
                "add",
                "lore",
                "--scope",
                "user",
                "--",
                self.lore_command,
                "serve",
            ]
        return None

    @staticmethod
    def _atomic_json_write(path: Path, payload: dict) -> Path | None:
        path.parent.mkdir(parents=True, exist_ok=True)
        backup: Path | None = None
        if path.exists():
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            backup = path.with_name(f"{path.name}.backup-{stamp}")
            shutil.copy2(path, backup)
        temporary = path.with_name(f".{path.name}.tmp")
        temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)
        return backup

    def _apply_cursor_config(self) -> str:
        path = self.config_location("cursor")
        payload: dict = {}
        if path.exists():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise MCPControlError(f"Cannot safely read {path}: {error}") from error
            if not isinstance(loaded, dict):
                raise MCPControlError(f"Cannot safely update {path}: root must be a JSON object")
            payload = loaded
        servers = payload.setdefault("mcpServers", {})
        if not isinstance(servers, dict):
            raise MCPControlError(f"Cannot safely update {path}: mcpServers must be an object")
        servers["lore"] = {"command": self.lore_command, "args": ["serve"], "env": {}}
        backup = self._atomic_json_write(path, payload)
        suffix = f" Backup: {backup}" if backup else ""
        return f"Updated {path}.{suffix}"

    def apply_client(self, client: str) -> str:
        normalized = self.normalize_client(client)
        if self.resolve_command(self.lore_command) is None:
            raise MCPControlError("Lore must be installed before configuring an MCP client")
        if normalized == "cursor":
            return self._apply_cursor_config()

        command = self.apply_command(normalized)
        if command is None:
            raise MCPControlError(f"No safe apply strategy exists for {normalized}")
        client_command = self.CLIENT_COMMANDS[normalized]
        if self.resolve_command(client_command) is None:
            raise MCPControlError(f"{client_command} was not found")
        result = self._run(command, timeout=30.0, check=True)
        output = result.stdout.strip() or result.stderr.strip()
        return output or f"Configured Lore for {normalized}"

    @staticmethod
    def _extract_hits(payload: object) -> list[dict]:
        if isinstance(payload, dict):
            hits = payload.get("hits")
            if isinstance(hits, list):
                return [hit for hit in hits if isinstance(hit, dict)]
        if isinstance(payload, list):
            return [hit for hit in payload if isinstance(hit, dict)]
        return []

    def prove_continuity(self, query: str, *, limit: int = 5) -> ContinuityProof:
        cleaned = query.strip()
        if not cleaned:
            raise ValueError("enter a phrase to search for")
        if limit < 1:
            raise ValueError("limit must be positive")
        if self.resolve_command(self.lore_command) is None:
            raise MCPControlError("Lore executable was not found")

        search_result = self._run(
            [
                self.lore_command,
                "search",
                cleaned,
                "--relevant",
                "--json",
                "--limit",
                str(limit),
            ],
            timeout=30.0,
            check=True,
        )
        try:
            search_payload = json.loads(search_result.stdout)
        except json.JSONDecodeError as error:
            raise MCPControlError("Lore returned invalid search JSON") from error
        hits = self._extract_hits(search_payload)
        if not hits:
            return ContinuityProof(
                query=cleaned,
                hit_count=0,
                message_id=None,
                session_id=None,
                source=None,
                preview="No matching Lore record was found",
                context=None,
            )

        first = hits[0]
        message_id = first.get("messageId") or first.get("message_id")
        session_id = first.get("sessionId") or first.get("session_id")
        preview = str(first.get("text") or first.get("preview") or "")
        source = first.get("source")
        context_payload: dict | None = None
        if message_id:
            context_result = self._run(
                [self.lore_command, "context", str(message_id), "--json"],
                timeout=30.0,
                check=True,
            )
            try:
                parsed_context = json.loads(context_result.stdout)
            except json.JSONDecodeError as error:
                raise MCPControlError("Lore returned invalid context JSON") from error
            if isinstance(parsed_context, dict):
                context_payload = parsed_context

        return ContinuityProof(
            query=cleaned,
            hit_count=len(hits),
            message_id=str(message_id) if message_id else None,
            session_id=str(session_id) if session_id else None,
            source=str(source) if source else None,
            preview=preview,
            context=context_payload,
        )
