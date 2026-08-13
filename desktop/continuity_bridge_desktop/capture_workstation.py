"""Explicit live-capture product surface for the ContinuityBridge Workstation."""

from __future__ import annotations

from pathlib import Path
import secrets
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

from .capture_client import (
    CaptureClient,
    CaptureOptions,
    CaptureServerProcess,
    browser_extension_path,
)
from .repository_workstation import RepositoryAwareWorkstation
from .workstation import APP_TITLE


class CaptureAwareWorkstation(RepositoryAwareWorkstation):
    """Add explicit local/browser capture without hidden scraping or provider APIs."""

    def __init__(self, root: tk.Tk) -> None:
        self.capture_port_var = tk.StringVar(master=root, value="43119")
        self.capture_token_var = tk.StringVar(master=root, value=secrets.token_urlsafe(24))
        self.capture_project_var = tk.StringVar(master=root, value="")
        self.capture_source_var = tk.StringVar(master=root, value="")
        self.capture_file_var = tk.StringVar(master=root, value="")
        self.capture_receiver_var = tk.StringVar(master=root, value="OFF")
        self.capture_destination_var = tk.StringVar(master=root, value="Lore (receiver stopped)")
        self.capture_server = CaptureServerProcess()
        super().__init__(root)
        self.capture_port_var.set(str(self.settings.get("capture_port", 43119)))
        self.capture_project_var.set(str(self.settings.get("capture_project", "")))
        self.capture_source_var.set(str(self.settings.get("capture_source", "")))

    def _build_ui(self) -> None:
        super()._build_ui()
        self.capture_tab = ttk.Frame(self.notebook, padding=12)
        self.notebook.insert(4, self.capture_tab, text="Capture")
        self._build_capture()

    def _build_capture(self) -> None:
        intro = ttk.Frame(self.capture_tab)
        intro.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(intro, text="Explicit live capture", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(
            intro,
            text=(
                "Capture is OFF until you start it. The browser companion only reads a supported visible conversation "
                "after you click Capture, sends it to 127.0.0.1 with the token below, and ContinuityBridge writes it "
                "through Lore's public push contract."
            ),
            style="Muted.TLabel",
            wraplength=1080,
        ).pack(anchor="w", pady=(4, 0))

        receiver = ttk.LabelFrame(self.capture_tab, text="Local receiver", padding=10)
        receiver.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(receiver, text="State").grid(row=0, column=0, sticky="w")
        ttk.Label(receiver, textvariable=self.capture_receiver_var, style="CardHeading.TLabel").grid(
            row=0, column=1, sticky="w", padx=(8, 18)
        )
        ttk.Label(receiver, text="Destination").grid(row=0, column=2, sticky="w")
        ttk.Label(receiver, textvariable=self.capture_destination_var).grid(row=0, column=3, sticky="w", padx=(8, 0))

        ttk.Label(receiver, text="Port").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(receiver, textvariable=self.capture_port_var, width=10).grid(
            row=1, column=1, sticky="w", padx=(8, 18), pady=(8, 0)
        )
        ttk.Label(receiver, text="Browser token").grid(row=1, column=2, sticky="w", pady=(8, 0))
        ttk.Entry(receiver, textvariable=self.capture_token_var, show="•").grid(
            row=1, column=3, sticky="ew", padx=(8, 8), pady=(8, 0)
        )
        ttk.Button(receiver, text="Copy token", command=self._copy_capture_token).grid(row=1, column=4, pady=(8, 0))
        ttk.Button(receiver, text="New token", command=self._new_capture_token).grid(
            row=1, column=5, padx=(6, 0), pady=(8, 0)
        )

        ttk.Label(receiver, text="Project override").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(receiver, textvariable=self.capture_project_var).grid(
            row=2, column=1, columnspan=2, sticky="ew", padx=(8, 18), pady=(8, 0)
        )
        ttk.Label(receiver, text="Source override").grid(row=2, column=3, sticky="w", pady=(8, 0))
        ttk.Entry(receiver, textvariable=self.capture_source_var, width=24).grid(
            row=2, column=4, columnspan=2, sticky="ew", padx=(8, 0), pady=(8, 0)
        )
        ttk.Label(
            receiver,
            text="Leave overrides blank to use provider-live source and a title-derived live project.",
            style="Muted.TLabel",
        ).grid(row=3, column=0, columnspan=4, sticky="w", pady=(6, 0))
        controls = ttk.Frame(receiver)
        controls.grid(row=3, column=4, columnspan=2, sticky="e", pady=(6, 0))
        self.capture_start_button = ttk.Button(
            controls, text="Start receiver", style="Accent.TButton", command=self._start_capture_receiver
        )
        self.capture_start_button.pack(side=tk.LEFT)
        self.capture_stop_button = ttk.Button(controls, text="Stop", command=self._stop_capture_receiver)
        self.capture_stop_button.pack(side=tk.LEFT, padx=(6, 0))
        receiver.columnconfigure(3, weight=1)
        receiver.columnconfigure(4, weight=1)

        browser = ttk.LabelFrame(self.capture_tab, text="Browser companion", padding=10)
        browser.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(
            browser,
            text=(
                "Load the bundled Manifest V3 extension as an unpacked extension. Paste this Workstation's token and "
                "port into the popup. Nothing runs in the page until you press Capture current conversation."
            ),
            wraplength=1000,
        ).pack(anchor="w")
        extension_path = browser_extension_path()
        ttk.Label(browser, text=str(extension_path), style="Muted.TLabel").pack(anchor="w", pady=(6, 0))
        ttk.Button(browser, text="Copy browser setup", command=self._copy_browser_setup).pack(anchor="w", pady=(7, 0))

        manual = ttk.LabelFrame(self.capture_tab, text="Local/manual capture file", padding=10)
        manual.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(
            manual,
            text=(
                "For a local tool or desktop surface that can emit the public live-capture JSON contract, inspect the "
                "file first or explicitly submit it to Lore. This is the supported path when no stable native transcript "
                "surface exists."
            ),
            wraplength=1000,
        ).grid(row=0, column=0, columnspan=4, sticky="w")
        ttk.Entry(manual, textvariable=self.capture_file_var).grid(row=1, column=0, sticky="ew", pady=(8, 0))
        ttk.Button(manual, text="Browse…", command=self._browse_capture_file).grid(row=1, column=1, padx=(6, 0), pady=(8, 0))
        ttk.Button(manual, text="Inspect", command=self._inspect_capture_file).grid(row=1, column=2, padx=(6, 0), pady=(8, 0))
        ttk.Button(
            manual,
            text="Submit to Lore",
            style="Accent.TButton",
            command=self._submit_capture_file,
        ).grid(row=1, column=3, padx=(6, 0), pady=(8, 0))
        manual.columnconfigure(0, weight=1)

        output = ttk.LabelFrame(self.capture_tab, text="Last capture result", padding=8)
        output.pack(fill=tk.BOTH, expand=True)
        self.capture_result_text = scrolledtext.ScrolledText(output, height=8, wrap=tk.WORD, state=tk.DISABLED)
        self.capture_result_text.pack(fill=tk.BOTH, expand=True)
        self._replace_text(
            self.capture_result_text,
            "Receiver is OFF. Start it for browser capture, or choose a live-capture JSON file for manual inspection.",
        )

    def _capture_options(self) -> CaptureOptions:
        return CaptureOptions(
            lore_command=self.lore_var.get().strip() or "lore",
            project=self.capture_project_var.get().strip() or None,
            source=self.capture_source_var.get().strip() or None,
        )

    def _port(self) -> int:
        try:
            port = int(self.capture_port_var.get().strip())
        except ValueError as error:
            raise ValueError("Capture receiver port must be a number from 1 to 65535.") from error
        if not 1 <= port <= 65535:
            raise ValueError("Capture receiver port must be between 1 and 65535.")
        return port

    def _start_capture_receiver(self) -> None:
        if self.capture_server.running:
            messagebox.showinfo(APP_TITLE, "The live capture receiver is already ON.")
            return
        try:
            port = self._port()
            token = self.capture_token_var.get().strip()
            options = self._capture_options()
            self.capture_server.client.build_server_command(port=port, token=token, options=options)
        except ValueError as error:
            messagebox.showerror(APP_TITLE, str(error))
            return
        self.capture_receiver_var.set("STARTING…")
        self.status_var.set("Starting explicit loopback capture receiver…")
        self._run_async(
            "capture_start",
            lambda: self.capture_server.start(port=port, token=token, options=options),
        )

    def _event_capture_start(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.capture_receiver_var.set("OFF")
            self.capture_destination_var.set("Lore (receiver stopped)")
            self.status_var.set("Live capture receiver failed to start.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self.capture_receiver_var.set(f"ON — 127.0.0.1:{payload.get('port')}")
        self.capture_destination_var.set(f"Lore via {self.lore_var.get().strip() or 'lore'}")
        self._replace_text(
            self.capture_result_text,
            "Receiver is ON. Browser captures now require this Workstation token and an explicit Capture click.",
        )
        self.status_var.set("Explicit live capture receiver is ON.")

    def _stop_capture_receiver(self) -> None:
        self.capture_server.stop()
        self.capture_receiver_var.set("OFF")
        self.capture_destination_var.set("Lore (receiver stopped)")
        self.status_var.set("Live capture receiver is OFF.")

    def _copy_capture_token(self) -> None:
        token = self.capture_token_var.get().strip()
        self.root.clipboard_clear()
        self.root.clipboard_append(token)
        self.status_var.set("Browser receiver token copied.")

    def _new_capture_token(self) -> None:
        if self.capture_server.running:
            messagebox.showinfo(APP_TITLE, "Stop the receiver before changing its token.")
            return
        self.capture_token_var.set(secrets.token_urlsafe(24))
        self.status_var.set("Generated a new browser receiver token.")

    def _copy_browser_setup(self) -> None:
        text = (
            f"ContinuityBridge browser companion folder:\n{browser_extension_path()}\n\n"
            f"Receiver: http://127.0.0.1:{self.capture_port_var.get().strip()}\n"
            f"Token: {self.capture_token_var.get().strip()}\n\n"
            "Load the folder as an unpacked extension. Start the receiver in ContinuityBridge before capturing."
        )
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.status_var.set("Browser companion setup copied.")

    def _browse_capture_file(self) -> None:
        path = filedialog.askopenfilename(
            title="Choose ContinuityBridge live-capture JSON",
            filetypes=[("JSON", "*.json"), ("All files", "*.*")],
        )
        if path:
            self.capture_file_var.set(path)

    def _inspect_capture_file(self) -> None:
        path = self.capture_file_var.get().strip()
        if not path:
            messagebox.showinfo(APP_TITLE, "Choose a live-capture JSON file first.")
            return
        client = CaptureClient()
        self.status_var.set("Inspecting live-capture JSON without mutation…")
        self._run_async("capture_inspect", lambda: client.inspect_file(path))

    def _event_capture_inspect(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set("Live-capture inspection failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self._replace_text(
            self.capture_result_text,
            f"Source: {payload.get('source')}\nConversation: {payload.get('title')}\n"
            f"ID: {payload.get('conversationId')}\nMessages: {payload.get('messageCount')}\n"
            f"Source URL: {payload.get('sourceUrl') or 'not included'}",
        )
        self.status_var.set("Live-capture file inspected; nothing was written.")

    def _submit_capture_file(self) -> None:
        path = self.capture_file_var.get().strip()
        if not path:
            messagebox.showinfo(APP_TITLE, "Choose a live-capture JSON file first.")
            return
        client = CaptureClient()
        options = self._capture_options()
        self.status_var.set("Submitting explicit live capture to Lore…")
        self._run_async("capture_submit", lambda: client.submit_file(path, options))

    def _event_capture_submit(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set("Live-capture submission failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self._replace_text(
            self.capture_result_text,
            f"Status: {payload.get('status')}\nSource file: {payload.get('sourceFileId')}\n"
            f"Messages: {payload.get('messageCount')}\nDestination: Lore",
        )
        self.status_var.set("Live capture is current in Lore." if payload.get("status") == "unchanged" else "Live capture imported into Lore.")

    def _save_settings(self) -> None:
        self.settings["capture_port"] = self.capture_port_var.get().strip() or "43119"
        self.settings["capture_project"] = self.capture_project_var.get().strip()
        self.settings["capture_source"] = self.capture_source_var.get().strip()
        super()._save_settings()

    def _on_close(self) -> None:
        self.capture_server.stop()
        super()._on_close()
