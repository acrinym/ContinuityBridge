"""Tkinter Handoff Builder for bounded Lore evidence and portable local artifacts."""

from __future__ import annotations

import json
from pathlib import Path
import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

from .client import BridgeClient
from .handoff_client import HandoffClient, HandoffOptions
from .portable_client import PortableClient


APP_TITLE = "ContinuityBridge Handoff Builder"
SETTINGS_PATH = Path.home() / ".continuity-bridge" / "handoff-builder.json"


class HandoffBuilderApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("1100x860")
        self.root.minsize(860, 680)
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.settings = self._load_settings()
        self.busy = False
        self.attachment_items: list[dict] = []

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
        self.attachment_provider_var = tk.StringVar(
            value=self.settings.get("attachment_provider", "chatgpt")
        )
        self.attachment_export_var = tk.StringVar(
            value=self.settings.get("attachment_export", "")
        )
        self.attachment_bundle_var = tk.StringVar(
            value=self.settings.get("attachment_bundle", "")
        )
        self.overwrite_attachments_var = tk.BooleanVar(
            value=self.settings.get("overwrite_attachments", False)
        )
        self.attachment_status_var = tk.StringVar(
            value="Optional: scan a ChatGPT or Claude export and select local artifacts to carry."
        )
        self.status_var = tk.StringVar(value="Describe the task and choose Lore evidence.")

        # Portable bundle variables
        self.portable_encrypt_input_var = tk.StringVar()
        self.portable_encrypt_output_var = tk.StringVar()
        self.portable_inspect_input_var = tk.StringVar()
        self.portable_restore_input_var = tk.StringVar()
        self.portable_restore_output_var = tk.StringVar()
        self.portable_passphrase_var = tk.StringVar()
        self.portable_passphrase_confirm_var = tk.StringVar()
        self.portable_status_var = tk.StringVar(value="Encrypted portable bundles")

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
            text="Lore evidence · Git coordinates · verified local artifacts · no model call",
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
        self.ids_text = scrolledtext.ScrolledText(evidence, height=3, wrap=tk.NONE)
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

        attachments = ttk.LabelFrame(outer, text="4. Safe attachments (optional)", padding=10)
        attachments.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(attachments, text="Provider").grid(row=0, column=0, sticky="w")
        ttk.Combobox(
            attachments,
            textvariable=self.attachment_provider_var,
            values=("chatgpt", "claude"),
            state="readonly",
            width=10,
        ).grid(row=0, column=1, sticky="w", padx=(8, 12))
        ttk.Entry(attachments, textvariable=self.attachment_export_var).grid(
            row=0, column=2, sticky="ew"
        )
        ttk.Button(attachments, text="File…", command=self._browse_attachment_file).grid(
            row=0, column=3, padx=(8, 0)
        )
        ttk.Button(attachments, text="Folder…", command=self._browse_attachment_folder).grid(
            row=0, column=4, padx=(6, 0)
        )
        self.scan_button = ttk.Button(attachments, text="Scan", command=self._scan_attachments)
        self.scan_button.grid(row=0, column=5, padx=(6, 0))

        self.attachment_list = tk.Listbox(
            attachments,
            height=4,
            selectmode=tk.EXTENDED,
            exportselection=False,
        )
        self.attachment_list.grid(row=1, column=0, columnspan=6, sticky="ew", pady=(8, 4))
        ttk.Label(
            attachments,
            textvariable=self.attachment_status_var,
            style="Muted.TLabel",
        ).grid(row=2, column=0, columnspan=6, sticky="w")

        ttk.Label(attachments, text="Bundle directory").grid(row=3, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(attachments, textvariable=self.attachment_bundle_var).grid(
            row=3, column=1, columnspan=3, sticky="ew", padx=(8, 0), pady=(8, 0)
        )
        ttk.Button(attachments, text="Choose…", command=self._browse_attachment_bundle).grid(
            row=3, column=4, padx=(8, 0), pady=(8, 0)
        )
        ttk.Checkbutton(
            attachments,
            text="Replace conflicting copied files after hash comparison",
            variable=self.overwrite_attachments_var,
        ).grid(row=3, column=5, sticky="e", padx=(8, 0), pady=(8, 0))
        attachments.columnconfigure(2, weight=1)
        attachments.columnconfigure(3, weight=1)

        output = ttk.LabelFrame(outer, text="5. Output", padding=10)
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
        ttk.Label(
            output,
            text="When attachments are selected, Build writes HANDOFF inside the bundle directory.",
            style="Muted.TLabel",
        ).grid(row=1, column=2, columnspan=2, sticky="w", pady=(5, 0))
        output.columnconfigure(2, weight=1)

        # Portable encrypted bundle section
        portable = ttk.LabelFrame(outer, text="6. Encrypted portable bundle", padding=10)
        portable.pack(fill=tk.X, pady=(0, 10))

        # Encrypt section
        encrypt_frame = ttk.Frame(portable)
        encrypt_frame.pack(fill=tk.X, pady=(0, 5))
        ttk.Label(encrypt_frame, text="Encrypt:", width=10).pack(side=tk.LEFT)
        ttk.Entry(encrypt_frame, textvariable=self.portable_encrypt_input_var, width=30).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(encrypt_frame, text="Browse…", command=self._browse_portable_encrypt_input).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Label(encrypt_frame, text="Output:").pack(side=tk.LEFT, padx=(10, 0))
        ttk.Entry(encrypt_frame, textvariable=self.portable_encrypt_output_var, width=20).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(encrypt_frame, text="Save as…", command=self._browse_portable_encrypt_output).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(encrypt_frame, text="Encrypt", command=self._encrypt_portable).pack(side=tk.LEFT, padx=(10, 0))

        # Passphrase for encrypt
        passphrase_frame = ttk.Frame(portable)
        passphrase_frame.pack(fill=tk.X, pady=(0, 5))
        ttk.Label(passphrase_frame, text="Passphrase:", width=10).pack(side=tk.LEFT)
        ttk.Entry(passphrase_frame, textvariable=self.portable_passphrase_var, show="*", width=25).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Label(passphrase_frame, text="Confirm:").pack(side=tk.LEFT, padx=(10, 0))
        ttk.Entry(passphrase_frame, textvariable=self.portable_passphrase_confirm_var, show="*", width=25).pack(side=tk.LEFT, padx=(0, 5))

        # Inspect and Restore section
        inspect_restore_frame = ttk.Frame(portable)
        inspect_restore_frame.pack(fill=tk.X, pady=(0, 5))
        ttk.Label(inspect_restore_frame, text="Inspect:", width=10).pack(side=tk.LEFT)
        ttk.Entry(inspect_restore_frame, textvariable=self.portable_inspect_input_var, width=30).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(inspect_restore_frame, text="Browse…", command=self._browse_portable_inspect_input).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(inspect_restore_frame, text="Inspect", command=self._inspect_portable).pack(side=tk.LEFT, padx=(10, 0))

        restore_frame = ttk.Frame(portable)
        restore_frame.pack(fill=tk.X, pady=(0, 5))
        ttk.Label(restore_frame, text="Restore:", width=10).pack(side=tk.LEFT)
        ttk.Entry(restore_frame, textvariable=self.portable_restore_input_var, width=30).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(restore_frame, text="Browse…", command=self._browse_portable_restore_input).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Label(restore_frame, text="To:").pack(side=tk.LEFT, padx=(10, 0))
        ttk.Entry(restore_frame, textvariable=self.portable_restore_output_var, width=20).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(restore_frame, text="Browse…", command=self._browse_portable_restore_output).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(restore_frame, text="Restore", command=self._restore_portable).pack(side=tk.LEFT, padx=(10, 0))

        ttk.Label(portable, textvariable=self.portable_status_var, style="Muted.TLabel").pack(anchor="w")

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

    def _selected_attachments(self) -> tuple[str, ...]:
        ids: list[str] = []
        for index in self.attachment_list.curselection():
            if 0 <= index < len(self.attachment_items):
                attachment_id = str(self.attachment_items[index].get("id", "")).strip()
                if attachment_id:
                    ids.append(attachment_id)
        return tuple(ids)

    def _options(self, *, output_path: str | None, write: bool) -> HandoffOptions:
        message_ids = tuple(
            line.strip() for line in self.ids_text.get("1.0", tk.END).splitlines() if line.strip()
        )
        repository = self.repo_var.get().strip() or None
        no_repository = self.no_repo_var.get()
        if no_repository:
            repository = None

        selected_attachments = self._selected_attachments()
        attachment_export = self.attachment_export_var.get().strip()
        attachment_provider: str | None = None
        attachment_bundle: str | None = None
        if attachment_export:
            if not self.attachment_items:
                raise ValueError("Scan the attachment export before building the handoff.")
            if not selected_attachments:
                raise ValueError("Select one or more attachment references, or clear the attachment export field.")
            attachment_provider = self.attachment_provider_var.get().strip().lower()
            if write:
                attachment_bundle = self.attachment_bundle_var.get().strip() or None
                if not attachment_bundle:
                    raise ValueError("Choose a bundle directory before building selected attachments.")

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
            attachment_provider=attachment_provider,
            attachment_export=attachment_export or None,
            attachment_ids=selected_attachments,
            attachment_bundle=attachment_bundle,
            overwrite_attachments=self.overwrite_attachments_var.get(),
        )

    def _set_busy(self, busy: bool, status: str) -> None:
        self.busy = busy
        self.status_var.set(status)
        state = tk.DISABLED if busy else tk.NORMAL
        self.preview_button.configure(state=state)
        self.write_button.configure(state=state)
        self.scan_button.configure(state=state)
        if busy:
            self.progress.start(12)
        else:
            self.progress.stop()

    def _scan_attachments(self) -> None:
        if self.busy:
            return
        provider = self.attachment_provider_var.get().strip().lower()
        export_path = self.attachment_export_var.get().strip()
        client = self._client()
        try:
            client.build_attachment_scan_command(provider, export_path)
        except ValueError as error:
            messagebox.showerror(APP_TITLE, str(error))
            return
        self._set_busy(True, "Scanning export attachment references…")

        def worker() -> None:
            try:
                result = client.scan_attachments(provider, export_path)
                self.events.put(("attachments", result))
            except Exception as error:
                self.events.put(("error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _run(self, *, write: bool) -> None:
        if self.busy:
            return

        has_selected_attachments = bool(self._selected_attachments())
        if write and has_selected_attachments and not self.attachment_bundle_var.get().strip():
            self._browse_attachment_bundle()
            if not self.attachment_bundle_var.get().strip():
                return

        output_path = None if has_selected_attachments else (self.output_var.get().strip() if write else None)
        if write and not has_selected_attachments and not output_path:
            self._browse_output()
            output_path = self.output_var.get().strip()
            if not output_path:
                return

        try:
            options = self._options(output_path=output_path, write=write)
            client = self._client()
            command = client.build_command(options)
        except (ValueError, tk.TclError) as error:
            messagebox.showerror(APP_TITLE, str(error))
            return

        if write and options.attachment_bundle:
            extension = ".json" if options.output_format == "json" else ".md"
            display_path = str(Path(options.attachment_bundle) / f"HANDOFF{extension}")
        else:
            display_path = output_path
        self._set_busy(True, "Building portable handoff…" if write else "Building handoff preview…")

        def worker() -> None:
            try:
                result = client.run(command)
                self.events.put(("written" if write else "preview", (result.stdout, display_path)))
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
                try:
                    if kind == "attachments":
                        self._show_attachment_scan(payload)
                        self._set_busy(False, "Attachment scan ready.")
                    elif kind == "preview":
                        text, _ = payload
                        self._show_preview(text)
                        self._set_busy(False, "Preview ready.")
                    elif kind == "written":
                        text, path = payload
                        self._show_preview(text or f"Handoff written to {path}")
                        self._set_busy(False, f"Handoff written: {path}")
                        messagebox.showinfo(APP_TITLE, f"Portable handoff written to:\n{path}")
                    elif kind == "error":
                        self._set_busy(False, "Operation failed.")
                        messagebox.showerror(APP_TITLE, str(payload))
                    elif kind == "portable_encrypt":
                        self._set_busy(False, "Encryption complete.")
                        self.portable_status_var.set(f"Encrypted bundle saved to: {payload}")
                        messagebox.showinfo(APP_TITLE, f"Encrypted bundle saved to:\n{payload}")
                    elif kind == "portable_inspect":
                        self._set_busy(False, "Inspection complete.")
                        self._show_preview(payload)
                        self.portable_status_var.set("Inspection complete.")
                    elif kind == "portable_restore":
                        path, text = payload
                        self._set_busy(False, "Restore complete.")
                        self.portable_status_var.set(f"Restored to: {path}")
                        messagebox.showinfo(APP_TITLE, f"Restored to:\n{path}\n\n{text}")
                    elif kind == "portable_error":
                        self._set_busy(False, "Portable operation failed.")
                        messagebox.showerror(APP_TITLE, str(payload))
                except Exception as error:
                    self._set_busy(False, "UI update failed.")
                    messagebox.showerror(APP_TITLE, str(error))
        except queue.Empty:
            pass
        finally:
            self.root.after(100, self._poll_events)

    def _show_attachment_scan(self, result: dict) -> None:
        self.attachment_items = list(result.get("attachments", []))
        self.attachment_list.delete(0, tk.END)
        for item in self.attachment_items:
            status = item.get("status", "unknown")
            mime = item.get("mimeType") or "unknown type"
            name = item.get("name") or "unnamed attachment"
            self.attachment_list.insert(tk.END, f"{name} — {status} — {mime} — {item.get('id', '')}")
        self.attachment_status_var.set(
            f"{result.get('attachmentCount', 0)} references · "
            f"{result.get('availableCount', 0)} local · "
            f"{result.get('unavailableCount', 0)} unavailable. Select exactly what to carry."
        )

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

    def _browse_attachment_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose ChatGPT or Claude export",
            filetypes=(("Export files", "*.zip *.json"), ("All files", "*.*")),
        )
        if path:
            self.attachment_export_var.set(path)
            self.attachment_items = []
            self.attachment_list.delete(0, tk.END)

    def _browse_attachment_folder(self) -> None:
        path = filedialog.askdirectory(title="Choose extracted ChatGPT or Claude export")
        if path:
            self.attachment_export_var.set(path)
            self.attachment_items = []
            self.attachment_list.delete(0, tk.END)

    def _browse_attachment_bundle(self) -> None:
        path = filedialog.askdirectory(title="Choose portable handoff bundle directory")
        if path:
            self.attachment_bundle_var.set(path)

    def _browse_cli(self) -> None:
        path = filedialog.askopenfilename(title="Choose ContinuityBridge CLI")
        if path:
            self.cli_var.set(path)

    def _portable_client(self) -> PortableClient:
        return PortableClient(
            node_command=self.node_var.get().strip() or "node",
            cli_path=self.cli_var.get().strip() or None,
        )

    def _browse_portable_encrypt_input(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose handoff or bundle to encrypt",
            filetypes=(
                ("Handoff files", "*.md *.json"),
                ("Bundle directories", ""),
                ("All files", "*.*"),
            ),
        )
        if path:
            self.portable_encrypt_input_var.set(path)

    def _browse_portable_encrypt_output(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Save encrypted bundle",
            defaultextension=".cbx",
            filetypes=(("Encrypted bundle", "*.cbx"), ("All files", "*.*")),
        )
        if path:
            self.portable_encrypt_output_var.set(path)

    def _browse_portable_inspect_input(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose encrypted bundle to inspect",
            filetypes=(("Encrypted bundle", "*.cbx"), ("All files", "*.*")),
        )
        if path:
            self.portable_inspect_input_var.set(path)

    def _browse_portable_restore_input(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose encrypted bundle to restore",
            filetypes=(("Encrypted bundle", "*.cbx"), ("All files", "*.*")),
        )
        if path:
            self.portable_restore_input_var.set(path)

    def _browse_portable_restore_output(self) -> None:
        path = filedialog.askdirectory(title="Choose restore destination directory")
        if path:
            self.portable_restore_output_var.set(path)

    def _encrypt_portable(self) -> None:
        if self.busy:
            return
        input_path = self.portable_encrypt_input_var.get().strip()
        output_path = self.portable_encrypt_output_var.get().strip()
        passphrase = self.portable_passphrase_var.get()
        confirm = self.portable_passphrase_confirm_var.get()

        if not input_path:
            messagebox.showerror(APP_TITLE, "Choose a handoff or bundle to encrypt.")
            return
        if not output_path:
            messagebox.showerror(APP_TITLE, "Choose an output file for the encrypted bundle.")
            return
        if not passphrase:
            messagebox.showerror(APP_TITLE, "Enter a passphrase.")
            return
        if passphrase != confirm:
            messagebox.showerror(APP_TITLE, "Passphrases do not match.")
            return

        self._set_busy(True, "Encrypting portable bundle…")
        client = self._portable_client()

        # Capture passphrase for worker, then clear from UI
        capture_passphrase = passphrase
        self.portable_passphrase_var.set("")
        self.portable_passphrase_confirm_var.set("")

        def worker() -> None:
            try:
                client.encrypt(input_path, output_path, capture_passphrase)
                self.events.put(("portable_encrypt", output_path))
            except Exception as error:
                self.events.put(("portable_error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _inspect_portable(self) -> None:
        if self.busy:
            return
        input_path = self.portable_inspect_input_var.get().strip()
        passphrase = self.portable_passphrase_var.get()

        if not input_path:
            messagebox.showerror(APP_TITLE, "Choose an encrypted bundle to inspect.")
            return
        if not passphrase:
            messagebox.showerror(APP_TITLE, "Enter the passphrase.")
            return

        self._set_busy(True, "Inspecting encrypted bundle…")
        client = self._portable_client()

        # Capture passphrase for worker, then clear from UI
        capture_passphrase = passphrase
        self.portable_passphrase_var.set("")

        def worker() -> None:
            try:
                result = client.inspect(input_path, capture_passphrase, json_output=False)
                self.events.put(("portable_inspect", result.get("stdout", "")))
            except Exception as error:
                self.events.put(("portable_error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _restore_portable(self) -> None:
        if self.busy:
            return
        input_path = self.portable_restore_input_var.get().strip()
        output_path = self.portable_restore_output_var.get().strip()
        passphrase = self.portable_passphrase_var.get()

        if not input_path:
            messagebox.showerror(APP_TITLE, "Choose an encrypted bundle to restore.")
            return
        if not output_path:
            messagebox.showerror(APP_TITLE, "Choose a destination directory.")
            return
        if not passphrase:
            messagebox.showerror(APP_TITLE, "Enter the passphrase.")
            return

        self._set_busy(True, "Restoring encrypted bundle…")
        client = self._portable_client()

        # Capture passphrase for worker, then clear from UI
        capture_passphrase = passphrase
        self.portable_passphrase_var.set("")

        def worker() -> None:
            try:
                result = client.restore(input_path, output_path, capture_passphrase, overwrite=False)
                self.events.put(("portable_restore", (output_path, result.get("stdout", ""))))
            except Exception as error:
                self.events.put(("portable_error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

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
            "attachment_provider": self.attachment_provider_var.get().strip(),
            "attachment_export": self.attachment_export_var.get().strip(),
            "attachment_bundle": self.attachment_bundle_var.get().strip(),
            "overwrite_attachments": self.overwrite_attachments_var.get(),
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
