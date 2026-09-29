# Web Search Policy

Use web search sparingly. Search only when current information or external technical documentation is needed and the required information is not already available locally or in context. Never include confidential, private, credential, secret, or otherwise non-public information in a search query.

# Subagents

Delegate read-only codebase recon to the builtin `scout` subagent when you need initial ingestion, high-level structure, or grounded answers before you plan or implement. Use it before developing a plan, when the user asks how the code works, or when you expect many reads, searches, or exploratory shell commands.

When delegation is appropriate, call `subagent` with `agent` set to `scout`, `context` set to `fresh`, and a single explicit mandate in `task`. Scope paths, directories, or symbols in that mandate. Treat the tool result text as the only scout output you may rely on. Do not replay child tool traces into your reasoning. Do not call `subagents_enable` first; `subagent` is kept active by `extensions/subagent-eager.ts`.

On a local model, launch one scout and wait for that tool result before any other work or a second scout. Do not pass `async: true` and do not fan out with `workflowScript`. `extensions/subagent-local-serial.ts` forces that call to stay in the foreground. A non-local parent and a non-local child model may run subagents in parallel.

Each scout run must stay read-only. Do not ask scout to edit, write, or mutate the repo. Keep implementation, edits, and final user-facing synthesis on the primary session.

# Command gate

`extensions/command-gate.ts` checks `bash` and `powershell` before they run, including inside subagents. Allowed commands run. Banned commands are refused. Ask-list commands wait until the user presses Enter to allow or `n` to reject.

If a tool result says the user rejected a command, that rejection is final. Do not run that command again, and do not retry it through another shell, a wrapper, different flags, or an encoded form. Continue without it. A ban-list block is also final.

`web_search`, `source_check`, and `fetch_content` are outside this gate. Starting Pi with `--no-command-gate` turns the gate off for that process.

# Todo lists

Pi loads **`@juicesharp/rpiv-todo`** from `settings.json` (see `docs/packages.md`). It registers the **`todo`** tool, a live Todos panel above the editor, and **`/todos`** to print the list. Tasks replay from the session branch so they survive `/reload` and compaction. Optional package config lives at `~/.config/rpiv-todo/config.json`.

For any complex task or clearly sequential work, create todos early with `todo` (`create`, then `update` as steps move). Break the work into ordered steps, mark one item `in_progress` while you execute it, and mark items `completed` when done. Use `blockedBy` when later steps depend on earlier ones. Prefer an explicit list over ad hoc multi-step execution so progress stays visible to the user and to you across long turns.

For a single trivial change, skip todos. When scope grows mid-session, add todos before continuing.
