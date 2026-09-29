---
title: Packages
tags:
  - pi
  - packages
---

# Packages

Pi packages are npm, git, or local bundles that add extensions, skills, prompts, and themes. This install declares them in the `packages` array of `~/.pi/agent/settings.json`. Pi installs the files under `~/.pi/agent/npm/`, which this Git repo ignores. A package runs as extension code inside Pi, so it can register tools, commands, and event hooks.

## Installed packages

These six entries are the current `packages` list in [[#Where they are declared|settings.json]]. Resolved versions below are from `~/.pi/agent/npm/package-lock.json`, checked against npm and GitHub on 29 Sep 2026.

Update one package with `pi update npm:<name>`, or refresh every package with `pi update --extensions`. `pi update` alone updates the Pi CLI and leaves packages alone. `pi update --all` updates Pi and the packages. Restart Pi after an update. `pi list` prints what settings declares.

> [!note] Vulnerability scale
> **Low** means a small local surface, no network, and a short dependency list. **Medium** means it can change project files, or maintenance has gone quiet. **High** means it runs child agents, fetches or clones remote content, or pulls a large third-party tree. These are estimates of exposure, not a CVE audit.

### pi-rewind

Git checkpoints of the working tree, with `/rewind`, a diff preview, and a redo stack. Snapshots are git refs in the project repo. Restore can put files back; it tries to skip `node_modules`, `.venv`, and large paths.

- Settings entry: `npm:pi-rewind`
- Installed: `0.5.0` (current on npm; published 31 Mar 2026)
- Update: `pi update npm:pi-rewind`
- Links: [Pi gallery](https://pi.dev/packages/pi-rewind) · [GitHub](https://github.com/arpagon/pi-rewind)
- Vulnerability: **medium**. No runtime npm dependencies, but it writes git refs and can restore files. Last push was 31 Mar 2026. About 115 stars, 10 forks, 9 open issues, roughly 280 weekly downloads.

> [!warning] Not pi-rewind-hook
> [pi-rewind-hook](https://pi.dev/packages/pi-rewind-hook) (`nicobailon/pi-rewind-hook`) is a different extension. This install uses `arpagon/pi-rewind`.

### pi-subagents

Delegates work to child Pi sessions: scout, researcher, worker, reviewer, oracle, and others. A worker can edit files. Children can run in the foreground or in a detached process.

- Settings entry: `npm:pi-subagents`
- Installed: `0.71.0` (npm latest was `0.73.1` on 27 Sep 2026)
- Update: `pi update npm:pi-subagents`
- Links: [Pi gallery](https://pi.dev/packages/pi-subagents) · [GitHub](https://github.com/nicobailon/pi-subagents)
- Vulnerability: **high**. Child agents inherit tool access, including edits. This install depends on `acorn`, `jiti`, `typebox`, `undici`, and `yaml`. The repo is active (pushed 29 Sep 2026): about 3,800 stars, 760 forks, 5 open issues, about 166k weekly downloads.

### @juicesharp/rpiv-todo

A `todo` tool plus a live panel and `/todos`. The list is replayed from the session, so it survives `/reload` and compaction. The package does not write the list to disk.

- Settings entry: `npm:@juicesharp/rpiv-todo`
- Installed: `2.11.0` (current on npm)
- Update: `pi update npm:@juicesharp/rpiv-todo`
- Links: [Pi gallery](https://pi.dev/packages/@juicesharp/rpiv-todo) · [GitHub](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo)
- Vulnerability: **low**. Dependencies are `@juicesharp/rpiv-config` and `typebox`. No network and no API keys. The monorepo was pushed 24 Sep 2026 (about 850 stars, 170 forks). It has many open issues across the whole repo, not this package alone. Optional config is `~/.config/rpiv-todo/config.json`.

### pi-context-view

Shows how context is spent (`/context`, `/context usage`) and lets you read the system prompt, tool definitions, and extension injections (`/context injections`). It does not add instructions to the model.

- Settings entry: `npm:pi-context-view`
- Installed: `0.6.0` (current on npm; published 20 Sep 2026)
- Update: `pi update npm:pi-context-view`
- Links: [Pi gallery](https://pi.dev/packages/pi-context-view) · [GitHub](https://github.com/dimk90/pi-context-view)
- Vulnerability: **low**. Read-only view, zero runtime dependencies (Pi host packages are peers). Last push 20 Sep 2026. About 72 stars, 12 forks, 4 open issues.

### @juicesharp/rpiv-ask-user-question

Registers `ask_user_question`. The model opens a terminal dialog of up to four questions and gets the selection back. It does not call a model or a network API itself.

- Settings entry: `npm:@juicesharp/rpiv-ask-user-question`
- Installed: `2.11.0` (current on npm)
- Update: `pi update npm:@juicesharp/rpiv-ask-user-question`
- Links: [Pi gallery](https://pi.dev/packages/@juicesharp/rpiv-ask-user-question) · [GitHub](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question)
- Vulnerability: **low**. Same dependency pair as [[#@juicesharp/rpiv-todo|rpiv-todo]]: `@juicesharp/rpiv-config` and `typebox`. The old standalone repo is archived; development is in `rpiv-mono`. Optional config is `~/.config/rpiv-ask-user-question/config.json`.

### pi-web-access

Web search, URL fetch, PDF extraction, YouTube and local video handling, and local clones of GitHub repos (cached for the session, skipped or API-only above 350 MB). Keyless search can use Exa. Other providers take keys in `.pi/agent/web-search.json`, which is outside this repo. Our personal overrides — Tavily-only provider, Tavily key via `TAVILY_API_KEY`, and a local rate-limit extension — are documented in [[web-search]].

- Settings entry: `npm:pi-web-access`
- Installed: `0.33.0` (current on npm)
- Update: `pi update npm:pi-web-access`
- Links: [Pi gallery](https://pi.dev/packages/pi-web-access) · [GitHub](https://github.com/nicobailon/pi-web-access)
- Vulnerability: **high**. It fetches remote content, parses HTML and PDFs, and can clone repositories onto disk. Dependencies include `@modelcontextprotocol/sdk`, `@mozilla/readability`, `defuddle`, `linkedom`, `turndown`, `undici`, `unpdf`, `p-limit`, and `promise.try`. The repo is active (pushed 29 Sep 2026): about 1,560 stars, 280 forks, no open issues, about 154k weekly downloads.

## Where they are declared

`~/.pi/agent/settings.json`, key `packages`:

```json
"packages": [
  "npm:pi-rewind",
  "npm:pi-subagents",
  "npm:@juicesharp/rpiv-todo",
  "npm:pi-context-view",
  "npm:@juicesharp/rpiv-ask-user-question",
  "npm:pi-web-access"
]
```

`pi install` and `pi remove` edit that array. Do not hand-edit it unless you also want Pi to reconcile `~/.pi/agent/npm/` on the next start.

Related: [[setup|Git setup]] · [Pi package docs](https://pi.dev/docs/latest/packages)
