"""User-triggered setup helpers for the local Lore runtime."""

from __future__ import annotations

from dataclasses import dataclass
import subprocess
from typing import Sequence

from .client import BridgeClientError


@dataclass(frozen=True)
class LoreSetupResult:
    command: str
    output: str


def initialize_lore(command: str) -> LoreSetupResult:
    executable = command.strip()
    if not executable:
        raise ValueError("Lore command cannot be empty.")
    try:
        result = subprocess.run(
            [executable, "setup"],
            text=True,
            capture_output=True,
            check=False,
            shell=False,
        )
    except OSError as error:
        raise BridgeClientError(str(error)) from error
    if result.returncode != 0:
        raise BridgeClientError(result.stderr.strip() or result.stdout.strip() or "Lore setup failed")
    output = "\n".join(part for part in (result.stdout.strip(), result.stderr.strip()) if part)
    return LoreSetupResult(command=executable, output=output or "Lore setup completed.")
