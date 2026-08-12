"""Unified ContinuityBridge desktop workstation.

This is the product shell for the complete local continuity journey: get ready,
import history, recall source evidence, connect AI clients, and build a portable
continuation handoff without switching between separate utility applications.
"""

from __future__ import annotations

from dataclasses import asdict
import json
from pathlib import Path
import queue
import shutil
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

from .client import BridgeClient, ImportOptions
from .handoff_client import HandoffClient, HandoffOptions
from .lore_client import LoreHit, LoreLibraryClient
from .mcp_control import ClientStatus, LoreStatus, MCPControlClient
from .runtime import runtime_summary
from .state import WorkstationState


APP_TITLE = "ContinuityBridge"
SETTINGS_PATH = Path.home() / ".continuity-bridge" / "desktop.json"
CLIENT_LABELS = {"codex": "Codex", "claude": "Claude Code", "cursor": "Cursor"}


class ContinuityWorkstation:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("1260x820")
        self.root.minsize(1040, 680)
        self.settings = self._load_settings()
        self.state = WorkstationState.load()
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.busy_operations: set[str] = set()

        self.lore_var = tk.StringVar(value=self.settings.get("lore_command", "lore"))
        self.status_var = tk.StringVar(value="Ready.")

        self.history_provider_var = tk.StringVar(value=self.settings.get("provider", "ChatGPT"))
        self.history_source_var = tk.StringVar(value=self.settings.get("source", ""))
        self.history_filter_var = tk.StringVar()
        self.history_redact_var = tk.BooleanVar(value=self.settings.get("redact", True))
        self.history_project_var = tk.StringVar(value=self.settings.get("project", ""))
        self.history_jsonl_var = tk.StringVar(value="")
        self.history_write_jsonl_var = tk.BooleanVar(value=False)
        self.history_conversations: list[dict] = []
        self.history_filtered: list[dict] = []
        self.history_rows: dict[str, str] = {}

        self.recall_query_var = tk.StringVar(value=self.settings.get("recall_query", ""))
        self.recall_hits: list[LoreHit] = []
        self.recall_rows: dict[str, LoreHit] = {}

        self.connection_client_var = tk.StringVar(value=self.settings.get("mcp_client", "Codex"))
        self.connection_rows: dict[str, ClientStatus] = {}

        self.continue_task_var = tk.StringVar(value="")
        self.continue_query_var = tk.StringVar(value="")
        self.continue_repo_var = tk.StringVar(value=self.settings.get("repository", ""))
        self.continue_no_repo_var = tk.BooleanVar(value=False)
        self.continue_attachment_provider_var = tk.StringVar(value="ChatGPT")
        self.continue_attachment_export_var = tk.StringVar(value="")
        self.continue_bundle_var = tk.StringVar(value="")
        self.continue_overwrite_var = tk.BooleanVar(value=False)
        self.continue_output_var = tk.StringVar(value="")
        self.continue_format_var = tk.StringVar(value="markdown")
        self.continue_attachments: list[dict] = []
        self.continue_attachment_rows: dict[str, dict] = {}

        self.health_runtime: dict = {}
        self.health_lore: LoreStatus | None = None
        self.health_clients: list[ClientStatus] = []

        self._build_style()
        self._build_ui()
        self.history_filter_var.trace_add("write", lambda *_: self._apply_history_filter())
        self.connection_client_var.trace_add("write", lambda *_: self._refresh_connection_preview())
        self.lore_var.trace_add("write", lambda *_: self._refresh_connection_preview())
        self.root.after(100, self._poll_events)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(250, self._refresh_health)

    # ------------------------------------------------------------------
    # Window and shared helpers
    # ------------------------------------------------------------------
    def _build_style(self) -> None:
        style = ttk.Style(self.root)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("Title.TLabel", font=("TkDefaultFont", 18, "bold"))
        style.configure("Heading.TLabel", font=("TkDefaultFont", 14, "bold"))
        style.configure("CardHeading.TLabel", font=("TkDefaultFont", 11, "bold"))
        style.configure("Muted.TLabel", foreground="#555555")
        style.configure("Good.TLabel", foreground="#166534")
        style.configure("Warn.TLabel", foreground="#9a3412")
        style.configure("Treeview", rowheight=26)
        style.configure("Accent.TButton", padding=(12, 7))

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=10)
        outer.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(outer)
        header.pack(fill=tk.X, pady=(0, 8))
        ttk.Label(header, text="ContinuityBridge", style="Title.TLabel").pack(side=tk.LEFT)
        ttk.Label(
            header,
            text="Import · Recall · Connect · Continue",
            style="Muted.TLabel",
        ).pack(side=tk.LEFT, padx=(12, 0), pady=(5, 0))
        ttk.Label(header, textvariable=self.status_var, style="Muted.TLabel").pack(side=tk.RIGHT)

        self.notebook = ttk.Notebook(outer)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        self.home_tab = ttk.Frame(self.notebook, padding=12)
        self.history_tab = ttk.Frame(self.notebook, padding=12)
        self.recall_tab = ttk.Frame(self.notebook, padding=12)
        self.connections_tab = ttk.Frame(self.notebook, padding=12)
        self.continue_tab = ttk.Frame(self.notebook, padding=12)
        self.notebook.add(self.home_tab, text="Home")
        self.notebook.add(self.history_tab, text="History")
        self.notebook.add(self.recall_tab, text="Recall")
        self.notebook.add(self.connections_tab, text="Connections")
        self.notebook.add(self.continue_tab, text="Continue")

        self._build_home()
        self._build_history()
        self._build_recall()
        self._build_connections()
        self._build_continue()

    @staticmethod
    def _replace_text(widget: scrolledtext.ScrolledText, text: str) -> None:
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, text)
        widget.configure(state=tk.DISABLED)

    def _run_async(self, kind: str, function) -> None:
        if kind in self.busy_operations:
            return
        self.busy_operations.add(kind)

        def worker() -> None:
            try:
                self.events.put((kind, (True, function())))
            except Exception as error:  # UI boundary: surface a useful local error.
                self.events.put((kind, (False, str(error))))

        threading.Thread(target=worker, daemon=True).start()

    def _poll_events(self) -> None:
        try:
            while True:
                kind, envelope = self.events.get_nowait()
                self.busy_operations.discard(kind)
                ok, payload = envelope if isinstance(envelope, tuple) else (False, envelope)
                handler = getattr(self, f"_event_{kind}", None)
                if handler:
                    handler(bool(ok), payload)
        except queue.Empty:
            pass
        self.root.after(100, self._poll_events)

    def _select_tab(self, tab: ttk.Frame) -> None:
        self.notebook.select(tab)

    def _load_settings(self) -> dict:
        try:
            payload = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _save_settings(self) -> None:
        payload = dict(self.settings)
        payload.update(
            {
                "lore_command": self.lore_var.get().strip() or "lore",
                "provider": self.history_provider_var.get(),
                "source": self.history_source_var.get().strip(),
                "redact": self.history_redact_var.get(),
                "project": self.history_project_var.get().strip(),
                "recall_query": self.recall_query_var.get().strip(),
                "mcp_client": self.connection_client_var.get(),
                "repository": self.continue_repo_var.get().strip(),
            }
        )
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = SETTINGS_PATH.with_name(f".{SETTINGS_PATH.name}.tmp")
        temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        temporary.replace(SETTINGS_PATH)
        self.state.save()

    def _on_close(self) -> None:
        try:
            self._save_settings()
        finally:
            self.root.destroy()

    # ------------------------------------------------------------------
    # Home / onboarding
    # ------------------------------------------------------------------
    def _build_home(self) -> None:
        intro = ttk.Frame(self.home_tab)
        intro.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(intro, text="Your continuity workstation", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(
            intro,
            text=(
                "Bring ChatGPT and Claude history into your local Lore library, find the original evidence, "
                "connect authorized AI clients, and carry exactly what matters into the next task."
            ),
            style="Muted.TLabel",
            wraplength=1080,
        ).pack(anchor="w", pady=(4, 0))

        readiness = ttk.LabelFrame(self.home_tab, text="Ready to use", padding=10)
        readiness.pack(fill=tk.X, pady=(0, 10))
        self.home_runtime_var = tk.StringVar(value="Checking packaged runtime…")
        self.home_lore_var = tk.StringVar(value="Checking Lore…")
        self.home_git_var = tk.StringVar(value="Checking Git…")
        self.home_clients_var = tk.StringVar(value="Checking AI clients…")
        for row, (label, variable) in enumerate(
            (
                ("ContinuityBridge runtime", self.home_runtime_var),
                ("Lore library + MCP", self.home_lore_var),
                ("Git repository support", self.home_git_var),
                ("Connected AI clients", self.home_clients_var),
            )
        ):
            ttk.Label(readiness, text=label, width=28).grid(row=row, column=0, sticky="w", pady=2)
            ttk.Label(readiness, textvariable=variable).grid(row=row, column=1, sticky="w", pady=2)
        ttk.Button(readiness, text="Check again", command=self._refresh_health).grid(
            row=0, column=2, rowspan=2, padx=(16, 0), sticky="n"
        )
        ttk.Button(readiness, text="Copy setup help", command=self._copy_setup_help).grid(
            row=2, column=2, rowspan=2, padx=(16, 0), sticky="n"
        )
        readiness.columnconfigure(1, weight=1)

        shortcuts = ttk.Frame(self.home_tab)
        shortcuts.pack(fill=tk.X, pady=(0, 10))
        for text, tab, description in (
            ("Import history", self.history_tab, "Open or refresh a ChatGPT/Claude export"),
            ("Recall evidence", self.recall_tab, "Search your local Lore history"),
            ("Connect clients", self.connections_tab, "Configure Lore MCP for Codex, Claude Code, Cursor"),
            ("Continue a task", self.continue_tab, "Build a handoff with evidence, repo state, and artifacts"),
        ):
            card = ttk.LabelFrame(shortcuts, text=text, padding=9)
            card.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 7))
            ttk.Label(card, text=description, wraplength=220, style="Muted.TLabel").pack(anchor="w")
            ttk.Button(card, text="Open", command=lambda target=tab: self._select_tab(target)).pack(
                anchor="e", pady=(8, 0)
            )

        recent = ttk.Panedwindow(self.home_tab, orient=tk.HORIZONTAL)
        recent.pack(fill=tk.BOTH, expand=True)
        sources_frame = ttk.LabelFrame(recent, text="Recent history sources", padding=8)
        handoffs_frame = ttk.LabelFrame(recent, text="Recent handoffs", padding=8)
        recent.add(sources_frame, weight=1)
        recent.add(handoffs_frame, weight=1)

        self.recent_sources_tree = ttk.Treeview(
            sources_frame, columns=("provider", "path", "used"), show="headings", height=9
        )
        self.recent_sources_tree.heading("provider", text="Source")
        self.recent_sources_tree.heading("path", text="Export")
        self.recent_sources_tree.heading("used", text="Last used")
        self.recent_sources_tree.column("provider", width=90)
        self.recent_sources_tree.column("path", width=370)
        self.recent_sources_tree.column("used", width=170)
        self.recent_sources_tree.pack(fill=tk.BOTH, expand=True)
        ttk.Button(sources_frame, text="Open selected in History", command=self._open_recent_source).pack(
            anchor="e", pady=(6, 0)
        )

        self.recent_handoffs_tree = ttk.Treeview(
            handoffs_frame, columns=("task", "path", "created"), show="headings", height=9
        )
        self.recent_handoffs_tree.heading("task", text="Task")
        self.recent_handoffs_tree.heading("path", text="Handoff")
        self.recent_handoffs_tree.heading("created", text="Created")
        self.recent_handoffs_tree.column("task", width=210)
        self.recent_handoffs_tree.column("path", width=310)
        self.recent_handoffs_tree.column("created", width=170)
        self.recent_handoffs_tree.pack(fill=tk.BOTH, expand=True)
        ttk.Button(handoffs_frame, text="Copy selected path", command=self._copy_recent_handoff).pack(
            anchor="e", pady=(6, 0)
        )
        self._render_recent()

    def _refresh_health(self) -> None:
        lore_command = self.lore_var.get().strip() or "lore"
        self.status_var.set("Checking local continuity stack…")

        def check() -> dict:
            mcp = MCPControlClient(lore_command=lore_command)
            return {
                "runtime": runtime_summary(),
                "git": shutil.which("git"),
                "lore": mcp.check_lore(),
                "clients": mcp.check_clients(),
            }

        self._run_async("health", check)

    def _event_health(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set("Health check failed.")
            self.home_lore_var.set(str(payload))
            return
        self.health_runtime = dict(payload.get("runtime") or {})
        self.health_lore = payload.get("lore") if isinstance(payload.get("lore"), LoreStatus) else None
        self.health_clients = [item for item in payload.get("clients", []) if isinstance(item, ClientStatus)]

        runtime_ready = bool(self.health_runtime.get("node_available")) and bool(
            self.health_runtime.get("bridge_available")
        )
        packaged = "bundled" if self.health_runtime.get("packaged") else "source/install"
        self.home_runtime_var.set("Ready" + f" ({packaged})" if runtime_ready else "Runtime missing")
        if self.health_lore and self.health_lore.cli_ready and self.health_lore.mcp_ready:
            sessions = self.health_lore.session_count
            suffix = f" · {sessions} session(s) sampled" if sessions is not None else ""
            self.home_lore_var.set("Ready" + suffix)
        elif self.health_lore and self.health_lore.installed:
            self.home_lore_var.set("Lore found, but health/MCP startup needs attention")
        else:
            self.home_lore_var.set("Lore not installed")
        self.home_git_var.set("Ready" if payload.get("git") else "Git not found (repository handoffs unavailable)")
        installed = [CLIENT_LABELS.get(item.client, item.client) for item in self.health_clients if item.installed]
        configured = [CLIENT_LABELS.get(item.client, item.client) for item in self.health_clients if item.configured]
        if configured:
            self.home_clients_var.set("Lore connected: " + ", ".join(configured))
        elif installed:
            self.home_clients_var.set("Installed, not connected: " + ", ".join(installed))
        else:
            self.home_clients_var.set("No supported clients detected (optional)")
        self._render_connections_status()
        self.status_var.set("Local continuity stack checked.")
        if runtime_ready and self.health_lore and self.health_lore.cli_ready:
            self.state.first_run_complete = True
            self.state.save()

    def _copy_setup_help(self) -> None:
        lines = [
            "ContinuityBridge setup help",
            "",
            "Lore (required for searchable cross-AI continuity):",
            "  npm install -g @jordanhindo/lore",
            "  lore setup",
            "",
            "Git (optional, required only for repository coordinates in handoffs):",
            "  Install Git from your operating system's normal package/installer source.",
            "",
            "Then return to ContinuityBridge and choose Home → Check again.",
        ]
        self.root.clipboard_clear()
        self.root.clipboard_append("\n".join(lines))
        self.status_var.set("Setup help copied.")

    def _render_recent(self) -> None:
        if not hasattr(self, "recent_sources_tree"):
            return
        self.recent_sources_tree.delete(*self.recent_sources_tree.get_children())
        for index, item in enumerate(self.state.recent_sources):
            self.recent_sources_tree.insert(
                "",
                tk.END,
                iid=f"recent-source-{index}",
                values=(item.get("provider", ""), item.get("path", ""), item.get("used_at", "")),
            )
        self.recent_handoffs_tree.delete(*self.recent_handoffs_tree.get_children())
        for index, item in enumerate(self.state.recent_handoffs):
            self.recent_handoffs_tree.insert(
                "",
                tk.END,
                iid=f"recent-handoff-{index}",
                values=(item.get("task", ""), item.get("path", ""), item.get("created_at", "")),
            )

    def _open_recent_source(self) -> None:
        selected = self.recent_sources_tree.selection()
        if not selected:
            return
        index = int(selected[0].rsplit("-", 1)[1])
        if index >= len(self.state.recent_sources):
            return
        item = self.state.recent_sources[index]
        provider = str(item.get("provider", "chatgpt"))
        self.history_provider_var.set("Claude" if provider == "claude" else "ChatGPT")
        self.history_source_var.set(str(item.get("path", "")))
        self._select_tab(self.history_tab)
        self._analyze_history()

    def _copy_recent_handoff(self) -> None:
        selected = self.recent_handoffs_tree.selection()
        if not selected:
            return
        index = int(selected[0].rsplit("-", 1)[1])
        if index >= len(self.state.recent_handoffs):
            return
        path = str(self.state.recent_handoffs[index].get("path", ""))
        self.root.clipboard_clear()
        self.root.clipboard_append(path)
        self.status_var.set("Handoff path copied.")

    # ------------------------------------------------------------------
    # History / import
    # ------------------------------------------------------------------
    def _build_history(self) -> None:
        ttk.Label(self.history_tab, text="History", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(
            self.history_tab,
            text="Open a provider export, inspect it locally, then import or refresh the selected history in Lore.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(2, 8))

        source = ttk.LabelFrame(self.history_tab, text="Source", padding=9)
        source.pack(fill=tk.X, pady=(0, 8))
        ttk.Combobox(
            source,
            textvariable=self.history_provider_var,
            values=("ChatGPT", "Claude"),
            state="readonly",
            width=12,
        ).grid(row=0, column=0, padx=(0, 6))
        ttk.Entry(source, textvariable=self.history_source_var).grid(row=0, column=1, sticky="ew")
        ttk.Button(source, text="File…", command=self._browse_history_file).grid(row=0, column=2, padx=(6, 0))
        ttk.Button(source, text="Folder…", command=self._browse_history_folder).grid(row=0, column=3, padx=(6, 0))
        ttk.Button(source, text="Analyze", style="Accent.TButton", command=self._analyze_history).grid(
            row=0, column=4, padx=(10, 0)
        )
        ttk.Button(source, text="Refresh into Lore", command=self._refresh_history_into_lore).grid(
            row=0, column=5, padx=(6, 0)
        )
        source.columnconfigure(1, weight=1)

        browser = ttk.Panedwindow(self.history_tab, orient=tk.HORIZONTAL)
        browser.pack(fill=tk.BOTH, expand=True)
        left = ttk.Frame(browser)
        right = ttk.Frame(browser)
        browser.add(left, weight=3)
        browser.add(right, weight=2)

        search_row = ttk.Frame(left)
        search_row.pack(fill=tk.X, pady=(0, 5))
        ttk.Label(search_row, text="Filter").pack(side=tk.LEFT)
        ttk.Entry(search_row, textvariable=self.history_filter_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=(6, 0)
        )
        self.history_tree = ttk.Treeview(
            left,
            columns=("title", "provider", "messages", "updated"),
            show="headings",
            selectmode="extended",
        )
        for column, heading, width in (
            ("title", "Title", 340),
            ("provider", "Source", 90),
            ("messages", "Messages", 80),
            ("updated", "Updated", 170),
        ):
            self.history_tree.heading(column, text=heading)
            self.history_tree.column(column, width=width, anchor="w" if column != "messages" else "center")
        self.history_tree.pack(fill=tk.BOTH, expand=True)
        self.history_tree.bind("<<TreeviewSelect>>", self._show_history_preview)

        ttk.Label(right, text="Conversation preview", style="CardHeading.TLabel").pack(anchor="w")
        self.history_preview = scrolledtext.ScrolledText(right, wrap=tk.WORD, state=tk.DISABLED)
        self.history_preview.pack(fill=tk.BOTH, expand=True, pady=(5, 0))

        controls = ttk.LabelFrame(self.history_tab, text="Import", padding=8)
        controls.pack(fill=tk.X, pady=(8, 0))
        ttk.Checkbutton(
            controls,
            text="Redact credential-like strings",
            variable=self.history_redact_var,
        ).grid(row=0, column=0, sticky="w")
        ttk.Label(controls, text="Project override").grid(row=0, column=1, padx=(14, 5))
        ttk.Entry(controls, textvariable=self.history_project_var, width=24).grid(row=0, column=2)
        ttk.Checkbutton(controls, text="Also write JSONL", variable=self.history_write_jsonl_var).grid(
            row=0, column=3, padx=(14, 5)
        )
        ttk.Entry(controls, textvariable=self.history_jsonl_var).grid(row=0, column=4, sticky="ew")
        ttk.Button(controls, text="Save as…", command=self._browse_history_jsonl).grid(row=0, column=5, padx=(5, 0))
        ttk.Button(controls, text="Import selected", command=lambda: self._import_history(True)).grid(
            row=1, column=4, pady=(7, 0), sticky="e"
        )
        ttk.Button(
            controls,
            text="Import all",
            style="Accent.TButton",
            command=lambda: self._import_history(False),
        ).grid(row=1, column=5, pady=(7, 0), padx=(5, 0))
        controls.columnconfigure(4, weight=1)

    def _history_client(self) -> BridgeClient:
        return BridgeClient()

    def _browse_history_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose a ChatGPT or Claude export",
            filetypes=(("Supported exports", "*.zip *.json"), ("All files", "*.*")),
        )
        if path:
            self.history_source_var.set(path)

    def _browse_history_folder(self) -> None:
        path = filedialog.askdirectory(title="Choose an extracted conversation export")
        if path:
            self.history_source_var.set(path)

    def _browse_history_jsonl(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Write normalized Lore records",
            defaultextension=".jsonl",
            filetypes=(("JSON Lines", "*.jsonl"), ("All files", "*.*")),
        )
        if path:
            self.history_jsonl_var.set(path)
            self.history_write_jsonl_var.set(True)

    def _analyze_history(self) -> None:
        source = self.history_source_var.get().strip()
        provider = self.history_provider_var.get()
        redact = self.history_redact_var.get()
        if not source:
            messagebox.showerror(APP_TITLE, "Choose a ChatGPT or Claude export first.")
            return
        client = self._history_client()
        self.status_var.set("Analyzing conversation export…")
        self._run_async("history_analysis", lambda: client.inspect(provider, source, redact=redact))

    def _event_history_analysis(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set("Export analysis failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self.history_conversations = [item for item in payload.get("conversations", []) if isinstance(item, dict)]
        self._apply_history_filter()
        count = int(payload.get("conversationCount", len(self.history_conversations)))
        self.state.remember_source(self.history_provider_var.get(), self.history_source_var.get(), conversation_count=count)
        self.state.save()
        self._render_recent()
        self.status_var.set(f"Ready: {count} conversation(s) in export.")

    def _apply_history_filter(self) -> None:
        query = self.history_filter_var.get().strip().lower()
        self.history_filtered = [
            item
            for item in self.history_conversations
            if not query
            or query
            in " ".join(
                (str(item.get("title", "")), str(item.get("id", "")), str(item.get("preview", "")))
            ).lower()
        ]
        if not hasattr(self, "history_tree"):
            return
        self.history_tree.delete(*self.history_tree.get_children())
        self.history_rows.clear()
        for index, item in enumerate(self.history_filtered):
            iid = f"history-{index}"
            self.history_rows[iid] = str(item.get("id", index))
            self.history_tree.insert(
                "",
                tk.END,
                iid=iid,
                values=(
                    item.get("title", "Untitled conversation"),
                    item.get("provider", self.history_provider_var.get()),
                    item.get("messageCount", 0),
                    item.get("updatedAt") or item.get("createdAt") or "",
                ),
            )
        if self.history_filtered:
            first = self.history_tree.get_children()[0]
            self.history_tree.selection_set(first)
            self._show_history_preview()
        else:
            self._replace_text(self.history_preview, "No conversations match the current filter.")

    def _show_history_preview(self, _event: object | None = None) -> None:
        selected = self.history_tree.selection()
        if not selected:
            return
        try:
            index = int(selected[0].rsplit("-", 1)[1])
            item = self.history_filtered[index]
        except (ValueError, IndexError):
            return
        text = (
            f"{item.get('title', 'Untitled conversation')}\n"
            f"Provider: {item.get('provider', self.history_provider_var.get())}\n"
            f"Conversation ID: {item.get('id', '')}\n"
            f"Messages: {item.get('messageCount', 0)}\n"
            f"Created: {item.get('createdAt') or 'unknown'}\n"
            f"Updated: {item.get('updatedAt') or 'unknown'}\n\n"
            f"{item.get('preview', 'No preview text available.')}"
        )
        self._replace_text(self.history_preview, text)

    def _history_import_options(self, selected_ids: tuple[str, ...] = ()) -> ImportOptions:
        output = self.history_jsonl_var.get().strip() if self.history_write_jsonl_var.get() else None
        return ImportOptions(
            to_lore=True,
            output_path=output or None,
            redact=self.history_redact_var.get(),
            project=self.history_project_var.get().strip() or None,
            lore_command=self.lore_var.get().strip() or "lore",
            conversation_ids=selected_ids,
        )

    def _import_history(self, selected_only: bool) -> None:
        source = self.history_source_var.get().strip()
        provider = self.history_provider_var.get()
        if not source:
            messagebox.showerror(APP_TITLE, "Choose an export first.")
            return
        selected_ids: tuple[str, ...] = ()
        if selected_only:
            selected = self.history_tree.selection()
            if not selected:
                messagebox.showinfo(APP_TITLE, "Select at least one conversation.")
                return
            selected_ids = tuple(self.history_rows[item] for item in selected if item in self.history_rows)
        options = self._history_import_options(selected_ids)
        client = self._history_client()
        self.status_var.set("Importing into Lore…")
        self._run_async(
            "history_import",
            lambda: {
                "result": client.import_conversations(provider, source, options),
                "provider": provider,
                "source": source,
                "selected_count": len(selected_ids) if selected_only else len(self.history_conversations),
            },
        )

    def _refresh_history_into_lore(self) -> None:
        # The Node import path owns incremental manifests/resume; running the same source
        # again is the complete user-facing refresh action, not a second implementation.
        self._import_history(False)

    def _event_history_import(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set("Import failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        result = payload.get("result")
        detail = str(getattr(result, "stdout", "")).strip()
        self.state.remember_import(
            str(payload.get("provider", "")),
            str(payload.get("source", "")),
            selected_count=int(payload.get("selected_count", 0)),
            detail=detail,
        )
        self.state.save()
        self._render_recent()
        self.status_var.set("History import/refresh complete.")
        messagebox.showinfo(APP_TITLE, detail or "History import/refresh complete.")
        self._refresh_health()

    # ------------------------------------------------------------------
    # Recall / library
    # ------------------------------------------------------------------
    def _build_recall(self) -> None:
        ttk.Label(self.recall_tab, text="Recall", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(
            self.recall_tab,
            text="Search original Lore evidence, inspect its bounded context, then carry the exact message into Continue.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(2, 8))
        search = ttk.Frame(self.recall_tab)
        search.pack(fill=tk.X, pady=(0, 8))
        ttk.Entry(search, textvariable=self.recall_query_var).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(search, text="Search Lore", style="Accent.TButton", command=self._search_recall).pack(
            side=tk.LEFT, padx=(6, 0)
        )

        paned = ttk.Panedwindow(self.recall_tab, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True)
        left = ttk.Frame(paned)
        right = ttk.Frame(paned)
        paned.add(left, weight=3)
        paned.add(right, weight=2)
        self.recall_tree = ttk.Treeview(
            left,
            columns=("title", "source", "timestamp", "message"),
            show="headings",
            selectmode="browse",
        )
        for column, heading, width in (
            ("title", "Evidence", 320),
            ("source", "Source", 100),
            ("timestamp", "Time", 150),
            ("message", "Message ID", 190),
        ):
            self.recall_tree.heading(column, text=heading)
            self.recall_tree.column(column, width=width, anchor="w")
        self.recall_tree.pack(fill=tk.BOTH, expand=True)
        self.recall_tree.bind("<<TreeviewSelect>>", self._load_recall_context)

        ttk.Label(right, text="Source context", style="CardHeading.TLabel").pack(anchor="w")
        self.recall_context = scrolledtext.ScrolledText(right, wrap=tk.WORD, state=tk.DISABLED)
        self.recall_context.pack(fill=tk.BOTH, expand=True, pady=(5, 0))
        ttk.Button(
            right,
            text="Continue with selected evidence",
            style="Accent.TButton",
            command=self._continue_from_recall,
        ).pack(anchor="e", pady=(7, 0))

    def _search_recall(self) -> None:
        query = self.recall_query_var.get().strip()
        lore = self.lore_var.get().strip() or "lore"
        if not query:
            messagebox.showinfo(APP_TITLE, "Enter something to search for.")
            return
        client = LoreLibraryClient(lore)
        self.status_var.set("Searching Lore…")
        self._run_async("recall_search", lambda: client.search(query, limit=40))

    def _event_recall_search(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, list):
            self.status_var.set("Lore search failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self.recall_hits = [item for item in payload if isinstance(item, LoreHit)]
        self.recall_tree.delete(*self.recall_tree.get_children())
        self.recall_rows.clear()
        for index, hit in enumerate(self.recall_hits):
            iid = f"recall-{index}"
            self.recall_rows[iid] = hit
            self.recall_tree.insert(
                "",
                tk.END,
                iid=iid,
                values=(hit.title, hit.source or "", hit.timestamp or "", hit.message_id),
            )
        if self.recall_hits:
            first = self.recall_tree.get_children()[0]
            self.recall_tree.selection_set(first)
            self._load_recall_context()
        else:
            self._replace_text(self.recall_context, "No matching Lore evidence was found.")
        self.status_var.set(f"Recall found {len(self.recall_hits)} evidence record(s).")

    def _load_recall_context(self, _event: object | None = None) -> None:
        selected = self.recall_tree.selection()
        if not selected:
            return
        hit = self.recall_rows.get(selected[0])
        if not hit:
            return
        lore = self.lore_var.get().strip() or "lore"
        client = LoreLibraryClient(lore)
        self._replace_text(
            self.recall_context,
            f"{hit.title}\nMessage ID: {hit.message_id}\n\n{hit.text}\n\nLoading surrounding source context…",
        )
        self._run_async("recall_context", lambda: {"hit": hit, "context": client.context(hit.message_id)})

    def _event_recall_context(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self._replace_text(self.recall_context, f"Unable to retrieve context: {payload}")
            return
        hit = payload.get("hit")
        context = payload.get("context")
        if not isinstance(hit, LoreHit):
            return
        rendered = json.dumps(context, indent=2, ensure_ascii=False) if isinstance(context, dict) else str(context)
        self._replace_text(
            self.recall_context,
            f"{hit.title}\nSource: {hit.source or 'unknown'}\nMessage ID: {hit.message_id}\n"
            f"Session ID: {hit.session_id or 'unknown'}\n\nMatched evidence:\n{hit.text}\n\n"
            f"Surrounding Lore context:\n{rendered}",
        )

    def _continue_from_recall(self) -> None:
        selected = self.recall_tree.selection()
        if not selected:
            messagebox.showinfo(APP_TITLE, "Select a recalled evidence record first.")
            return
        hit = self.recall_rows.get(selected[0])
        if not hit:
            return
        self.continue_message_ids.delete("1.0", tk.END)
        self.continue_message_ids.insert("1.0", hit.message_id)
        self.continue_query_var.set("")
        if not self.continue_task_var.get().strip():
            self.continue_task_var.set(f"Continue work from: {hit.title}")
        self._select_tab(self.continue_tab)
        self.status_var.set("Selected Lore evidence carried into Continue.")

    # ------------------------------------------------------------------
    # Connections
    # ------------------------------------------------------------------
    def _build_connections(self) -> None:
        ttk.Label(self.connections_tab, text="Connections", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(
            self.connections_tab,
            text="See which local AI clients are installed, preview the exact Lore MCP change, then apply it only after confirmation.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(2, 8))

        top = ttk.Frame(self.connections_tab)
        top.pack(fill=tk.X, pady=(0, 8))
        ttk.Label(top, text="Lore command").pack(side=tk.LEFT)
        ttk.Entry(top, textvariable=self.lore_var, width=24).pack(side=tk.LEFT, padx=(6, 8))
        ttk.Button(top, text="Check connections", command=self._refresh_health).pack(side=tk.LEFT)

        self.connections_tree = ttk.Treeview(
            self.connections_tab,
            columns=("client", "installed", "connected", "detail"),
            show="headings",
            height=5,
        )
        for column, heading, width in (
            ("client", "Client", 140),
            ("installed", "Installed", 90),
            ("connected", "Lore connected", 120),
            ("detail", "Details", 720),
        ):
            self.connections_tree.heading(column, text=heading)
            self.connections_tree.column(column, width=width, anchor="w" if column in {"client", "detail"} else "center")
        self.connections_tree.pack(fill=tk.X)
        self.connections_tree.bind("<<TreeviewSelect>>", self._select_connection_row)

        config = ttk.LabelFrame(self.connections_tab, text="Configure selected client", padding=9)
        config.pack(fill=tk.BOTH, expand=True, pady=(8, 0))
        choose = ttk.Frame(config)
        choose.pack(fill=tk.X)
        ttk.Label(choose, text="Client").pack(side=tk.LEFT)
        ttk.Combobox(
            choose,
            textvariable=self.connection_client_var,
            values=("Codex", "Claude Code", "Cursor"),
            state="readonly",
            width=16,
        ).pack(side=tk.LEFT, padx=(6, 0))
        self.connection_preview = scrolledtext.ScrolledText(config, wrap=tk.NONE, height=16, state=tk.DISABLED)
        self.connection_preview.pack(fill=tk.BOTH, expand=True, pady=(6, 0))
        ttk.Button(
            config,
            text="Apply after confirmation",
            style="Accent.TButton",
            command=self._apply_connection,
        ).pack(anchor="e", pady=(7, 0))
        self._refresh_connection_preview()

    def _render_connections_status(self) -> None:
        if not hasattr(self, "connections_tree"):
            return
        self.connections_tree.delete(*self.connections_tree.get_children())
        self.connection_rows.clear()
        for status in self.health_clients:
            label = CLIENT_LABELS.get(status.client, status.client)
            iid = f"connection-{status.client}"
            self.connection_rows[iid] = status
            detail = " ".join(status.detail.split())
            if len(detail) > 150:
                detail = detail[:149] + "…"
            self.connections_tree.insert(
                "",
                tk.END,
                iid=iid,
                values=(label, "Yes" if status.installed else "No", "Yes" if status.configured else "No", detail),
            )

    def _select_connection_row(self, _event: object | None = None) -> None:
        selected = self.connections_tree.selection()
        if not selected:
            return
        status = self.connection_rows.get(selected[0])
        if status:
            self.connection_client_var.set(CLIENT_LABELS.get(status.client, status.client))

    def _refresh_connection_preview(self) -> None:
        if not hasattr(self, "connection_preview"):
            return
        try:
            client = MCPControlClient(lore_command=self.lore_var.get().strip() or "lore")
            snippet = client.config_snippet(self.connection_client_var.get())
            location = client.config_location(self.connection_client_var.get())
            self._replace_text(
                self.connection_preview,
                f"Target: {location}\n\nExact Lore MCP configuration:\n\n{snippet}",
            )
        except Exception as error:
            self._replace_text(self.connection_preview, str(error))

    def _apply_connection(self) -> None:
        target = self.connection_client_var.get()
        lore = self.lore_var.get().strip() or "lore"
        client = MCPControlClient(lore_command=lore)
        try:
            snippet = client.config_snippet(target)
            location = client.config_location(target)
        except Exception as error:
            messagebox.showerror(APP_TITLE, str(error))
            return
        confirmed = messagebox.askyesno(
            APP_TITLE,
            f"Configure Lore for {target}?\n\nTarget: {location}\n\n{snippet}\n\nUnrelated settings are preserved where applicable.",
        )
        if not confirmed:
            return
        self.status_var.set(f"Configuring {target}…")
        self._run_async("connection_apply", lambda: client.apply_client(target))

    def _event_connection_apply(self, ok: bool, payload: object) -> None:
        if not ok:
            self.status_var.set("Client configuration failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self.status_var.set("Client connection updated.")
        messagebox.showinfo(APP_TITLE, str(payload) or "Client connection updated.")
        self._refresh_health()

    # ------------------------------------------------------------------
    # Continue / handoff
    # ------------------------------------------------------------------
    def _build_continue(self) -> None:
        ttk.Label(self.continue_tab, text="Continue", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(
            self.continue_tab,
            text="Turn recalled evidence into a portable continuation package with current repository state and explicitly selected local artifacts.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(2, 8))

        evidence = ttk.LabelFrame(self.continue_tab, text="1. Task and evidence", padding=8)
        evidence.pack(fill=tk.X, pady=(0, 7))
        ttk.Label(evidence, text="Task").grid(row=0, column=0, sticky="w")
        ttk.Entry(evidence, textvariable=self.continue_task_var).grid(row=0, column=1, columnspan=3, sticky="ew", padx=(6, 0))
        ttk.Label(evidence, text="Lore search query").grid(row=1, column=0, sticky="nw", pady=(7, 0))
        ttk.Entry(evidence, textvariable=self.continue_query_var).grid(row=1, column=1, sticky="ew", padx=(6, 8), pady=(7, 0))
        ttk.Label(evidence, text="Exact message IDs (one per line)").grid(row=1, column=2, sticky="nw", pady=(7, 0))
        self.continue_message_ids = scrolledtext.ScrolledText(evidence, height=3, width=36)
        self.continue_message_ids.grid(row=1, column=3, sticky="ew", padx=(6, 0), pady=(7, 0))
        evidence.columnconfigure(1, weight=1)
        evidence.columnconfigure(3, weight=1)

        repo = ttk.LabelFrame(self.continue_tab, text="2. Repository", padding=8)
        repo.pack(fill=tk.X, pady=(0, 7))
        ttk.Entry(repo, textvariable=self.continue_repo_var).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(repo, text="Choose folder…", command=self._browse_continue_repo).pack(side=tk.LEFT, padx=(6, 0))
        ttk.Checkbutton(repo, text="No repository", variable=self.continue_no_repo_var).pack(side=tk.LEFT, padx=(12, 0))

        artifacts = ttk.LabelFrame(self.continue_tab, text="3. Optional attachment artifacts", padding=8)
        artifacts.pack(fill=tk.BOTH, expand=True, pady=(0, 7))
        row = ttk.Frame(artifacts)
        row.pack(fill=tk.X)
        ttk.Combobox(
            row,
            textvariable=self.continue_attachment_provider_var,
            values=("ChatGPT", "Claude"),
            state="readonly",
            width=12,
        ).pack(side=tk.LEFT)
        ttk.Entry(row, textvariable=self.continue_attachment_export_var).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(6, 0))
        ttk.Button(row, text="Export…", command=self._browse_continue_export).pack(side=tk.LEFT, padx=(6, 0))
        ttk.Button(row, text="Scan", command=self._scan_continue_attachments).pack(side=tk.LEFT, padx=(6, 0))
        self.continue_attachment_tree = ttk.Treeview(
            artifacts,
            columns=("name", "type", "status", "conversation", "id"),
            show="headings",
            selectmode="extended",
            height=6,
        )
        for column, heading, width in (
            ("name", "Artifact", 220),
            ("type", "Type", 130),
            ("status", "Local", 100),
            ("conversation", "Conversation", 280),
            ("id", "Attachment ID", 200),
        ):
            self.continue_attachment_tree.heading(column, text=heading)
            self.continue_attachment_tree.column(column, width=width, anchor="w")
        self.continue_attachment_tree.pack(fill=tk.BOTH, expand=True, pady=(6, 0))

        output = ttk.LabelFrame(self.continue_tab, text="4. Build", padding=8)
        output.pack(fill=tk.X)
        ttk.Label(output, text="Portable bundle folder").grid(row=0, column=0, sticky="w")
        ttk.Entry(output, textvariable=self.continue_bundle_var).grid(row=0, column=1, sticky="ew", padx=(6, 0))
        ttk.Button(output, text="Choose…", command=self._browse_continue_bundle).grid(row=0, column=2, padx=(6, 0))
        ttk.Checkbutton(output, text="Overwrite conflicting artifact copies", variable=self.continue_overwrite_var).grid(
            row=0, column=3, padx=(10, 0)
        )
        ttk.Label(output, text="Handoff file (optional when bundle is chosen)").grid(row=1, column=0, sticky="w", pady=(6, 0))
        ttk.Entry(output, textvariable=self.continue_output_var).grid(row=1, column=1, sticky="ew", padx=(6, 0), pady=(6, 0))
        ttk.Button(output, text="Save as…", command=self._browse_continue_output).grid(row=1, column=2, padx=(6, 0), pady=(6, 0))
        ttk.Combobox(
            output,
            textvariable=self.continue_format_var,
            values=("markdown", "json"),
            state="readonly",
            width=11,
        ).grid(row=1, column=3, padx=(10, 0), pady=(6, 0), sticky="w")
        actions = ttk.Frame(output)
        actions.grid(row=2, column=0, columnspan=4, sticky="ew", pady=(8, 0))
        ttk.Button(actions, text="Preview", command=self._preview_continue).pack(side=tk.RIGHT)
        ttk.Button(actions, text="Build continuation package", style="Accent.TButton", command=self._build_continue_package).pack(
            side=tk.RIGHT, padx=(0, 6)
        )
        output.columnconfigure(1, weight=1)

        self.continue_preview = scrolledtext.ScrolledText(self.continue_tab, wrap=tk.WORD, height=12, state=tk.DISABLED)
        self.continue_preview.pack(fill=tk.BOTH, expand=True, pady=(7, 0))
        self._replace_text(
            self.continue_preview,
            "Preview is non-mutating: attachments are referenced but not copied until Build continuation package.",
        )

    def _browse_continue_repo(self) -> None:
        path = filedialog.askdirectory(title="Choose the current Git repository")
        if path:
            self.continue_repo_var.set(path)
            self.continue_no_repo_var.set(False)

    def _browse_continue_export(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose attachment-bearing provider export",
            filetypes=(("Supported exports", "*.zip *.json"), ("All files", "*.*")),
        )
        if not path:
            path = filedialog.askdirectory(title="Or choose an extracted export folder")
        if path:
            self.continue_attachment_export_var.set(path)

    def _browse_continue_bundle(self) -> None:
        path = filedialog.askdirectory(title="Choose or create a portable bundle folder")
        if path:
            self.continue_bundle_var.set(path)

    def _browse_continue_output(self) -> None:
        is_json = self.continue_format_var.get() == "json"
        path = filedialog.asksaveasfilename(
            title="Save continuation handoff",
            defaultextension=".json" if is_json else ".md",
            filetypes=(("JSON", "*.json"), ("Markdown", "*.md"), ("All files", "*.*")),
        )
        if path:
            self.continue_output_var.set(path)

    def _scan_continue_attachments(self) -> None:
        provider = self.continue_attachment_provider_var.get()
        export = self.continue_attachment_export_var.get().strip()
        if not export:
            messagebox.showinfo(APP_TITLE, "Choose a provider export before scanning attachments.")
            return
        client = HandoffClient()
        self.status_var.set("Scanning attachment references…")
        self._run_async("attachment_scan", lambda: client.scan_attachments(provider, export))

    def _event_attachment_scan(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set("Attachment scan failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self.continue_attachments = [item for item in payload.get("attachments", []) if isinstance(item, dict)]
        self.continue_attachment_tree.delete(*self.continue_attachment_tree.get_children())
        self.continue_attachment_rows.clear()
        for index, item in enumerate(self.continue_attachments):
            iid = f"attachment-{index}"
            self.continue_attachment_rows[iid] = item
            provenance = item.get("provenance") if isinstance(item.get("provenance"), dict) else {}
            conversation = provenance.get("conversationTitle") or provenance.get("conversationId") or ""
            self.continue_attachment_tree.insert(
                "",
                tk.END,
                iid=iid,
                values=(
                    item.get("name", "artifact"),
                    item.get("mimeType", ""),
                    item.get("status", ""),
                    conversation,
                    item.get("id", ""),
                ),
            )
        self.status_var.set(f"Found {len(self.continue_attachments)} attachment reference(s).")

    def _continue_evidence_ids(self) -> tuple[str, ...]:
        return tuple(
            line.strip()
            for line in self.continue_message_ids.get("1.0", tk.END).splitlines()
            if line.strip()
        )

    def _selected_attachment_ids(self) -> tuple[str, ...]:
        ids: list[str] = []
        for row in self.continue_attachment_tree.selection():
            item = self.continue_attachment_rows.get(row)
            if item and item.get("id"):
                ids.append(str(item["id"]))
        return tuple(ids)

    def _make_handoff_options(self, *, preview: bool) -> HandoffOptions:
        selected_attachments = self._selected_attachment_ids()
        attachment_export = self.continue_attachment_export_var.get().strip()
        has_attachment_selection = bool(selected_attachments)
        output_path = None if preview else (self.continue_output_var.get().strip() or None)
        bundle = None if preview else (self.continue_bundle_var.get().strip() or None)
        if not preview and not output_path and not bundle:
            raise ValueError("Choose a handoff file or a portable bundle folder before building.")
        return HandoffOptions(
            task=self.continue_task_var.get().strip(),
            query=self.continue_query_var.get().strip() or None,
            message_ids=self._continue_evidence_ids(),
            repository_path=None if self.continue_no_repo_var.get() else (self.continue_repo_var.get().strip() or None),
            no_repository=self.continue_no_repo_var.get(),
            lore_command=self.lore_var.get().strip() or "lore",
            output_path=output_path,
            output_format=self.continue_format_var.get(),
            attachment_provider=self.continue_attachment_provider_var.get().lower() if has_attachment_selection else None,
            attachment_export=attachment_export if has_attachment_selection else None,
            attachment_ids=selected_attachments,
            attachment_bundle=bundle if has_attachment_selection else None,
            overwrite_attachments=(self.continue_overwrite_var.get() if has_attachment_selection and bundle else False),
        )

    def _preview_continue(self) -> None:
        try:
            options = self._make_handoff_options(preview=True)
            client = HandoffClient()
            # Validate immediately on the UI thread; generation itself is asynchronous.
            client.build_command(options)
        except ValueError as error:
            messagebox.showerror(APP_TITLE, str(error))
            return
        self.status_var.set("Building non-mutating handoff preview…")
        self._run_async("handoff_preview", lambda: client.generate(options).stdout)

    def _event_handoff_preview(self, ok: bool, payload: object) -> None:
        if not ok:
            self.status_var.set("Handoff preview failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self._replace_text(self.continue_preview, str(payload))
        self.status_var.set("Handoff preview ready; no attachment files were copied.")

    def _build_continue_package(self) -> None:
        try:
            options = self._make_handoff_options(preview=False)
            client = HandoffClient()
            client.build_command(options)
        except ValueError as error:
            messagebox.showerror(APP_TITLE, str(error))
            return
        self.status_var.set("Building continuation package…")
        self._run_async("handoff_build", lambda: {"result": client.generate(options), "options": options})

    def _event_handoff_build(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set("Continuation package failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        options = payload.get("options")
        result = payload.get("result")
        if not isinstance(options, HandoffOptions):
            return
        if options.output_path:
            handoff_path = Path(options.output_path)
        elif options.attachment_bundle:
            extension = "json" if options.output_format == "json" else "md"
            handoff_path = Path(options.attachment_bundle) / f"HANDOFF.{extension}"
        else:
            handoff_path = Path("HANDOFF.md")
        self.state.remember_handoff(
            handoff_path,
            task=options.task,
            bundle=options.attachment_bundle,
        )
        self.state.save()
        self._render_recent()
        stdout = str(getattr(result, "stdout", "")).strip()
        self._replace_text(
            self.continue_preview,
            (stdout + "\n\n" if stdout else "") + f"Built continuation package:\n{handoff_path}",
        )
        self.status_var.set("Continuation package built.")
        messagebox.showinfo(APP_TITLE, f"Continuation package built.\n\n{handoff_path}")


def main() -> None:
    root = tk.Tk()
    ContinuityWorkstation(root)
    root.mainloop()


if __name__ == "__main__":
    main()
