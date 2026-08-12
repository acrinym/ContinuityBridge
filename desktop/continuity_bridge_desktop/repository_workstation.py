"""Repository-aware product layer for the ContinuityBridge Workstation."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk

from .handoff_client import HandoffOptions
from .lore_client import LoreHit, LoreLibraryClient
from .repository_links import GitRepositoryClient, RepositoryContext, RepositoryLinkStore
from .workstation import APP_TITLE, ContinuityWorkstation


ALL_REPOSITORIES = "All repositories"


def _split_refs(value: str) -> tuple[str, ...]:
    normalized = value.replace(";", ",").replace("\n", ",")
    return tuple(item.strip() for item in normalized.split(",") if item.strip())


class RepositoryAwareWorkstation(ContinuityWorkstation):
    """Add repository-linked recall and continuation without creating another evidence store."""

    def __init__(self, root: tk.Tk) -> None:
        self.repository_links = RepositoryLinkStore.load()
        self.repository_choice_keys: dict[str, str] = {}
        self.recall_repository_filter_var = tk.StringVar(master=root, value=ALL_REPOSITORIES)
        self.recall_link_repo_var = tk.StringVar(master=root, value="")
        self.recall_issue_refs_var = tk.StringVar(master=root, value="")
        self.recall_pr_refs_var = tk.StringVar(master=root, value="")
        self.continue_issue_refs_var = tk.StringVar(master=root, value="")
        self.continue_pr_refs_var = tk.StringVar(master=root, value="")
        self.current_related_key: str | None = None
        super().__init__(root)
        if not self.recall_link_repo_var.get().strip():
            self.recall_link_repo_var.set(self.continue_repo_var.get().strip())
        self._refresh_repository_choices()

    # ------------------------------------------------------------------
    # Recall repository filtering + explicit evidence linking
    # ------------------------------------------------------------------
    def _build_recall(self) -> None:
        super()._build_recall()
        links = ttk.LabelFrame(self.recall_tab, text="Repository continuity", padding=8)
        links.pack(fill=tk.X, pady=(8, 0))

        ttk.Label(links, text="Filter Recall").grid(row=0, column=0, sticky="w")
        self.recall_repository_combo = ttk.Combobox(
            links,
            textvariable=self.recall_repository_filter_var,
            values=(ALL_REPOSITORIES,),
            state="readonly",
            width=42,
        )
        self.recall_repository_combo.grid(row=0, column=1, sticky="ew", padx=(6, 12))
        ttk.Button(links, text="Search with filter", command=self._search_recall).grid(row=0, column=2)

        ttk.Label(links, text="Link selected evidence to repo").grid(row=1, column=0, sticky="w", pady=(7, 0))
        ttk.Entry(links, textvariable=self.recall_link_repo_var).grid(
            row=1, column=1, sticky="ew", padx=(6, 12), pady=(7, 0)
        )
        ttk.Button(links, text="Choose…", command=self._browse_recall_link_repo).grid(row=1, column=2, pady=(7, 0))

        ttk.Label(links, text="Issue refs").grid(row=2, column=0, sticky="w", pady=(7, 0))
        ttk.Entry(links, textvariable=self.recall_issue_refs_var).grid(
            row=2, column=1, sticky="ew", padx=(6, 12), pady=(7, 0)
        )
        ttk.Label(links, text="PR refs").grid(row=2, column=2, sticky="e", pady=(7, 0))
        ttk.Entry(links, textvariable=self.recall_pr_refs_var, width=30).grid(
            row=2, column=3, sticky="ew", padx=(6, 0), pady=(7, 0)
        )
        ttk.Button(
            links,
            text="Link selected evidence",
            style="Accent.TButton",
            command=self._link_selected_recall,
        ).grid(row=3, column=3, sticky="e", pady=(8, 0))
        ttk.Label(
            links,
            text="Refs may be #123 or explicit URLs. They are metadata only; ContinuityBridge does not call GitHub APIs here.",
            style="Muted.TLabel",
        ).grid(row=3, column=0, columnspan=3, sticky="w", pady=(8, 0))
        links.columnconfigure(1, weight=1)
        links.columnconfigure(3, weight=1)

    def _browse_recall_link_repo(self) -> None:
        from tkinter import filedialog

        path = filedialog.askdirectory(title="Choose repository for the selected evidence")
        if path:
            self.recall_link_repo_var.set(path)

    def _refresh_repository_choices(self) -> None:
        if not hasattr(self, "recall_repository_combo"):
            return
        self.repository_choice_keys.clear()
        labels = [ALL_REPOSITORIES]
        for label, key in self.repository_links.repository_choices():
            labels.append(label)
            self.repository_choice_keys[label] = key
        self.recall_repository_combo.configure(values=tuple(labels))
        current = self.recall_repository_filter_var.get()
        if current not in labels:
            self.recall_repository_filter_var.set(ALL_REPOSITORIES)

    def _selected_repository_filter_key(self) -> str | None:
        return self.repository_choice_keys.get(self.recall_repository_filter_var.get())

    def _search_recall(self) -> None:
        query = self.recall_query_var.get().strip()
        lore = self.lore_var.get().strip() or "lore"
        if not query:
            messagebox.showinfo(APP_TITLE, "Enter something to search for.")
            return
        filter_key = self._selected_repository_filter_key()
        client = LoreLibraryClient(lore)
        self.status_var.set("Searching Lore with repository context…" if filter_key else "Searching Lore…")

        def search() -> list[LoreHit]:
            hits = client.search(query, limit=200 if filter_key else 40)
            if not filter_key:
                return hits
            return [
                hit
                for hit in hits
                if self.repository_links.matches(
                    filter_key,
                    message_id=hit.message_id,
                    session_id=hit.session_id,
                )
            ][:40]

        self._run_async("recall_search", search)

    def _link_selected_recall(self) -> None:
        selected = self.recall_tree.selection()
        if not selected:
            messagebox.showinfo(APP_TITLE, "Select a recalled evidence record first.")
            return
        hit = self.recall_rows.get(selected[0])
        if not hit:
            return
        repository_path = self.recall_link_repo_var.get().strip() or self.continue_repo_var.get().strip()
        if not repository_path:
            messagebox.showinfo(APP_TITLE, "Choose a repository before linking evidence.")
            return
        issue_refs = _split_refs(self.recall_issue_refs_var.get())
        pr_refs = _split_refs(self.recall_pr_refs_var.get())
        self.status_var.set("Linking evidence to repository context…")

        def link() -> dict:
            context = GitRepositoryClient().inspect(repository_path)
            self.repository_links.link_evidence(
                context,
                message_id=hit.message_id,
                session_id=hit.session_id,
                issue_refs=issue_refs,
                pull_request_refs=pr_refs,
            )
            self.repository_links.save()
            return {"context": context, "hit": hit}

        self._run_async("repository_link_evidence", link)

    def _event_repository_link_evidence(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set("Repository evidence link failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        context = payload.get("context")
        hit = payload.get("hit")
        if not isinstance(context, RepositoryContext) or not isinstance(hit, LoreHit):
            return
        self.continue_repo_var.set(context.local_path)
        self.recall_link_repo_var.set(context.local_path)
        self._refresh_repository_choices()
        for label, key in self.repository_choice_keys.items():
            if key == context.key:
                self.recall_repository_filter_var.set(label)
                break
        self.status_var.set(f"Linked {hit.message_id} to {context.name}.")

    def _continue_from_recall(self) -> None:
        selected = self.recall_tree.selection()
        hit = self.recall_rows.get(selected[0]) if selected else None
        super()._continue_from_recall()
        if not isinstance(hit, LoreHit):
            return
        keys = self.repository_links.keys_for_evidence(
            message_id=hit.message_id,
            session_id=hit.session_id,
        )
        if not keys:
            return
        key = keys[0]
        related = self.repository_links.related(key)
        repository = related.get("repository")
        if isinstance(repository, dict) and repository.get("localPath"):
            self.continue_repo_var.set(str(repository["localPath"]))
            self.continue_no_repo_var.set(False)
        self.continue_issue_refs_var.set(", ".join(related.get("issues", [])))
        self.continue_pr_refs_var.set(", ".join(related.get("pullRequests", [])))
        self.current_related_key = key
        self._render_related(related)

    # ------------------------------------------------------------------
    # Continue repository metadata + related continuity
    # ------------------------------------------------------------------
    def _build_continue(self) -> None:
        super()._build_continue()
        related = ttk.LabelFrame(self.continue_tab, text="Repository continuity links", padding=8)
        related.pack(fill=tk.X, pady=(7, 0))
        ttk.Label(related, text="Issue refs").grid(row=0, column=0, sticky="w")
        ttk.Entry(related, textvariable=self.continue_issue_refs_var).grid(row=0, column=1, sticky="ew", padx=(6, 10))
        ttk.Label(related, text="PR refs").grid(row=0, column=2, sticky="w")
        ttk.Entry(related, textvariable=self.continue_pr_refs_var).grid(row=0, column=3, sticky="ew", padx=(6, 10))
        ttk.Button(related, text="Find related continuity", command=self._find_related_continuity).grid(row=0, column=4)
        ttk.Button(related, text="Add related evidence", command=self._use_related_evidence).grid(
            row=1, column=4, pady=(6, 0)
        )
        self.continue_related_text = scrolledtext.ScrolledText(related, height=4, wrap=tk.WORD, state=tk.DISABLED)
        self.continue_related_text.grid(row=1, column=0, columnspan=4, sticky="ew", pady=(6, 0), padx=(0, 10))
        self._replace_text(
            self.continue_related_text,
            "Choose a repository and find related continuity to surface linked Lore evidence, issues/PRs, and prior handoffs.",
        )
        related.columnconfigure(1, weight=1)
        related.columnconfigure(3, weight=1)

    def _find_related_continuity(self) -> None:
        path = self.continue_repo_var.get().strip()
        if self.continue_no_repo_var.get() or not path:
            messagebox.showinfo(APP_TITLE, "Choose a repository before finding related continuity.")
            return
        self.status_var.set("Finding continuity linked to this repository…")
        self._run_async("repository_related", lambda: GitRepositoryClient().inspect(path))

    def _event_repository_related(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, RepositoryContext):
            self.status_var.set("Repository continuity lookup failed.")
            messagebox.showerror(APP_TITLE, str(payload))
            return
        self.current_related_key = payload.key
        related = self.repository_links.related(payload.key)
        self._render_related(related)
        if related.get("issues") and not self.continue_issue_refs_var.get().strip():
            self.continue_issue_refs_var.set(", ".join(related["issues"]))
        if related.get("pullRequests") and not self.continue_pr_refs_var.get().strip():
            self.continue_pr_refs_var.set(", ".join(related["pullRequests"]))
        count = len(related.get("messageIds", []))
        self.status_var.set(f"Found {count} linked evidence record(s) for {payload.name}.")

    def _render_related(self, related: dict) -> None:
        if not hasattr(self, "continue_related_text"):
            return
        repository = related.get("repository") or {}
        lines = [
            f"Repository: {repository.get('remote') or repository.get('name') or 'unknown'}",
            f"Linked message IDs: {', '.join(related.get('messageIds', [])) or 'none'}",
            f"Issues: {', '.join(related.get('issues', [])) or 'none'}",
            f"Pull requests: {', '.join(related.get('pullRequests', [])) or 'none'}",
            f"Prior handoffs: {', '.join(related.get('handoffs', [])) or 'none'}",
        ]
        self._replace_text(self.continue_related_text, "\n".join(lines))

    def _use_related_evidence(self) -> None:
        if not self.current_related_key:
            self._find_related_continuity()
            return
        related = self.repository_links.related(self.current_related_key)
        existing = list(self._continue_evidence_ids())
        for message_id in related.get("messageIds", []):
            if message_id not in existing:
                existing.append(message_id)
        self.continue_message_ids.delete("1.0", tk.END)
        self.continue_message_ids.insert("1.0", "\n".join(existing))
        self.status_var.set(f"Continue now includes {len(existing)} exact Lore message ID(s).")

    def _make_handoff_options(self, *, preview: bool) -> HandoffOptions:
        options = super()._make_handoff_options(preview=preview)
        return replace(
            options,
            issue_refs=_split_refs(self.continue_issue_refs_var.get()),
            pull_request_refs=_split_refs(self.continue_pr_refs_var.get()),
        )

    def _event_handoff_build(self, ok: bool, payload: object) -> None:
        super()._event_handoff_build(ok, payload)
        if not ok or not isinstance(payload, dict):
            return
        options = payload.get("options")
        if not isinstance(options, HandoffOptions) or options.no_repository or not options.repository_path:
            return
        if options.output_path:
            handoff_path = Path(options.output_path)
        elif options.attachment_bundle:
            extension = "json" if options.output_format == "json" else "md"
            handoff_path = Path(options.attachment_bundle) / f"HANDOFF.{extension}"
        else:
            return

        def link_handoff() -> dict:
            context = GitRepositoryClient().inspect(options.repository_path or ".")
            self.repository_links.link_handoff(
                context,
                path=handoff_path,
                message_ids=options.message_ids,
                issue_refs=options.issue_refs,
                pull_request_refs=options.pull_request_refs,
            )
            self.repository_links.save()
            return {"context": context, "related": self.repository_links.related(context.key)}

        self._run_async("repository_link_handoff", link_handoff)

    def _event_repository_link_handoff(self, ok: bool, payload: object) -> None:
        if not ok or not isinstance(payload, dict):
            self.status_var.set(f"Handoff built; repository link metadata could not be saved: {payload}")
            return
        context = payload.get("context")
        related = payload.get("related")
        if isinstance(context, RepositoryContext):
            self.current_related_key = context.key
        if isinstance(related, dict):
            self._render_related(related)
        self._refresh_repository_choices()
        self.status_var.set("Continuation package built and linked to repository context.")
