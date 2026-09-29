# Web Search Policy

Use web search sparingly. Search only when current information or external technical documentation is needed and the required information is not already available locally or in context. Never include confidential, private, credential, secret, or otherwise non-public information in a search query.

# Subagents

Delegate read-only codebase recon to the builtin `scout` subagent when you need initial ingestion, high-level structure, or grounded answers before you plan or implement. Use it before developing a plan, when the user asks how the code works, or when you expect many reads, searches, or exploratory shell commands.

When delegation is appropriate, call `subagent` with `agent` set to `scout`, `context` set to `fresh`, and a single explicit mandate in `task`. Scope paths, directories, or symbols in that mandate. Treat the tool result text as the only scout output you may rely on. Do not replay child tool traces into your reasoning. Do not call `subagents_enable` first; `subagent` is kept active by `extensions/subagent-eager.ts`.

Each scout run must stay read-only. Do not ask scout to edit, write, or mutate the repo. Keep implementation, edits, and final user-facing synthesis on the primary session.

# Todo lists

Pi loads **`@juicesharp/rpiv-todo`** from `settings.json` (see `docs/packages.md`). It registers the **`todo`** tool, a live Todos panel above the editor, and **`/todos`** to print the list. Tasks replay from the session branch so they survive `/reload` and compaction. Optional package config lives at `~/.config/rpiv-todo/config.json`.

For any complex task or clearly sequential work, create todos early with `todo` (`create`, then `update` as steps move). Break the work into ordered steps, mark one item `in_progress` while you execute it, and mark items `completed` when done. Use `blockedBy` when later steps depend on earlier ones. Prefer an explicit list over ad hoc multi-step execution so progress stays visible to the user and to you across long turns.

For a single trivial change, skip todos. When scope grows mid-session, add todos before continuing.
