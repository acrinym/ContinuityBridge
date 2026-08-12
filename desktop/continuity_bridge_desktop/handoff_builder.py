"""Tkinter Handoff Builder for bounded Lore evidence packages."""

from __future__ import annotations

import json
from pathlib import Path
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

from .client import BridgeClient
from .handoff_client import HandoffClient, HandoffOptions


APP_TITLE = "ContinuityBridge Handoff Builder"
SETTINGS_PATH = Path.home() / ".continuity-bridge" / "handoff-builder.json"


class HandoffBuilderApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("1040x760")
        self.root.minsize(820, 620)
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.settings = self._load_settings()
        self.busy = False

        self.task_var = tk.StringVar()
        self.query_var = tk.StringVar()
        self.repo_var = tk.StringVar(value=self.settings.get("repository", ""))
        self.no_repo_var = tk.BooleanVar(value=self.settings.get("no_repository", False))
        self.local_path_var = tk.BooleanVar(value=self.settings.get("include_local_path", False))
        self.output_var = tk.StringVar(value=self.settings.get("output", ""))
        self.format_var = tk.StringVar(value=self.settings.get("format", "markdown"))
        self.limit_var = tk.IntVar(value=self.settings.get("limit", 5))
        self.context_var = tk.IntVar(value=self.settings.get("context_messages", 11))
        self.node_var = tk.StringVar(value=self.settings.get("node_command", "node"))
        self.lore_var = tk.StringVar(value=self.settings.get("lore_command", "lore"))
        self.cli_var = tk.StringVar(
            value=self.settings.get("cli_path", str(BridgeClient.default_cli_path()))
        )
        self.status_var = tk.StringVar(value="Describe the task and choose Lore evidence.")

        self._build_style()
        self._build_ui()
        self.root.after(100, self._poll_events)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_style(self) -> None:
        style = ttk.Style(self.root)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("Heading.TLabel", font=("TkDefaultFont", 15, "bold"))
        style.configure("Muted.TLabel", foreground="#555555")
        style.configure("Accent.TButton", padding=(12, 7))

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=12)
        outer.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(outer)
        header.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(header, text="Evidence-backed AI Handoff", style="Heading.TLabel").pack(
            side=tk.LEFT
        )
        ttk.Label(
            header,
            text="Lore evidence · Git coordinates · no model call",
            style="Muted.TLabel",
        ).pack(side=tk.RIGHT)

        task_frame = ttk.LabelFrame(outer, text="1. Continuation task", padding=10)
        task_frame.pack(fill=tk.X, pady=(0, 10))
        ttk.Entry(task_frame, textvariable=self.task_var).pack(fill=tk.X)

        evidence = ttk.LabelFrame(outer, text="2. Lore evidence", padding=10)
        evidence.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(evidence, text="Search query").grid(row=0, column=0, sticky="w")
        ttk.Entry(evidence, textvariable=self.query_var).grid(
            row=0, column=1, columnspan=5, sticky="ew", padx=(8, 0)
        )
        ttk.Label(evidence, text="Exact message IDs (one per line)").grid(
            row=1, column=0, sticky="nw", pady=(8, 0)
        )
        self.ids_text = scrolledtext.ScrolledText(evidence, height=4, wrap=tk.NONE)
        self.ids_text.grid(row=1, column=1, columnspan=5, sticky="ew", padx=(8, 0), pady=(8, 0))
        ttk.Label(evidence, text="Search anchors").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Spinbox(evidence, from_=1, to=50, textvariable=self.limit_var, width=7).grid(
            row=2, column=1, sticky="w", padx=(8, 18), pady=(8, 0)
        )
        ttk.Label(evidence, text="Context messages / anchor").grid(
            row=2, column=2, sticky="w", pady=(8, 0)
        )
        ttk.Spinbox(evidence, from_=1, to=101, textvariable=self.context_var, width=7).grid(
            row=2, column=3, sticky="w", padx=(8, 18), pady=(8, 0)
        )
        ttk.Label(evidence, text="Lore command").grid(row=2, column=4, sticky="w", pady=(8, 0))
        ttk.Entry(evidence, textvariable=self.lore_var, width=18).grid(
            row=2, column=5, sticky="ew", padx=(8, 0), pady=(8, 0)
        )
        evidence.columnconfigure(1, weight=1)
        evidence.columnconfigure(5, weight=1)

        repo = ttk.LabelFrame(outer, text="3. Repository coordinates", padding=10)
        repo.pack(fill=tk.X, pady=(0, 10))
        ttk.Entry(repo, textvariable=self.repo_var).grid(row=0, column=0, sticky="ew")
        ttk.Button(repo, text="Choose…", command=self._browse_repo).grid(row=0, column=1, padx=(8, 0))
        ttk.Checkbutton(repo, text="Omit repository", variable=self.no_repo_var).grid(
            row=1, column=0, sticky="w", pady=(8, 0)
        )
        ttk.Checkbutton(
            repo,
            text="Include absolute local path in handoff",
            variable=self.local_path_var,
        ).grid(row=1, column=1, sticky="e", pady=(8, 0))
        repo.columnconfigure(0, weight=1)

        output = ttk.LabelFrame(outer, text="4. Output", padding=10)
        output.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(output, text="Format").grid(row=0, column=0, sticky="w")
        ttk.Combobox(
            output,
            textvariable=self.format_var,
            values=("markdown", "json"),
            state="readonly",
            width=12,
        ).grid(row=0, column=1, sticky="w", padx=(8, 18))
        ttk.Entry(output, textvariable=self.output_var).grid(row=0, column=2, sticky="ew")
        ttk.Button(output, text="Save as…", command=self._browse_output).grid(
            row=0, column=3, padx=(8, 0)
        )
        output.columnconfigure(2, weight=1)

        runtime = ttk.LabelFrame(outer, text="Runtime", padding=10)
        runtime.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(runtime, text="Node").grid(row=0, column=0, sticky="w")
        ttk.Entry(runtime, textvariable=self.node_var, width=14).grid(row=0, column=1, padx=(6, 14))
        ttk.Label(runtime, text="ContinuityBridge CLI").grid(row=0, column=2, sticky="w")
        ttk.Entry(runtime, textvariable=self.cli_var).grid(row=0, column=3, sticky="ew", padx=(6, 6))
        ttk.Button(runtime, text="Browse…", command=self._browse_cli).grid(row=0, column=4)
        runtime.columnconfigure(3, weight=1)

        preview_frame = ttk.LabelFrame(outer, text="Handoff preview", padding=8)
        preview_frame.pack(fill=tk.BOTH, expand=True)
        self.preview = scrolledtext.ScrolledText(preview_frame, wrap=tk.WORD, state=tk.DISABLED)
        self.preview.pack(fill=tk.BOTH, expand=True)

        actions = ttk.Frame(outer)
        actions.pack(fill=tk.X, pady=(10, 0))
        ttk.Label(actions, textvariable=self.status_var).pack(side=tk.LEFT)
        self.progress = ttk.Progressbar(actions, mode="indeterminate", length=150)
        self.progress.pack(side=tk.LEFT, padx=10)
        self.write_button = ttk.Button(
            actions, text="Build handoff", style="Accent.TButton", command=self._write
        )
        self.write_button.pack(side=tk.RIGHT)
        self.preview_button = ttk.Button(actions, text="Preview", command=self._preview)
        self.preview_button.pack(side=tk.RIGHT, padx=(0, 8))

    def _client(self) -> HandoffClient:
        return HandoffClient(
            node_command=self.node_var.get().strip() or "node",
            cli_path=self.cli_var.get().strip() or None,
        )

    def _options(self, *, output_path: str | None) -> HandoffOptions:
        message_ids = tuple(
            line.strip() for line in self.ids_text.get("1.0", tk.END).splitlines() if line.strip()
        )
        repository = self.repo_var.get().strip() or None
        no_repository = self.no_repo_var.get()
        if no_repository:
            repository = None
        return HandoffOptions(
            task=self.task_var.get(),
            query=self.query_var.get().strip() or None,
            message_ids=message_ids,
            repository_path=repository,
            no_repository=no_repository,
            include_local_path=self.local_path_var.get(),
            lore_command=self.lore_var.get().strip() or "lore",
            limit=int(self.limit_var.get()),
            context_messages=int(self.context_var.get()),
            output_path=output_path,
            output_format=self.format_var.get(),
        )

    def _set_busy(self, busy: bool, status: str) -> None:
        self.busy = busy
        self.status_var.set(status)
        state = tk.DISABLED if busy else tk.NORMAL
        self.preview_button.configure(state=state)
        self.write_button.configure(state=state)
        if busy:
            self.progress.start(12)
        else:
            self.progress.stop()

    def _run(self, *, write: bool) -> None:
        if self.busy:
            return
        output_path = self.output_var.get().strip() if write else None
        if write and not output_path:
            self._browse_output()
            output_path = self.output_var.get().strip()
            if not output_path:
                return
        try:
            options = self._options(output_path=output_path)
            command = self._client().build_command(options)
        except (ValueError, tk.TclError) as error:
            messagebox.showerror(APP_TITLE, str(error))
            return
        self._set_busy(True, "Building evidence handoff…")

        def worker() -> None:
            try:
                result = self._client().run(command)
                self.events.put(("written" if write else "preview", (result.stdout, output_path)))
            except Exception as error:
                self.events.put(("error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _preview(self) -> None:
        self._run(write=False)

    def _write(self) -> None:
        self._run(write=True)

    def _poll_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "preview":
                    text, _ = payload
                    self._show_preview(text)
                    self._set_busy(False, "Preview ready.")
                elif kind == "written":
                    text, path = payload
                    self._show_preview(text or f"Handoff written to {path}")
                    self._set_busy(False, f"Handoff written: {path}")
                    messagebox.showinfo(APP_TITLE, f"Handoff written to:\n{path}")
                elif kind == "error":
                    self._set_busy(False, "Handoff failed.")
                    messagebox.showerror(APP_TITLE, str(payload))
        except queue.Empty:
            pass
        self.root.after(100, self._poll_events)

    def _show_preview(self, text: str) -> None:
        self.preview.configure(state=tk.NORMAL)
        self.preview.delete("1.0", tk.END)
        self.preview.insert("1.0", text)
        self.preview.configure(state=tk.DISABLED)

    def _browse_repo(self) -> None:
        path = filedialog.askdirectory(title="Choose Git repository")
        if path:
            self.repo_var.set(path)
            self.no_repo_var.set(False)

    def _browse_output(self) -> None:
        extension = ".json" if self.format_var.get() == "json" else ".md"
        path = filedialog.asksaveasfilename(
            title="Save ContinuityBridge handoff",
            defaultextension=extension,
            filetypes=(("Handoff files", f"*{extension}"), ("All files", "*.*")),
        )
        if path:
            self.output_var.set(path)

    def _browse_cli(self) -> None:
        path = filedialog.askopenfilename(title="Choose ContinuityBridge CLI")
        if path:
            self.cli_var.set(path)

    def _load_settings(self) -> dict:
        try:
            data = json.loads(SETTINGS_PATH.read_text(encoding="utf8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_settings(self) -> None:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "repository": self.repo_var.get().strip(),
            "no_repository": self.no_repo_var.get(),
            "include_local_path": self.local_path_var.get(),
            "output": self.output_var.get().strip(),
            "format": self.format_var.get(),
            "limit": int(self.limit_var.get()),
            "context_messages": int(self.context_var.get()),
            "node_command": self.node_var.get().strip() or "node",
            "lore_command": self.lore_var.get().strip() or "lore",
            "cli_path": self.cli_var.get().strip(),
        }
        SETTINGS_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf8")

    def _on_close(self) -> None:
        try:
            self._save_settings()
        finally:
            self.root.destroy()


def main() -> None:
    root = tk.Tk()
    HandoffBuilderApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
