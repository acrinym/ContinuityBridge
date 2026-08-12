"""Tkinter MCP connection and continuity verification center."""

from __future__ import annotations

from dataclasses import asdict
import json
from pathlib import Path
import queue
import threading
import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk

from .mcp_control import ClientStatus, ContinuityProof, LoreStatus, MCPControlClient


APP_TITLE = "ContinuityBridge MCP Control Center"
SETTINGS_PATH = Path.home() / ".continuity-bridge" / "desktop.json"
CLIENT_LABELS = {
    "codex": "Codex",
    "claude": "Claude Code",
    "cursor": "Cursor",
}


class MCPControlCenterApp:
    """Human-controlled local setup and proof surface for Lore MCP continuity."""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("1080x760")
        self.root.minsize(860, 620)
        self.settings = self._load_settings()
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.busy = False
        self.client_rows: dict[str, str] = {}
        self.client_statuses: dict[str, ClientStatus] = {}

        self.lore_var = tk.StringVar(value=self.settings.get("lore_command", "lore"))
        self.client_var = tk.StringVar(value=self.settings.get("mcp_client", "Codex"))
        self.query_var = tk.StringVar(value=self.settings.get("proof_query", ""))
        self.status_var = tk.StringVar(value="Run a local health check to begin.")
        self.lore_executable_var = tk.StringVar(value="Not checked")
        self.database_var = tk.StringVar(value="Not checked")
        self.cli_health_var = tk.StringVar(value="Not checked")
        self.mcp_health_var = tk.StringVar(value="Not checked")

        self._build_style()
        self._build_ui()
        self.client_var.trace_add("write", lambda *_: self._refresh_preview())
        self.lore_var.trace_add("write", lambda *_: self._refresh_preview())
        self._refresh_preview()
        self.root.after(100, self._poll_events)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    @staticmethod
    def _load_settings() -> dict:
        try:
            payload = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _save_settings(self) -> None:
        payload = dict(self.settings)
        payload.update(
            {
                "lore_command": self._lore_command(),
                "mcp_client": self.client_var.get(),
                "proof_query": self.query_var.get().strip(),
            }
        )
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = SETTINGS_PATH.with_name(f".{SETTINGS_PATH.name}.tmp")
        temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        temporary.replace(SETTINGS_PATH)

    def _build_style(self) -> None:
        style = ttk.Style(self.root)
        if "clam" in style.theme_names():
            style.theme_use("clam")
        style.configure("Heading.TLabel", font=("TkDefaultFont", 15, "bold"))
        style.configure("Muted.TLabel", foreground="#555555")
        style.configure("Treeview", rowheight=27)
        style.configure("Accent.TButton", padding=(12, 7))

    def _build_ui(self) -> None:
        outer = ttk.Frame(self.root, padding=12)
        outer.pack(fill=tk.BOTH, expand=True)

        header = ttk.Frame(outer)
        header.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(header, text="MCP Control Center", style="Heading.TLabel").pack(side=tk.LEFT)
        ttk.Label(
            header,
            text="Detect · preview · configure · prove",
            style="Muted.TLabel",
        ).pack(side=tk.RIGHT)

        stack = ttk.LabelFrame(outer, text="1. Local continuity stack", padding=10)
        stack.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(stack, text="Lore command").grid(row=0, column=0, sticky="w")
        ttk.Entry(stack, textvariable=self.lore_var, width=28).grid(
            row=0, column=1, sticky="w", padx=(6, 12)
        )
        self.refresh_button = ttk.Button(
            stack,
            text="Check everything",
            style="Accent.TButton",
            command=self._refresh_status,
        )
        self.refresh_button.grid(row=0, column=2, sticky="w")
        self.progress = ttk.Progressbar(stack, mode="indeterminate", length=150)
        self.progress.grid(row=0, column=3, sticky="w", padx=(12, 0))

        checks = ttk.Frame(stack)
        checks.grid(row=1, column=0, columnspan=4, sticky="ew", pady=(10, 0))
        self._status_row(checks, 0, "Lore executable", self.lore_executable_var)
        self._status_row(checks, 1, "Lore database", self.database_var)
        self._status_row(checks, 2, "Lore CLI", self.cli_health_var)
        self._status_row(checks, 3, "Lore MCP server", self.mcp_health_var)
        stack.columnconfigure(3, weight=1)

        clients = ttk.LabelFrame(outer, text="2. Client connections", padding=10)
        clients.pack(fill=tk.X, pady=(0, 10))
        columns = ("client", "installed", "configured", "detail")
        self.client_tree = ttk.Treeview(clients, columns=columns, show="headings", height=4)
        self.client_tree.heading("client", text="Client")
        self.client_tree.heading("installed", text="Installed")
        self.client_tree.heading("configured", text="Lore configured")
        self.client_tree.heading("detail", text="Details")
        self.client_tree.column("client", width=130, anchor="w")
        self.client_tree.column("installed", width=90, anchor="center")
        self.client_tree.column("configured", width=120, anchor="center")
        self.client_tree.column("detail", width=590, anchor="w")
        self.client_tree.pack(fill=tk.X, expand=True)
        self.client_tree.bind("<<TreeviewSelect>>", self._select_client_from_tree)

        middle = ttk.Panedwindow(outer, orient=tk.HORIZONTAL)
        middle.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        config_frame = ttk.LabelFrame(middle, text="3. Preview and apply configuration", padding=10)
        proof_frame = ttk.LabelFrame(middle, text="4. Prove continuity", padding=10)
        middle.add(config_frame, weight=1)
        middle.add(proof_frame, weight=1)

        chooser = ttk.Frame(config_frame)
        chooser.pack(fill=tk.X, pady=(0, 6))
        ttk.Label(chooser, text="Client").pack(side=tk.LEFT)
        ttk.Combobox(
            chooser,
            textvariable=self.client_var,
            values=("Codex", "Claude Code", "Cursor"),
            state="readonly",
            width=16,
        ).pack(side=tk.LEFT, padx=(6, 0))

        self.preview = scrolledtext.ScrolledText(config_frame, wrap=tk.NONE, height=16)
        self.preview.pack(fill=tk.BOTH, expand=True)
        config_actions = ttk.Frame(config_frame)
        config_actions.pack(fill=tk.X, pady=(8, 0))
        ttk.Button(config_actions, text="Copy preview", command=self._copy_preview).pack(
            side=tk.LEFT
        )
        self.apply_button = ttk.Button(
            config_actions,
            text="Apply after confirmation",
            style="Accent.TButton",
            command=self._apply_configuration,
        )
        self.apply_button.pack(side=tk.RIGHT)

        ttk.Label(
            proof_frame,
            text="Search for a phrase that should exist in imported history.",
            style="Muted.TLabel",
            wraplength=430,
        ).pack(anchor="w")
        query_row = ttk.Frame(proof_frame)
        query_row.pack(fill=tk.X, pady=(8, 6))
        ttk.Entry(query_row, textvariable=self.query_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True
        )
        self.proof_button = ttk.Button(
            query_row,
            text="Search + retrieve context",
            command=self._prove_continuity,
        )
        self.proof_button.pack(side=tk.LEFT, padx=(6, 0))

        self.proof_output = scrolledtext.ScrolledText(proof_frame, wrap=tk.WORD, height=16)
        self.proof_output.pack(fill=tk.BOTH, expand=True)
        self._replace_text(
            self.proof_output,
            "A successful proof searches Lore, takes the real message ID from the first hit, "
            "then retrieves the surrounding context. No IDs are invented.",
        )

        footer = ttk.Frame(outer)
        footer.pack(fill=tk.X)
        ttk.Label(footer, textvariable=self.status_var).pack(side=tk.LEFT)
        ttk.Button(footer, text="Copy activity", command=self._copy_activity).pack(side=tk.RIGHT)

        self.activity = scrolledtext.ScrolledText(outer, wrap=tk.WORD, height=6)
        self.activity.pack(fill=tk.X, pady=(6, 0))

    @staticmethod
    def _status_row(parent: ttk.Frame, row: int, label: str, variable: tk.StringVar) -> None:
        ttk.Label(parent, text=label, width=18).grid(row=row, column=0, sticky="w")
        ttk.Label(parent, textvariable=variable).grid(row=row, column=1, sticky="w")

    def _lore_command(self) -> str:
        """Read the Tk-backed Lore command on the main thread."""
        return self.lore_var.get().strip() or "lore"

    @staticmethod
    def _client_for(lore_command: str) -> MCPControlClient:
        return MCPControlClient(lore_command=lore_command)

    def _client(self) -> MCPControlClient:
        """Build a client from main-thread Tk state."""
        return self._client_for(self._lore_command())

    @staticmethod
    def _replace_text(widget: scrolledtext.ScrolledText, text: str) -> None:
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert(tk.END, text)
        widget.configure(state=tk.DISABLED)

    def _append_activity(self, text: str) -> None:
        self.activity.configure(state=tk.NORMAL)
        self.activity.insert(tk.END, text.rstrip() + "\n")
        self.activity.see(tk.END)
        self.activity.configure(state=tk.DISABLED)

    def _set_busy(self, busy: bool, status: str) -> None:
        self.busy = busy
        self.status_var.set(status)
        state = tk.DISABLED if busy else tk.NORMAL
        self.refresh_button.configure(state=state)
        self.apply_button.configure(state=state)
        self.proof_button.configure(state=state)
        if busy:
            self.progress.start(12)
        else:
            self.progress.stop()

    @staticmethod
    def _yes(value: bool) -> str:
        return "Yes" if value else "No"

    @staticmethod
    def _short_detail(text: str, limit: int = 130) -> str:
        single = " ".join(text.split())
        return single if len(single) <= limit else single[: limit - 1] + "…"

    def _refresh_status(self) -> None:
        if self.busy:
            return
        lore_command = self._lore_command()
        self._set_busy(True, "Checking Lore and MCP clients…")
        self._append_activity("Running local Lore and client checks.")

        def worker() -> None:
            try:
                client = self._client_for(lore_command)
                lore_status = client.check_lore()
                client_statuses = client.check_clients()
                self.events.put(("status", (lore_status, client_statuses)))
            except Exception as error:
                self.events.put(("error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _render_status(self, lore: LoreStatus, clients: list[ClientStatus]) -> None:
        self.lore_executable_var.set(
            lore.executable if lore.installed and lore.executable else "Not found"
        )
        db_state = "exists" if lore.database_exists else "not created yet"
        self.database_var.set(f"{lore.database_path} ({db_state})")
        sessions = "unknown" if lore.session_count is None else str(lore.session_count)
        self.cli_health_var.set(
            f"{'Ready' if lore.cli_ready else 'Failed'} · sessions reported: {sessions}"
        )
        self.mcp_health_var.set("Ready" if lore.mcp_ready else "Failed")
        self._append_activity(lore.detail)

        for item in self.client_tree.get_children():
            self.client_tree.delete(item)
        self.client_rows.clear()
        self.client_statuses = {status.client: status for status in clients}
        for status in clients:
            row = self.client_tree.insert(
                "",
                tk.END,
                values=(
                    CLIENT_LABELS[status.client],
                    self._yes(status.installed),
                    self._yes(status.configured),
                    self._short_detail(status.detail),
                ),
            )
            self.client_rows[row] = status.client
        ready_count = sum(1 for status in clients if status.configured)
        self._set_busy(False, f"Check complete. {ready_count}/3 clients report Lore configured.")

    def _select_client_from_tree(self, _event: object = None) -> None:
        selected = self.client_tree.selection()
        if not selected:
            return
        client = self.client_rows.get(selected[0])
        if client:
            self.client_var.set(CLIENT_LABELS[client])

    def _selected_client_key(self) -> str:
        label = self.client_var.get()
        reverse = {value: key for key, value in CLIENT_LABELS.items()}
        return reverse.get(label, "codex")

    def _refresh_preview(self) -> None:
        try:
            client = self._client()
            selected = self._selected_client_key()
            snippet = client.config_snippet(selected)
            location = client.config_location(selected)
            command = client.apply_command(selected)
            lines = [
                f"Target: {CLIENT_LABELS[selected]}",
                f"Configuration location: {location}",
            ]
            if command:
                lines.append("Safe apply command: " + " ".join(command))
            else:
                lines.append("Safe apply action: merge the Lore entry into the JSON file with a backup")
            lines.extend(["", "Configuration preview:", snippet])
            self._replace_text(self.preview, "\n".join(lines))
        except Exception as error:
            self._replace_text(self.preview, f"Cannot build preview: {error}")

    def _copy_preview(self) -> None:
        text = self.preview.get("1.0", tk.END).strip()
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.status_var.set("Configuration preview copied.")

    def _copy_activity(self) -> None:
        text = self.activity.get("1.0", tk.END).strip()
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.status_var.set("Activity copied.")

    def _apply_configuration(self) -> None:
        if self.busy:
            return
        client_key = self._selected_client_key()
        lore_command = self._lore_command()
        preview = self.preview.get("1.0", tk.END).strip()
        confirmed = messagebox.askyesno(
            APP_TITLE,
            f"Apply the shown Lore MCP configuration to {CLIENT_LABELS[client_key]}?\n\n"
            "Cursor JSON is backed up before editing. Codex and Claude use their official MCP CLI commands.\n\n"
            + preview[:900],
        )
        if not confirmed:
            return
        self._set_busy(True, f"Configuring {CLIENT_LABELS[client_key]}…")

        def worker() -> None:
            try:
                result = self._client_for(lore_command).apply_client(client_key)
                self.events.put(("applied", (client_key, result)))
            except Exception as error:
                self.events.put(("error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _prove_continuity(self) -> None:
        if self.busy:
            return
        query = self.query_var.get().strip()
        if not query:
            messagebox.showinfo(APP_TITLE, "Enter a phrase from imported history first.")
            return
        lore_command = self._lore_command()
        self._set_busy(True, "Searching Lore and retrieving context…")
        self._append_activity(f"Proving continuity for query: {query}")

        def worker() -> None:
            try:
                proof = self._client_for(lore_command).prove_continuity(query)
                self.events.put(("proof", proof))
            except Exception as error:
                self.events.put(("error", str(error)))

        threading.Thread(target=worker, daemon=True).start()

    def _render_proof(self, proof: ContinuityProof) -> None:
        payload = asdict(proof)
        context = payload.pop("context")
        lines = [
            f"Query: {proof.query}",
            f"Hits: {proof.hit_count}",
            f"Message ID: {proof.message_id or 'none'}",
            f"Session ID: {proof.session_id or 'none'}",
            f"Source: {proof.source or 'unknown'}",
            "",
            "Matched text:",
            proof.preview or "(empty)",
            "",
            "Retrieved context:",
            json.dumps(context, indent=2) if context is not None else "No context retrieved.",
        ]
        self._replace_text(self.proof_output, "\n".join(lines))
        self._append_activity(json.dumps(payload, ensure_ascii=False))
        if proof.hit_count:
            self._set_busy(False, "Continuity proved: search hit and context retrieval completed.")
        else:
            self._set_busy(False, "Lore is reachable, but that phrase had no match.")

    def _poll_events(self) -> None:
        try:
            while True:
                kind, payload = self.events.get_nowait()
                if kind == "status":
                    lore, clients = payload  # type: ignore[misc]
                    self._render_status(lore, clients)
                elif kind == "applied":
                    client_key, result = payload  # type: ignore[misc]
                    self._append_activity(str(result))
                    self._set_busy(
                        False,
                        f"Configured {CLIENT_LABELS[str(client_key)]}. Reload the client.",
                    )
                    messagebox.showinfo(
                        APP_TITLE,
                        f"{result}\n\nReload {CLIENT_LABELS[str(client_key)]}, then run Check everything again.",
                    )
                elif kind == "proof":
                    self._render_proof(payload)  # type: ignore[arg-type]
                elif kind == "error":
                    text = str(payload)
                    self._append_activity("ERROR: " + text)
                    self._set_busy(False, "Operation failed.")
                    messagebox.showerror(APP_TITLE, text)
        except queue.Empty:
            pass
        except Exception as error:
            self._append_activity(f"ERROR: event handling failed: {error}")
            self._set_busy(False, "Operation failed.")
        finally:
            self.root.after(100, self._poll_events)

    def _on_close(self) -> None:
        try:
            self._save_settings()
        finally:
            self.root.destroy()


def main() -> None:
    root = tk.Tk()
    MCPControlCenterApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
