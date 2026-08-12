# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import shutil
import sys


ROOT = Path(SPECPATH).parent.parent
NODE = shutil.which("node")
if not NODE:
    raise SystemExit("Node.js must be available while building the desktop release bundle")

bridge_datas = [
    (str(ROOT / "bin"), "bridge/bin"),
    (str(ROOT / "src"), "bridge/src"),
    (str(ROOT / "package.json"), "bridge"),
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
            "NSHighResolutionCapable": True,
        },
    )
