"""Process-safe command construction for the ContinuityBridge desktop app."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import subprocess
from typing import Iterable, Sequence


SUPPORTED_PROVIDERS = ("chatgpt", "claude")


class BridgeClientError(RuntimeError):
    """Raised when the Node bridge command cannot be completed."""


@dataclass(frozen=True)
class ImportOptions:
    to_lore: bool = True
    output_path: str | None = None
    redact: bool = True
    project: str | None = None
    lore_command: str = "lore"
    conversation_ids: tuple[str, ...] = ()
    quiet: bool = False


class BridgeClient:
    """Invoke the Node CLI without shell interpolation."""

    def __init__(
        self,
        node_command: str = "node",
        cli_path: str | Path | None = None,
    ) -> None:
        self.node_command = node_command
        self.cli_path = Path(cli_path) if cli_path else self.default_cli_path()

    @staticmethod
    def default_cli_path() -> Path:
        installed = Path(__file__).resolve()
        repository_candidate = installed.parents[2] / "bin" / "continuity-bridge.js"
        if repository_candidate.exists():
            return repository_candidate
        return Path("continuity-bridge")

    @staticmethod
    def normalize_provider(provider: str) -> str:
        normalized = provider.strip().lower().replace(" ", "")
        aliases = {"chatgpt": "chatgpt", "gpt": "chatgpt", "claude": "claude"}
        if normalized not in aliases:
            raise ValueError(f"unsupported provider: {provider}")
        return aliases[normalized]

    def _prefix(self) -> list[str]:
        if self.cli_path.suffix.lower() == ".js":
            return [self.node_command, str(self.cli_path)]
        return [str(self.cli_path)]

    def build_inspect_command(
        self,
        provider: str,
        source_path: str | Path,
        *,
        redact: bool = True,
        conversation_ids: Iterable[str] = (),
        limit: int | None = None,
    ) -> list[str]:
        provider_name = self.normalize_provider(provider)
        command = [*self._prefix(), f"inspect-{provider_name}", str(source_path), "--json"]
        if not redact:
            command.append("--no-redact")
        for conversation_id in conversation_ids:
            command.extend(["--conversation-id", str(conversation_id)])
        if limit is not None:
            if limit < 1:
                raise ValueError("limit must be positive")
            command.extend(["--limit", str(limit)])
        return command

    def build_import_command(
        self,
        provider: str,
        source_path: str | Path,
        options: ImportOptions,
    ) -> list[str]:
        provider_name = self.normalize_provider(provider)
        if not options.to_lore and not options.output_path:
            raise ValueError("choose Lore, JSONL output, or both")

        command = [*self._prefix(), f"import-{provider_name}", str(source_path)]
        if options.to_lore:
            command.extend(["--to-lore", "--lore-command", options.lore_command])
        if options.output_path:
            command.extend(["--output", options.output_path])
        if not options.redact:
            command.append("--no-redact")
        if options.project:
            command.extend(["--project", options.project])
        for conversation_id in options.conversation_ids:
            command.extend(["--conversation-id", conversation_id])
        if options.quiet:
            command.append("--quiet")
        return command

    @staticmethod
    def run(command: Sequence[str]) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                list(command),
                text=True,
                capture_output=True,
                check=False,
                shell=False,
            )
        except OSError as error:
            raise BridgeClientError(str(error)) from error

    def inspect(self, provider: str, source_path: str | Path, *, redact: bool = True) -> dict:
        command = self.build_inspect_command(provider, source_path, redact=redact)
        result = self.run(command)
        if result.returncode != 0:
            raise BridgeClientError(result.stderr.strip() or "inspection failed")
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise BridgeClientError("bridge returned invalid inspection JSON") from error
        if not isinstance(payload, dict) or not isinstance(payload.get("conversations"), list):
            raise BridgeClientError("bridge returned an incomplete inspection result")
        return payload

    def import_conversations(
        self,
        provider: str,
        source_path: str | Path,
        options: ImportOptions,
    ) -> subprocess.CompletedProcess[str]:
        command = self.build_import_command(provider, source_path, options)
        result = self.run(command)
        if result.returncode != 0:
            raise BridgeClientError(result.stderr.strip() or "import failed")
        return result
