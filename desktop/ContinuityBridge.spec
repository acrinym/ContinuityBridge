# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller recipe for the self-contained ContinuityBridge workstation."""

from pathlib import Path
import os
import sys


ROOT = Path(SPECPATH).parent.parent
NODE_BINARY = os.environ.get("CONTINUITYBRIDGE_NODE_BINARY", "").strip()
if not NODE_BINARY:
    raise RuntimeError("CONTINUITYBRIDGE_NODE_BINARY must point to the Node.js executable")
node_path = Path(NODE_BINARY)
if not node_path.is_file():
    raise RuntimeError(f"Node.js executable does not exist: {node_path}")


a = Analysis(
    [str(ROOT / "desktop" / "continuity_bridge_workstation.py")],
    pathex=[str(ROOT / "desktop")],
    binaries=[(str(node_path), "runtime")],
    datas=[
        (str(ROOT / "bin"), "bridge/bin"),
        (str(ROOT / "src"), "bridge/src"),
        (str(ROOT / "package.json"), "bridge"),
        (str(ROOT / "LICENSE"), "."),
        (str(ROOT / "NOTICE"), "."),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ContinuityBridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="ContinuityBridge",
)

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="ContinuityBridge.app",
        icon=None,
        bundle_identifier="com.acrinym.continuitybridge",
        info_plist={
            "CFBundleName": "ContinuityBridge",
            "CFBundleDisplayName": "ContinuityBridge",
            "CFBundleShortVersionString": "0.7.0",
            "NSHighResolutionCapable": True,
        },
    )
