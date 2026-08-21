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
    ) -> list[str]:
        input_str = str(input_path)
        output_str = str(output_path)
        if not input_str.strip():
            raise ValueError("Input path is required.")
        if not output_str.strip():
            raise ValueError("Output path is required.")
        if not passphrase.strip():
            raise ValueError("Passphrase is required.")
        return [*self._prefix(), "encrypt", input_str, "--output", output_str, "--passphrase", passphrase]

    def inspect_command(self, encrypted_path: str | Path, passphrase: str, json_output: bool = False) -> list[str]:
        path_str = str(encrypted_path)
        if not path_str.strip():
            raise ValueError("Encrypted file path is required.")
        if not passphrase.strip():
            raise ValueError("Passphrase is required.")
        command = [*self._prefix(), "inspect", path_str, "--passphrase", passphrase]
        if json_output:
            command.append("--json")
        return command

    def restore_command(
        self,
        encrypted_path: str | Path,
        output_path: str | Path,
        passphrase: str,
        overwrite: bool = False,
    ) -> list[str]:
        path_str = str(encrypted_path)
        output_str = str(output_path)
        if not path_str.strip():
            raise ValueError("Encrypted file path is required.")
        if not output_str.strip():
            raise ValueError("Output directory is required.")
        if not passphrase.strip():
            raise ValueError("Passphrase is required.")
        command = [*self._prefix(), "restore", path_str, "--output", output_str, "--passphrase", passphrase]
        if overwrite:
            command.append("--overwrite")
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
            raise BridgeClientError(result.stderr.strip() or "portable operation failed")
        return result

    def encrypt(
        self,
        input_path: str | Path,
        output_path: str | Path,
        passphrase: str,
    ) -> dict:
        result = self.run(self.encrypt_command(input_path, output_path, passphrase))
        return {"stdout": result.stdout, "stderr": result.stderr}

    def inspect(self, encrypted_path: str | Path, passphrase: str, json_output: bool = False) -> dict:
        result = self.run(self.inspect_command(encrypted_path, passphrase, json_output))
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
        result = self.run(self.restore_command(encrypted_path, output_path, passphrase, overwrite))
        return {"stdout": result.stdout, "stderr": result.stderr}
