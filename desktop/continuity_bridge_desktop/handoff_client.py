"""Process-safe client for ContinuityBridge handoff generation."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess
from typing import Sequence

from .client import BridgeClient, BridgeClientError


@dataclass(frozen=True)
class HandoffOptions:
    task: str
    query: str | None = None
    message_ids: tuple[str, ...] = ()
    repository_path: str | None = None
    no_repository: bool = False
    include_local_path: bool = False
    lore_command: str = "lore"
    limit: int = 5
    context_messages: int = 11
    output_path: str | None = None
    output_format: str = "markdown"


class HandoffClient:
    def __init__(self, node_command: str = "node", cli_path: str | Path | None = None) -> None:
        self.node_command = node_command
        self.cli_path = Path(cli_path) if cli_path else BridgeClient.default_cli_path()

    def _prefix(self) -> list[str]:
        if self.cli_path.suffix.lower() == ".js":
            return [self.node_command, str(self.cli_path), "handoff"]
        return [str(self.cli_path), "handoff"]

    def build_command(self, options: HandoffOptions) -> list[str]:
        task = options.task.strip()
        query = (options.query or "").strip()
        message_ids = tuple(item.strip() for item in options.message_ids if item.strip())
        if not task:
            raise ValueError("Task is required.")
        if not query and not message_ids:
            raise ValueError("Enter a Lore search query or at least one message ID.")
        if options.limit < 1 or options.context_messages < 1:
            raise ValueError("Limit and context-message count must be positive.")
        if options.no_repository and options.repository_path:
            raise ValueError("Choose a repository or omit repository coordinates, not both.")
        if options.no_repository and options.include_local_path:
            raise ValueError("A local repository path cannot be included when repository coordinates are omitted.")
        if options.output_format not in {"markdown", "md", "json"}:
            raise ValueError("Output format must be markdown or json.")

        command = [*self._prefix(), "--task", task]
        if query:
            command.extend(["--query", query])
        for message_id in message_ids:
            command.extend(["--message-id", message_id])
        command.extend(["--limit", str(options.limit)])
        command.extend(["--context-messages", str(options.context_messages)])
        command.extend(["--lore-command", options.lore_command or "lore"])
        if options.no_repository:
            command.append("--no-repo")
        elif options.repository_path:
            command.extend(["--repo", options.repository_path])
        if options.include_local_path:
            command.append("--include-local-path")
        if options.output_path:
            command.extend(["--output", options.output_path])
        command.extend(["--format", options.output_format])
        return command

    @staticmethod
    def run(command: Sequence[str]) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(
                list(command),
                text=True,
                capture_output=True,
                check=False,
                shell=False,
            )
        except OSError as error:
            raise BridgeClientError(str(error)) from error
        if result.returncode != 0:
            raise BridgeClientError(result.stderr.strip() or "handoff generation failed")
        return result

    def generate(self, options: HandoffOptions) -> subprocess.CompletedProcess[str]:
        return self.run(self.build_command(options))
