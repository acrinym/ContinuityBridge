"""Guided first-run entrypoint for the unified ContinuityBridge Workstation."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, ttk

from .capture_workstation import CaptureAwareWorkstation
from .lore_runtime import LoreSetupResult, initialize_lore
from .runtime import bundle_root, lore_command_for_setting
from .workstation import APP_TITLE, CLIENT_LABELS, ContinuityWorkstation


class GuidedContinuityWorkstation(CaptureAwareWorkstation):
    """Workstation product boundary with portable-build guarantees."""

    def __init__(self, root: tk.Tk) -> None:
        super().__init__(root)
        self.lore_var.set(lore_command_for_setting(self.settings.get("lore_command")))

    def _build_home(self) -> None:
        super()._build_home()
        local_memory = ttk.LabelFrame(self.home_tab, text="Local memory", padding=10)
        local_memory.pack(fill=tk.X, pady=(8, 0))
        ttk.Label(
            local_memory,
            text=(
                "Initialize the selected Lore runtime from supported local transcript sources, or skip this and use "
                "History/Capture. Initialization is explicit and does not configure AI clients."
            ),
            style="Muted.TLabel",
            wraplength=900,
        ).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(
            local_memory,
            text="Initialize local memory",
            style="Accent.TButton",
            command=self._initialize_local_memory,
        ).pack(side=tk.RIGHT, padx=(10, 0))

    def _make_handoff_options(self, *, preview: bool):
        selected_attachments = self._selected_attachment_ids()
        bundle = self.continue_bundle_var.get().strip()
        if not preview and selected_attachments and not bundle:
            raise ValueError(
                "Choose a portable bundle folder before building with selected attachment artifacts."
            )

        options = super()._make_handoff_options(preview=preview)
        if preview or options.output_path or options.attachment_bundle:
            return options

        if bundle:
            extension = "json" if options.output_format == "json" else "md"
            return replace(options, output_path=str(Path(bundle) / f"HANDOFF.{extension}"))
        return options

    def _initialize_local_memory(self) -> None:
        command = self.lore_var.get().strip()
        if not command:
            messagebox.showerror(APP_TITLE, "Lore runtime is not available.")
            return
        self.status_var.set("Initializing local Lore memory from detected transcript sources…")
        self._run_async("lore_setup", lambda: initialize_lore(command))

    def _event_lore_setup(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, LoreSetupResult):
            self.status_var.set("Lore initialization failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self.status_var.set("Local Lore memory initialized; checking continuity stack…")
        messagebox.showinfo(APP_TITLE, payload.output)
        self._refresh_health()

    def _copy_setup_help(self) -> None:
        if bundle_root() is None:
            super()._copy_setup_help()
            return
        text = (
            "ContinuityBridge packaged setup\n\n"
            "Lore is already bundled with this application; no npm or Node installation is required.\n"
            "Choose ‘Initialize local memory’ on Home or first run to detect/index supported local transcript sources, "
            "or import/capture evidence directly through ContinuityBridge.\n\n"
            "Git is optional and is only needed for repository-aware continuity coordinates.\n"
            "Codex, Claude Code, and Cursor are optional and can be connected from Connections."
        )
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.status_var.set("Packaged setup help copied.")


class FirstRunDialog:
    """Guide a new user from local readiness into their first real continuity journey."""

    def __init__(self, app: ContinuityWorkstation) -> None:
        self.app = app
        self.window = tk.Toplevel(app.root)
        self.window.title("Welcome to ContinuityBridge")
        self.window.geometry("760x600")
        self.window.minsize(700, 550)
        self.window.transient(app.root)
        self.window.grab_set()
        self.runtime_var = tk.StringVar(value="Checking…")
        self.lore_var = tk.StringVar(value="Checking…")
        self.git_var = tk.StringVar(value="Checking…")
        self.clients_var = tk.StringVar(value="Checking…")
        self._build()
        self.app._refresh_health()
        self.window.after(350, self._refresh_labels)

    def _build(self) -> None:
        outer = ttk.Frame(self.window, padding=18)
        outer.pack(fill=tk.BOTH, expand=True)
        ttk.Label(outer, text="Welcome to ContinuityBridge", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            outer,
            text=(
                "This workstation keeps your conversation evidence local, makes it searchable through Lore, "
                "supports explicit live capture, connects supported AI clients, and builds portable continuation packages."
            ),
            wraplength=700,
        ).pack(anchor="w", pady=(6, 16))

        readiness = ttk.LabelFrame(outer, text="1. Check the local continuity stack", padding=12)
        readiness.pack(fill=tk.X)
        for row, (label, variable) in enumerate(
            (
                ("Bridge runtime", self.runtime_var),
                ("Lore", self.lore_var),
                ("Git", self.git_var),
                ("AI clients", self.clients_var),
            )
        ):
            ttk.Label(readiness, text=label, width=18).grid(row=row, column=0, sticky="w", pady=3)
            ttk.Label(readiness, textvariable=variable, wraplength=520).grid(row=row, column=1, sticky="w", pady=3)
        readiness.columnconfigure(1, weight=1)
        ttk.Button(
            readiness,
            text="Initialize local memory",
            style="Accent.TButton",
            command=self.app._initialize_local_memory,
        ).grid(row=4, column=1, sticky="w", pady=(9, 0))

        journey = ttk.LabelFrame(outer, text="2. Your continuity journey", padding=12)
        journey.pack(fill=tk.X, pady=(14, 0))
        ttk.Label(
            journey,
            text=(
                "Import existing ChatGPT/Claude history or explicitly capture a supported live browser conversation → "
                "search the original evidence in Recall → optionally link it to repository context → choose Continue → "
                "add code state or verified local artifacts → build the handoff."
            ),
            wraplength=670,
            justify=tk.LEFT,
        ).pack(anchor="w")

        help_frame = ttk.LabelFrame(outer, text="3. Optional integrations", padding=12)
        help_frame.pack(fill=tk.X, pady=(14, 0))
        ttk.Label(
            help_frame,
            text=(
                "Packaged builds include the local Lore runtime. Git is optional unless you want repository coordinates. "
                "Live capture stays OFF until you start it. Codex, Claude Code, and Cursor are optional."
            ),
            wraplength=670,
        ).pack(anchor="w")
        ttk.Button(help_frame, text="Copy setup information", command=self.app._copy_setup_help).pack(
            anchor="w", pady=(8, 0)
        )

        actions = ttk.Frame(outer)
        actions.pack(fill=tk.X, pady=(18, 0))
        ttk.Button(actions, text="Check again", command=self.app._refresh_health).pack(side=tk.LEFT)
        ttk.Button(actions, text="Open Capture", command=self._capture).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(actions, text="Open Connections", command=self._connections).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(actions, text="Finish for now", command=self._finish).pack(side=tk.RIGHT)
        ttk.Button(
            actions,
            text="Choose first export",
            style="Accent.TButton",
            command=self._choose_export,
        ).pack(side=tk.RIGHT, padx=(0, 8))

    def _refresh_labels(self) -> None:
        if not self.window.winfo_exists():
            return
        runtime = self.app.health_runtime
        runtime_ready = bool(runtime.get("node_available")) and bool(runtime.get("bridge_available"))
        bundled = bool(runtime.get("bundled_lore"))
        self.runtime_var.set("Ready" if runtime_ready else "Needs ContinuityBridge runtime")

        lore = self.app.health_lore
        if lore and lore.cli_ready and lore.mcp_ready:
            self.lore_var.set("Ready" + (" · bundled" if bundled else ""))
        elif lore and lore.installed:
            self.lore_var.set("Bundled runtime ready — initialize local memory" if bundled else "Installed, but setup/health needs attention")
        else:
            self.lore_var.set("Bundled runtime missing" if bundled else "Lore not available — use setup information")

        self.git_var.set("Ready" if self.app.home_git_var.get() == "Ready" else self.app.home_git_var.get())
        installed = [CLIENT_LABELS.get(item.client, item.client) for item in self.app.health_clients if item.installed]
        configured = [CLIENT_LABELS.get(item.client, item.client) for item in self.app.health_clients if item.configured]
        self.clients_var.set(
            f"Installed: {', '.join(installed) if installed else 'none'} · "
            f"Lore connected: {', '.join(configured) if configured else 'none'}"
        )
        self.window.after(500, self._refresh_labels)

    def _mark_complete(self) -> None:
        self.app.state.first_run_complete = True
        self.app.state.save()

    def _connections(self) -> None:
        self._mark_complete()
        self.window.destroy()
        self.app._select_tab(self.app.connections_tab)

    def _capture(self) -> None:
        self._mark_complete()
        self.window.destroy()
        self.app._select_tab(self.app.capture_tab)

    def _choose_export(self) -> None:
        self._mark_complete()
        self.window.destroy()
        self.app._select_tab(self.app.history_tab)
        self.app._browse_history_file()
        if self.app.history_source_var.get().strip():
            self.app._analyze_history()

    def _finish(self) -> None:
        self._mark_complete()
        self.window.destroy()


def main() -> None:
    root = tk.Tk()
    app = GuidedContinuityWorkstation(root)
    if not app.state.first_run_complete:
        root.after(500, lambda: FirstRunDialog(app))
    root.mainloop()


if __name__ == "__main__":
    main()
