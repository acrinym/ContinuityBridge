"""Process-safe client for ContinuityBridge handoff and attachment generation."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
import subprocess
from typing import Sequence

from .client import BridgeClient, BridgeClientError
from .runtime import default_node_command


@dataclass(frozen=True)
class HandoffOptions:
    task: str
    query: str | None = None
    message_ids: tuple[str, ...] = ()
    repository_path: str | None = None
    no_repository: bool = False
    include_local_path: bool = False
    issue_refs: tuple[str, ...] = ()
    pull_request_refs: tuple[str, ...] = ()
    lore_command: str = "lore"
    limit: int = 5
    context_messages: int = 11
    output_path: str | None = None
    output_format: str = "markdown"
    attachment_provider: str | None = None
    attachment_export: str | None = None
    attachment_ids: tuple[str, ...] = ()
    all_attachments: bool = False
    attachment_bundle: str | None = None
    overwrite_attachments: bool = False


class HandoffClient:
    def __init__(self, node_command: str | None = None, cli_path: str | Path | None = None) -> None:
        self.node_command = node_command or default_node_command()
        self.cli_path = Path(cli_path) if cli_path else BridgeClient.default_cli_path()

    def _base_prefix(self) -> list[str]:
        if self.cli_path.suffix.lower() == ".js":
            return [self.node_command, str(self.cli_path)]
        return [str(self.cli_path)]

    def _prefix(self) -> list[str]:
        return [*self._base_prefix(), "handoff"]

    def build_command(self, options: HandoffOptions) -> list[str]:
        task = options.task.strip()
        query = (options.query or "").strip()
        message_ids = tuple(item.strip() for item in options.message_ids if item.strip())
        issue_refs = tuple(item.strip() for item in options.issue_refs if item.strip())
        pull_request_refs = tuple(item.strip() for item in options.pull_request_refs if item.strip())
        attachment_ids = tuple(item.strip() for item in options.attachment_ids if item.strip())
        attachment_provider = (options.attachment_provider or "").strip().lower()
        attachment_export = (options.attachment_export or "").strip()
        attachment_bundle = (options.attachment_bundle or "").strip()

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
        if options.no_repository and (issue_refs or pull_request_refs):
            raise ValueError("Issue and pull request references require repository coordinates.")
        if options.output_format not in {"markdown", "md", "json"}:
            raise ValueError("Output format must be markdown or json.")

        has_attachments = bool(
            attachment_provider
            or attachment_export
            or attachment_ids
            or options.all_attachments
            or attachment_bundle
            or options.overwrite_attachments
        )
        if has_attachments:
            if attachment_provider not in {"chatgpt", "claude"} or not attachment_export:
                raise ValueError("Attachment provider and export path are both required.")
            if options.all_attachments and attachment_ids:
                raise ValueError("Choose selected attachment IDs or all attachments, not both.")
            if not options.all_attachments and not attachment_ids:
                raise ValueError("Select at least one attachment before building the handoff.")
            if options.overwrite_attachments and not attachment_bundle:
                raise ValueError("Overwrite requires an attachment bundle directory.")

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
        for issue_ref in issue_refs:
            command.extend(["--issue", issue_ref])
        for pull_request_ref in pull_request_refs:
            command.extend(["--pull-request", pull_request_ref])

        if has_attachments:
            command.extend(["--attachment-provider", attachment_provider])
            command.extend(["--attachment-export", attachment_export])
            if options.all_attachments:
                command.append("--all-attachments")
            else:
                for attachment_id in attachment_ids:
                    command.extend(["--attachment-id", attachment_id])
            if attachment_bundle:
                command.extend(["--attachment-bundle", attachment_bundle])
            if options.overwrite_attachments:
                command.append("--overwrite-attachments")

        if options.output_path:
            command.extend(["--output", options.output_path])
        command.extend(["--format", options.output_format])
        return command

    def build_attachment_scan_command(self, provider: str, export_path: str) -> list[str]:
        normalized_provider = provider.strip().lower()
        normalized_export = export_path.strip()
        if normalized_provider not in {"chatgpt", "claude"}:
            raise ValueError("Attachment provider must be ChatGPT or Claude.")
        if not normalized_export:
            raise ValueError("Choose an export before scanning attachments.")
        return [*self._base_prefix(), "attachments", normalized_provider, normalized_export, "--json"]

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

    def scan_attachments(self, provider: str, export_path: str) -> dict:
        result = self.run(self.build_attachment_scan_command(provider, export_path))
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise BridgeClientError("attachment inspection returned invalid JSON") from error
        if not isinstance(parsed, dict) or not isinstance(parsed.get("attachments"), list):
            raise BridgeClientError("attachment inspection returned an unsupported response")
        return parsed

    @staticmethod
    def output_path(options: HandoffOptions) -> Path | None:
        """Return the concrete handoff file path for a mutating build."""
        if options.output_path:
            return Path(options.output_path).expanduser()
        if options.attachment_bundle:
            extension = "json" if options.output_format == "json" else "md"
            return Path(options.attachment_bundle).expanduser() / f"HANDOFF.{extension}"
        return None

    @classmethod
    def resolved_evidence_ids(cls, options: HandoffOptions) -> tuple[str, ...]:
        """Read exact resolved anchor IDs from the handoff that was actually written."""
        path = cls.output_path(options)
        if path is None:
            return ()
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return ()

        if options.output_format == "json" or path.suffix.lower() == ".json":
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                return ()
            lore = payload.get("lore") if isinstance(payload, dict) else None
            evidence = lore.get("evidence") if isinstance(lore, dict) else None
            if not isinstance(evidence, list):
                return ()
            identifiers: list[str] = []
            for item in evidence:
                anchor = item.get("anchor") if isinstance(item, dict) else None
                message_id = anchor.get("messageId") if isinstance(anchor, dict) else None
                if message_id:
                    cleaned = str(message_id).strip()
                    if cleaned and cleaned not in identifiers:
                        identifiers.append(cleaned)
            return tuple(identifiers)

        identifiers = []
        for message_id in re.findall(r"^- Anchor message: `([^`]+)`\s*$", text, flags=re.MULTILINE):
            cleaned = message_id.strip()
            if cleaned and cleaned not in identifiers:
                identifiers.append(cleaned)
        return tuple(identifiers)

    def generate(self, options: HandoffOptions) -> subprocess.CompletedProcess[str]:
        return self.run(self.build_command(options))
