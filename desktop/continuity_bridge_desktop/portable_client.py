"""Process-safe client for ContinuityBridge encrypted portable bundles."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
from typing import Sequence

from .client import BridgeClient, BridgeClientError
from .runtime import default_node_command


class PortableClient:
    def __init__(self, node_command: str | None = None, cli_path: str | Path | None = None) -> None:
        self.node_command = node_command or default_node_command()
        self.cli_path = Path(cli_path) if cli_path else BridgeClient.default_cli_path()

    def _base_prefix(self) -> list[str]:
        if self.cli_path.suffix.lower() == ".js":
            return [self.node_command, str(self.cli_path)]
        return [str(self.cli_path)]

    def _prefix(self) -> list[str]:
        return [*self._base_prefix(), "portable"]

    def encrypt_command(
        self,
        input_path: str | Path,
        output_path: str | Path,
        passphrase: str,
        overwrite: bool = False,
    ) -> tuple[list[str], str]:
        """Returns (command, stdin_input) tuple.

        Passphrase is always passed via stdin, not argv.
        """
        input_str = str(input_path)
        output_str = str(output_path)
        if not input_str.strip():
            raise ValueError("Input path is required.")
        if not output_str.strip():
            raise ValueError("Output path is required.")
        if not passphrase.strip():
            raise ValueError("Passphrase is required.")

        command = [*self._prefix(), "encrypt", input_str, "--output", output_str, "--passphrase-stdin"]
        if overwrite:
            command.append("--overwrite")

        # Passphrase + confirmation (two lines) for encrypt
        stdin_input = f"{passphrase}\n{passphrase}\n"
        return command, stdin_input

    def inspect_command(
        self,
        encrypted_path: str | Path,
        passphrase: str,
        json_output: bool = False,
    ) -> tuple[list[str], str]:
        """Returns (command, stdin_input) tuple."""
        path_str = str(encrypted_path)
        if not path_str.strip():
            raise ValueError("Encrypted file path is required.")
        if not passphrase.strip():
            raise ValueError("Passphrase is required.")

        command = [*self._prefix(), "inspect", path_str, "--passphrase-stdin"]
        if json_output:
            command.append("--json")

        # Single passphrase line for inspect
        stdin_input = f"{passphrase}\n"
        return command, stdin_input

    def restore_command(
        self,
        encrypted_path: str | Path,
        output_path: str | Path,
        passphrase: str,
        overwrite: bool = False,
    ) -> tuple[list[str], str]:
        """Returns (command, stdin_input) tuple."""
        path_str = str(encrypted_path)
        output_str = str(output_path)
        if not path_str.strip():
            raise ValueError("Encrypted file path is required.")
        if not output_str.strip():
            raise ValueError("Output directory is required.")
        if not passphrase.strip():
            raise ValueError("Passphrase is required.")

        command = [*self._prefix(), "restore", path_str, "--output", output_str, "--passphrase-stdin"]
        if overwrite:
            command.append("--overwrite")

        # Single passphrase line for restore
        stdin_input = f"{passphrase}\n"
        return command, stdin_input

    @staticmethod
    def run(command: Sequence[str], stdin_input: str | None = None) -> subprocess.CompletedProcess[str]:
        """Run command with optional stdin input for passphrase."""
        try:
            result = subprocess.run(
                list(command),
                input=stdin_input,
                text=True,
                capture_output=True,
                check=False,
                shell=False,
            )
        except OSError as error:
            raise BridgeClientError(str(error)) from error
        if result.returncode != 0:
            raise BridgeClientError(result.stderr.strip() or "portable operation failed")
        return result

    def encrypt(
        self,
        input_path: str | Path,
        output_path: str | Path,
        passphrase: str,
        overwrite: bool = False,
    ) -> dict:
        command, stdin_input = self.encrypt_command(input_path, output_path, passphrase, overwrite)
        result = self.run(command, stdin_input)
        return {"stdout": result.stdout, "stderr": result.stderr}

    def inspect(
        self,
        encrypted_path: str | Path,
        passphrase: str,
        json_output: bool = False,
    ) -> dict:
        command, stdin_input = self.inspect_command(encrypted_path, passphrase, json_output)
        result = self.run(command, stdin_input)
        if json_output:
            try:
                parsed = json.loads(result.stdout)
            except json.JSONDecodeError as error:
                raise BridgeClientError("inspect returned invalid JSON") from error
            return parsed
        return {"stdout": result.stdout, "stderr": result.stderr}

    def restore(
        self,
        encrypted_path: str | Path,
        output_path: str | Path,
        passphrase: str,
        overwrite: bool = False,
    ) -> dict:
        command, stdin_input = self.restore_command(encrypted_path, output_path, passphrase, overwrite)
        result = self.run(command, stdin_input)
        return {"stdout": result.stdout, "stderr": result.stderr}
