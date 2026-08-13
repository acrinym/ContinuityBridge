# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import subprocess
import sys


# PyInstaller exposes SPECPATH as the directory containing this spec file.
ROOT = Path(SPECPATH).parent


def resolve_node_executable() -> str:
    """Ask the Node runtime on PATH for its exact platform executable path."""
    try:
        result = subprocess.run(
            ["node", "-p", "process.execPath"],
            text=True,
            capture_output=True,
            shell=False,
            check=False,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f"Node.js could not be resolved for the desktop release bundle: {error}") from error
    node_path = Path(result.stdout.strip()) if result.returncode == 0 else Path()
    if result.returncode != 0 or not node_path.is_file():
        detail = result.stderr.strip() or result.stdout.strip() or "node -p process.execPath failed"
        raise SystemExit(f"Node.js must be available while building the desktop release bundle: {detail}")
    return str(node_path)


NODE = resolve_node_executable()

bridge_datas = [
    (str(ROOT / "bin"), "bridge/bin"),
    (str(ROOT / "src"), "bridge/src"),
    (str(ROOT / "package.json"), "bridge"),
    (str(ROOT / "browser-extension"), "browser-extension"),
    (str(ROOT / "LICENSE"), "."),
    (str(ROOT / "NOTICE"), "."),
]
node_binaries = [(NODE, "runtime")]

analysis = Analysis(
    [str(ROOT / "desktop" / "continuity_bridge_workstation.py")],
    pathex=[str(ROOT / "desktop")],
    binaries=node_binaries,
    datas=bridge_datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="ContinuityBridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

collection = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="ContinuityBridge",
)

if sys.platform == "darwin":
    app = BUNDLE(
        collection,
        name="ContinuityBridge.app",
        icon=None,
        bundle_identifier="com.acrinym.continuitybridge",
        info_plist={
            "CFBundleName": "ContinuityBridge",
            "CFBundleDisplayName": "ContinuityBridge",
            "CFBundleShortVersionString": "0.9.0",
            "NSHighResolutionCapable": True,
        },
    )
