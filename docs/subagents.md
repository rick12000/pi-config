---
title: Subagents
tags:
  - pi
  - subagents
---

# Subagents

We use the [[packages#pi-subagents|pi-subagents]] package only for **scout**, Pi’s builtin read-only codebase recon child. The primary session stays on `local-qwen/krillin-average`. Scout runs on a cheaper model with isolated context so exploration does not flood the parent transcript.

## How it works

1. Pi loads `npm:pi-subagents` from `settings.json`. By default the package hides `subagent` behind `subagents_enable` until the next model turn.
2. Our extension `extensions/subagent-eager.ts` keeps `subagent` on the active tool set every session (same effect as starting Pi with `--exclude-tools subagents_enable`). No CLI flag is required.
3. The primary agent delegates with `agent: "scout"`, `context` set to `fresh`, and a scoped `task` mandate (paths, directories, or symbols plus one question).
4. Scout uses read/search tools in a child session. The parent should use only the **`subagent` tool result** as scout output, not child tool traces.
5. Edits and user-facing answers stay on the primary session.

## Local models

`extensions/subagent-local-serial.ts` treats a provider as local when its `baseUrl` in `models.json` is `127.0.0.1`, `localhost`, or `::1`. If the session model or the child model is local, one `subagent` call runs in the foreground (`async: false`) and a second launch or `workflowScript` fanout is blocked until that result returns. If both models are non-local, parallel async subagents stay allowed.

Builtin scout ships with `write` and a default `context.md` output. Our `settings.json` overrides remove write, disable default output, pin model and thinking, and default fresh context.

## `settings.json`

Tracked in this repo under `settings.json`, key `subagents`:

```json
"subagents": {
  "defaultSubagentContext": "fresh",
  "agentOverrides": {
    "scout": {
      "model": "local-qwen/piccolo-average",
      "thinking": false,
      "defaultContext": "fresh",
      "output": false,
      "tools": [
        "read",
        "grep",
        "find",
        "ls",
        "bash",
        "contact_supervisor"
      ]
    }
  }
}
```

In `agentOverrides`, `tools` must be a **JSON array of strings**, `"inherit"`, or `false`. A single comma-separated string is invalid (unlike scout agent frontmatter in `.md` files).

| Field | Effect |
|-------|--------|
| `defaultSubagentContext` | Fresh child session when a launch omits `context`. |
| `scout.model` | Piccolo average for recon, not the parent Krillin model. |
| `scout.thinking` | Reasoning off for scout. |
| `scout.tools` | Read-only recon. No `write` or `edit`. |
| `scout.output` | No default `context.md` handoff file. |

Restart Pi or `/reload` after editing.

## `AGENTS.md`

Global instructions in `AGENTS.md` tell the primary agent when to delegate scout (pre-plan recon, codebase questions, heavy read/search work), to pass `context: "fresh"` and a single mandate in `task`, and to treat the tool result as the only scout handoff while keeping mutations on the primary session.

Related: [[packages]] · [[git/setup|Git setup]]
