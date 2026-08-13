"""Process-safe client for explicit ContinuityBridge live capture."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import subprocess
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from .client import BridgeClient, BridgeClientError
from .runtime import bundle_root, default_node_command


@dataclass(frozen=True)
class CaptureOptions:
    lore_command: str = "lore"
    project: str | None = None
    source: str | None = None
    manifest_path: str | None = None
    manifest_enabled: bool = True
    reimport: bool = False
    redact: bool = True


class CaptureClient:
    def __init__(self, node_command: str | None = None, cli_path: str | Path | None = None) -> None:
        self.node_command = node_command or default_node_command()
        self.cli_path = Path(cli_path) if cli_path else BridgeClient.default_cli_path()

    def _prefix(self) -> list[str]:
        if self.cli_path.suffix.lower() == ".js":
            return [self.node_command, str(self.cli_path), "capture"]
        return [str(self.cli_path), "capture"]

    @staticmethod
    def _mutation_options(options: CaptureOptions) -> list[str]:
        command = ["--to-lore", "--lore-command", options.lore_command or "lore"]
        if options.project:
            command.extend(["--project", options.project])
        if options.source:
            command.extend(["--source", options.source])
        if options.manifest_path:
            command.extend(["--manifest", options.manifest_path])
        if not options.manifest_enabled:
            command.append("--no-manifest")
        if options.reimport:
            command.append("--reimport")
        if not options.redact:
            command.append("--no-redact")
        return command

    def build_inspect_command(self, path: str | Path) -> list[str]:
        target = str(path).strip()
        if not target:
            raise ValueError("Choose a live-capture JSON file first.")
        return [*self._prefix(), "inspect", target, "--json"]

    def build_submit_command(self, path: str | Path, options: CaptureOptions) -> list[str]:
        target = str(path).strip()
        if not target:
            raise ValueError("Choose a live-capture JSON file first.")
        return [*self._prefix(), "submit", target, *self._mutation_options(options)]

    def build_server_command(self, *, port: int, token: str, options: CaptureOptions) -> list[str]:
        if not 1 <= int(port) <= 65535:
            raise ValueError("Capture receiver port must be between 1 and 65535.")
        if not token.strip():
            raise ValueError("Capture receiver token cannot be empty.")
        return [
            *self._prefix(),
            "serve",
            *self._mutation_options(options),
            "--port",
            str(port),
            "--token",
            token.strip(),
        ]

    @staticmethod
    def run(command: list[str]) -> subprocess.CompletedProcess[str]:
        try:
            result = subprocess.run(command, text=True, capture_output=True, check=False, shell=False)
        except OSError as error:
            raise BridgeClientError(str(error)) from error
        if result.returncode != 0:
            raise BridgeClientError(result.stderr.strip() or "live capture command failed")
        return result

    def inspect_file(self, path: str | Path) -> dict:
        result = self.run(self.build_inspect_command(path))
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise BridgeClientError("live capture inspection returned invalid JSON") from error
        if not isinstance(payload, dict):
            raise BridgeClientError("live capture inspection returned an unsupported response")
        return payload

    def submit_file(self, path: str | Path, options: CaptureOptions) -> dict:
        result = self.run(self.build_submit_command(path, options))
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise BridgeClientError("live capture submission returned invalid JSON") from error
        if not isinstance(payload, dict):
            raise BridgeClientError("live capture submission returned an unsupported response")
        return payload


class CaptureServerProcess:
    def __init__(self, client: CaptureClient | None = None) -> None:
        self.client = client or CaptureClient()
        self.process: subprocess.Popen[str] | None = None
        self.port: int | None = None
        self.token: str | None = None

    @property
    def running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def start(self, *, port: int, token: str, options: CaptureOptions) -> dict:
        if self.running:
            raise BridgeClientError("live capture receiver is already running")
        command = self.client.build_server_command(port=port, token=token, options=options)
        try:
            process = subprocess.Popen(
                command,
                text=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                shell=False,
            )
        except OSError as error:
            raise BridgeClientError(str(error)) from error
        self.process = process
        self.port = port
        self.token = token

        request = Request(
            f"http://127.0.0.1:{port}/status",
            data=b"{}",
            method="POST",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        for _ in range(40):
            if process.poll() is not None:
                detail = process.stderr.read().strip() if process.stderr else "receiver exited"
                self.process = None
                raise BridgeClientError(detail or "live capture receiver exited before becoming ready")
            try:
                with urlopen(request, timeout=0.15) as response:  # noqa: S310 - fixed loopback URL.
                    body = json.loads(response.read().decode("utf-8"))
                if body.get("status") == "ready":
                    return {"host": "127.0.0.1", "port": port, "destination": "lore"}
            except (URLError, TimeoutError, json.JSONDecodeError):
                time.sleep(0.05)
        self.stop()
        raise BridgeClientError("live capture receiver did not become ready")

    def stop(self) -> None:
        process = self.process
        self.process = None
        self.port = None
        self.token = None
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)


def browser_extension_path() -> Path:
    bundled = bundle_root()
    if bundled:
        candidate = bundled / "browser-extension"
        if candidate.exists():
            return candidate
    return Path(__file__).resolve().parents[2] / "browser-extension"
