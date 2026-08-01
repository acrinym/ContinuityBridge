"""Tkinter desktop interface for ContinuityBridge."""

from __future__ import annotations

import json
from pathlib import Path
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

from .client import BridgeClient, BridgeClientError, ImportOptions


APP_TITLE = "ContinuityBridge Desktop"
SETTINGS_PATH = Path.home() / ".continuity-bridge" / "desktop.json"


class ContinuityBridgeApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("1180x760")
        self.root.minsize(920, 620)
        self.settings = self._load_settings()
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.conversations: list[dict] = []
        self.filtered: list[dict] = []
        self.row_conversation_ids: dict[str, str] = {}
        self.busy = False

        self.provider_var = tk.StringVar(value=self.settings.get("provider", "ChatGPT"))
        self.source_var = tk.StringVar(value=self.settings.get("source", ""))
        self.search_var = tk.StringVar()
        self.redact_var = tk.BooleanVar(value=self.settings.get("redact", True))
        self.to_lore_var = tk.BooleanVar(value=self.settings.get("to_lore", True))
        self.to_jsonl_var = tk.BooleanVar(value=self.settings.get("to_jsonl", False))
        self.output_var = tk.StringVar(value=self.settings.get("output", ""))
        self.project_var = tk.StringVar(value=self.settings.get("project", ""))
        self.node_var = tk.StringVar(value=self.settings.get("node_command", "node"))
        self.lore_var = tk.StringVar(value=self.settings.get("lore_command", "lore"))
        default_cli = str(BridgeClient.default_cli_path())
        self.cli_var = tk.StringVar(value=self.settings.get("cli_path", default_cli))
        self.status_var = tk.StringVar(value="Choose an export to begin.")

        self._build_style()
        self._build_ui()
        self.search_var.trace_add("write", lambda *_: self._apply_filter())
        self.root.after(100, self._poll_events)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_style(self) -> None:
        style = ttk.Style(self.root)
        available = style.theme_names()
        if "clam" in available:
            style.theme_use("clam")
        style.configure("Heading.TLabel", font=("TkDefaultFont", 15, "bold"))
        style.configure("Muted.TLabel", foreground="#555555")
        style.configure("Treeview", rowheight=25)
        style.configure("Accent.TButton", padding=(12, 7))

    def _build_ui(self) -> None:
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        import_tab = ttk.Frame(notebook, padding=12)
        log_tab = ttk.Frame(notebook, padding=12)
        notebook.add(import_tab, text="Import & Browse")
        notebook.add(log_tab, text="Activity Log")

        header = ttk.Frame(import_tab)
        header.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(header, text="Cross-AI Conversation Import", style="Heading.TLabel").pack(
            side=tk.LEFT
        )
        ttk.Label(
            header,
            text="Local processing · no API credits · credential redaction on by default",
            style="Muted.TLabel",
        ).pack(side=tk.RIGHT)

        source_frame = ttk.LabelFrame(import_tab, text="1. Choose export", padding=10)
        source_frame.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(source_frame, text="Provider").grid(row=0, column=0, sticky="w", padx=(0, 6))
        provider = ttk.Combobox(
            source_frame,
            textvariable=self.provider_var,
            values=("ChatGPT", "Claude"),
            state="readonly",
            width=14,
        )
        provider.grid(row=0, column=1, sticky="w", padx=(0, 12))
        ttk.Label(source_frame, text="ZIP, folder, or JSON").grid(
            row=0, column=2, sticky="w", padx=(0, 6)
        )
        ttk.Entry(source_frame, textvariable=self.source_var).grid(
            row=0, column=3, sticky="ew", padx=(0, 6)
        )
        ttk.Button(source_frame, text="File…", command=self._browse_file).grid(row=0, column=4)
        ttk.Button(source_frame, text="Folder…", command=self._browse_folder).grid(
            row=0, column=5, padx=(6, 0)
        )
        self.analyze_button = ttk.Button(
            source_frame, text="Analyze", style="Accent.TButton", command=self._analyze
        )
        self.analyze_button.grid(row=0, column=6, padx=(12, 0))
        source_frame.columnconfigure(3, weight=1)

        browser = ttk.Panedwindow(import_tab, orient=tk.HORIZONTAL)
        browser.pack(fill=tk.BOTH, expand=True)
        list_frame = ttk.Frame(browser)
        preview_frame = ttk.Frame(browser)
        browser.add(list_frame, weight=3)
        browser.add(preview_frame, weight=2)

        search_row = ttk.Frame(list_frame)
        search_row.pack(fill=tk.X, pady=(0, 6))
        ttk.Label(search_row, text="Search conversations").pack(side=tk.LEFT)
        ttk.Entry(search_row, textvariable=self.search_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, padx=(8, 0)
        )

        columns = ("title", "provider", "messages", "updated")
        self.tree = ttk.Treeview(list_frame, columns=columns, show="headings", selectmode="extended")
        self.tree.heading("title", text="Title")
        self.tree.heading("provider", text="Source")
        self.tree.heading("messages", text="Messages")
        self.tree.heading("updated", text="Updated")
        self.tree.column("title", width=340, anchor="w")
        self.tree.column("provider", width=85, anchor="center")
        self.tree.column("messages", width=85, anchor="center")
        self.tree.column("updated", width=170, anchor="w")
        tree_scroll = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=tree_scroll.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        tree_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.bind("<<TreeviewSelect>>", self._show_preview)

        ttk.Label(preview_frame, text="Conversation preview", style="Heading.TLabel").pack(
            anchor="w", pady=(0, 6)
        )
        self.preview = scrolledtext.ScrolledText(preview_frame, wrap=tk.WORD, state=tk.DISABLED)
        self.preview.pack(fill=tk.BOTH, expand=True)

        destination = ttk.LabelFrame(import_tab, text="2. Import destination", padding=10)
        destination.pack(fill=tk.X, pady=(10, 0))
        ttk.Checkbutton(destination, text="Import into Lore", variable=self.to_lore_var).grid(
            row=0, column=0, sticky="w"
        )
        ttk.Label(destination, text="Lore command").grid(row=0, column=1, padx=(14, 5))
        ttk.Entry(destination, textvariable=self.lore_var, width=18).grid(row=0, column=2)
        ttk.Checkbutton(destination, text="Write JSONL", variable=self.to_jsonl_var).grid(
            row=0, column=3, padx=(18, 5)
        )
        ttk.Entry(destination, textvariable=self.output_var).grid(
            row=0, column=4, sticky="ew", padx=(0, 5)
        )
        ttk.Button(destination, text="Save as…", command=self._browse_output).grid(row=0, column=5)
        ttk.Checkbutton(
            destination,
            text="Redact credential-like strings",
            variable=self.redact_var,
        ).grid(row=1, column=0, columnspan=2, sticky="w", pady=(8, 0))
        ttk.Label(destination, text="Project override").grid(
            row=1, column=2, sticky="e", padx=(8, 5), pady=(8, 0)
        )
        ttk.Entry(destination, textvariable=self.project_var).grid(
            row=1, column=3, columnspan=3, sticky="ew", pady=(8, 0)
        )
        destination.columnconfigure(4, weight=1)

        advanced = ttk.LabelFrame(import_tab, text="Runtime", padding=10)
        advanced.pack(fill=tk.X, pady=(10, 0))
        ttk.Label(advanced, text="Node command").grid(row=0, column=0, sticky="w")
        ttk.Entry(advanced, textvariable=self.node_var, width=18).grid(
            row=0, column=1, padx=(5, 14)
        )
        ttk.Label(advanced, text="ContinuityBridge CLI").grid(row=0, column=2, sticky="w")
        ttk.Entry(advanced, textvariable=self.cli_var).grid(
            row=0, column=3, sticky="ew", padx=(5, 5)
        )
        ttk.Button(advanced, text="Browse…", command=self._browse_cli).grid(row=0, column=4)
        advanced.columnconfigure(3, weight=1)

        actions = ttk.Frame(import_tab)
        actions.pack(fill=tk.X, pady=(10, 0))
        ttk.Label(actions, textvariable=self.status_var).pack(side=tk.LEFT)
        self.progress = ttk.Progressbar(actions, mode="indeterminate", length=160)
        self.progress.pack(side=tk.LEFT, padx=12)
        self.import_selected_button = ttk.Button(
            actions, text="Import selected", command=lambda: self._import(selected_only=True)
        )
        self.import_selected_button.pack(side=tk.RIGHT)
        self.import_all_button = ttk.Button(
            actions,
            text="Import all",
            style="Accent.TButton",
            command=lambda: self._import(selected_only=False),
        )
        self.import_all_button.pack(side=tk.RIGHT, padx=(0, 8))

        self.log = scrolledtext.ScrolledText(log_tab, wrap=tk.WORD, state=tk.DISABLED)
        self.log.pack(fill=tk.BOTH, expand=True)
        ttk.Button(log_tab, text="Clear log", command=self._clear_log).pack(anchor="e", pady=(8, 0))

    def _client(self) -> BridgeClient:
        return BridgeClient(node_command=self.node_var.get().strip() or "node", cli_path=self.cli_var.get())

    def _browse_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose an AI conversation export",
            filetypes=(("Supported exports", "*.zip *.json"), ("All files", "*.*")),
        )
        if path:
            self.source_var.set(path)

    def _browse_folder(self) -> None:
        path = filedialog.askdirectory(title="Choose an extracted export folder")
        if path:
            self.source_var.set(path)

    def _browse_output(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Write normalized Lore records",
            defaultextension=".jsonl",
            filetypes=(("JSON Lines", "*.jsonl"), ("All files", "*.*")),
        )
        if path:
            self.output_var.set(path)
            self.to_jsonl_var.set(True)

    def _browse_cli(self) -> None:
        path = filedialog.askopenfilename(title="Choose bin/continuity-bridge.js")
        if path:
            self.cli_var.set(path)

    def _set_busy(self, busy: bool, status: str) -> None:
        self.busy = busy
        self.status_var.set(status)
        state = tk.DISABLED if busy else tk.NORMAL
        self.analyze_button.configure(state=state)
        self.import_selected_button.configure(state=state)
        self.import_all_button.configure(state=state)
        if busy:
            self.progress.start(12)
        else:
            self.progress.stop()

    def _analyze(self) -> None:
        if self.busy:
            return
        source = self.source_var.get().strip()
        if not source:
            messagebox.showerror(APP_TITLE, "Choose an export ZIP, folder, or JSON file first.")
            return
        self._set_busy(True, "Analyzing export…")
        self._append_log(f"Analyzing {source}")

        def worker() -> None:
            try:
                payload = self._client().inspect(
                    self.provider_var.get(), source, redact=self.redact_var.get()
                )
                self.events.put(("analysis", payload))
            except Exception as error:
                self.events.put(("error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _import(self, *, selected_only: bool) -> None:
        if self.busy:
            return
        source = self.source_var.get().strip()
        if not source:
            messagebox.showerror(APP_TITLE, "Choose an export first.")
            return
        selected_ids: tuple[str, ...] = ()
        if selected_only:
            selected = self.tree.selection()
            if not selected:
                messagebox.showinfo(APP_TITLE, "Select at least one conversation.")
                return
            selected_ids = tuple(self.row_conversation_ids[item] for item in selected)

        output = self.output_var.get().strip() if self.to_jsonl_var.get() else None
        options = ImportOptions(
            to_lore=self.to_lore_var.get(),
            output_path=output or None,
            redact=self.redact_var.get(),
            project=self.project_var.get().strip() or None,
            lore_command=self.lore_var.get().strip() or "lore",
            conversation_ids=selected_ids,
        )
        try:
            command = self._client().build_import_command(
                self.provider_var.get(), source, options
            )
        except ValueError as error:
            messagebox.showerror(APP_TITLE, str(error))
            return

        self._set_busy(True, "Importing conversations…")
        self._append_log("Running: " + " ".join(command))

        def worker() -> None:
            try:
                result = self._client().import_conversations(
                    self.provider_var.get(), source, options
                )
                self.events.put(("import", result.stdout.strip()))
            except Exception as error:
                self.events.put(("error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _poll_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "analysis":
                    data = payload if isinstance(payload, dict) else {}
                    self.conversations = list(data.get("conversations", []))
                    self._apply_filter()
                    count = data.get("conversationCount", len(self.conversations))
                    messages = data.get("messageCount", 0)
                    self._append_log(f"Found {count} conversations and {messages} messages.")
                    self._set_busy(False, f"Ready: {count} conversations, {messages} messages.")
                elif kind == "import":
                    text = str(payload)
                    self._append_log(text)
                    self._set_busy(False, "Import complete.")
                    messagebox.showinfo(APP_TITLE, text or "Import complete.")
                elif kind == "error":
                    text = str(payload)
                    self._append_log("ERROR: " + text)
                    self._set_busy(False, "Operation failed.")
                    messagebox.showerror(APP_TITLE, text)
        except queue.Empty:
            pass
        self.root.after(100, self._poll_events)

    def _apply_filter(self) -> None:
        query_text = self.search_var.get().strip().lower()
        if not query_text:
            self.filtered = list(self.conversations)
        else:
            self.filtered = [
                item
                for item in self.conversations
                if query_text
                in " ".join(
                    [
                        str(item.get("title", "")),
                        str(item.get("id", "")),
                        str(item.get("preview", "")),
                    ]
                ).lower()
            ]
        self._populate_tree()

    def _populate_tree(self) -> None:
        self.tree.delete(*self.tree.get_children())
        self.row_conversation_ids.clear()
        for index, item in enumerate(self.filtered):
            updated = item.get("updatedAt") or item.get("createdAt") or ""
            row_id = f"conversation-{index}"
            self.row_conversation_ids[row_id] = str(item.get("id", index))
            self.tree.insert(
                "",
                tk.END,
                iid=row_id,
                values=(
                    item.get("title", "Untitled conversation"),
                    item.get("provider", self.provider_var.get()),
                    item.get("messageCount", 0),
                    updated,
                ),
            )
        if self.filtered:
            first = self.tree.get_children()[0]
            self.tree.selection_set(first)
            self.tree.focus(first)
            self._show_preview()
        else:
            self._set_preview("No conversations match the current search.")

    def _show_preview(self, _event: object | None = None) -> None:
        selected = self.tree.selection()
        if not selected:
            return
        item_id = selected[0]
        index = int(item_id.rsplit("-", 1)[1])
        if index >= len(self.filtered):
            return
        item = self.filtered[index]
        header = (
            f"{item.get('title', 'Untitled conversation')}\n"
            f"Provider: {item.get('provider', '')}\n"
            f"Conversation ID: {item.get('id', '')}\n"
            f"Messages: {item.get('messageCount', 0)}\n"
            f"Created: {item.get('createdAt') or 'unknown'}\n"
            f"Updated: {item.get('updatedAt') or 'unknown'}\n\n"
        )
        self._set_preview(header + str(item.get("preview", "No preview text available.")))

    def _set_preview(self, text: str) -> None:
        self.preview.configure(state=tk.NORMAL)
        self.preview.delete("1.0", tk.END)
        self.preview.insert(tk.END, text)
        self.preview.configure(state=tk.DISABLED)

    def _append_log(self, text: str) -> None:
        self.log.configure(state=tk.NORMAL)
        self.log.insert(tk.END, text.rstrip() + "\n")
        self.log.see(tk.END)
        self.log.configure(state=tk.DISABLED)

    def _clear_log(self) -> None:
        self.log.configure(state=tk.NORMAL)
        self.log.delete("1.0", tk.END)
        self.log.configure(state=tk.DISABLED)

    def _load_settings(self) -> dict:
        try:
            data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_settings(self) -> None:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "provider": self.provider_var.get(),
            "source": self.source_var.get(),
            "redact": self.redact_var.get(),
            "to_lore": self.to_lore_var.get(),
            "to_jsonl": self.to_jsonl_var.get(),
            "output": self.output_var.get(),
            "project": self.project_var.get(),
            "node_command": self.node_var.get(),
            "lore_command": self.lore_var.get(),
            "cli_path": self.cli_var.get(),
        }
        SETTINGS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _on_close(self) -> None:
        try:
            self._save_settings()
        finally:
            self.root.destroy()


def main() -> None:
    root = tk.Tk()
    ContinuityBridgeApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
