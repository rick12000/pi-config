---
title: Subagents
tags:
  - pi
  - subagents
---

# Subagents

We use the [[packages#pi-subagents|pi-subagents]] package only for **scout**, Pi’s builtin read-only codebase recon child. The primary session stays on `local-qwen/krillin-average`. Scout uses the default subagent model, `local-qwen/piccolo-large`, with thinking off and isolated context so exploration does not flood the parent transcript.

## Enabling `subagent`

By default `subagent` is not enabled. On Pi 0.86.1 or newer, pi-subagents registers the tool and then hides it. A fresh session exposes the small `subagents_enable` loader instead. `bg_wait` and `subagent_supervisor` stay active. `AGENTS.md` says when scout is appropriate, so the model may call that loader during the turn. The package adds `subagent` only for the **next** model request, so the same turn cannot launch scout. That extra turn is the cost of leaving the default in place.

When you expect to use subagents, start Pi so `subagent` is active from the first request:

```text
pi --exclude-tools subagents_enable
```

`--exclude-tools` is Pi's tool exclusion. pi-subagents hides `subagent` only while the loader is still available. If that exclusion removes `subagents_enable`, the extension does not hide `subagent`. This install does not pass the flag, so a normal start stays on the loader. The package describes this in [Tool activation lifecycle](https://github.com/nicobailon/pi-subagents/blob/main/docs/configuration.md#tool-activation-lifecycle).

## How it works

1. Pi loads `npm:pi-subagents` from `settings.json`. `subagent` stays inactive until `subagents_enable`, unless Pi was started with `--exclude-tools subagents_enable`.
2. The primary agent delegates with `agent: "scout"`, `context` set to `fresh`, and a scoped `task` mandate (paths, directories, or symbols plus one question).
3. Scout uses read/search tools in a child session. The parent should use only the **`subagent` tool result** as scout output, not child tool traces.
4. Edits and user-facing answers stay on the primary session.
5. `subagents.defaultSubagentOnlyExtensions` loads `extensions/command-gate.ts` into every child. Foreground children do not load other ambient extensions, so the gate has to be listed there. A child has no terminal of its own. An ask-list command waits, and the main session shows Enter to allow or `n` to reject. See [[command-gate]].

## Local models

`extensions/subagent-local-serial.ts` treats a provider as local when its `baseUrl` in `models.json` is `127.0.0.1`, `localhost`, or `::1`. If the session model or the child model is local, one `subagent` call runs in the foreground (`async: false`) and a second launch or `workflowScript` fanout is blocked until that result returns. If both models are non-local, parallel async subagents stay allowed.

Builtin scout ships with `write` and a default `context.md` output. Our `settings.json` overrides remove write, disable default output, and default fresh context. `subagents.defaultModel` and `subagents.defaultThinking` apply to every role that does not set its own. Scout's builtin frontmatter sets `thinking: low`, so the scout override keeps thinking off.

## `settings.json`

Tracked in this repo under `settings.json`, key `subagents`:

```json
"subagents": {
  "defaultModel": "local-qwen/piccolo-large",
  "defaultThinking": "off",
  "defaultSubagentContext": "fresh",
  "defaultSubagentOnlyExtensions": [
    "C:/Users/ricca/.pi/agent/extensions/command-gate.ts"
  ],
  "agentOverrides": {
    "scout": {
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
| `defaultModel` | Piccolo large for every subagent that does not set its own model. |
| `defaultThinking` | Reasoning off for every subagent that does not set thinking. |
| `defaultSubagentContext` | Fresh child session when a launch omits `context`. |
| `defaultSubagentOnlyExtensions` | Loads the command gate into every child that does not set its own list. |
| `scout.thinking` | Builtin scout sets thinking to low. This override keeps it off. |
| `scout.tools` | Read-only recon. No `write` or `edit`. |
| `scout.output` | No default `context.md` handoff file. |

Restart Pi or `/reload` after editing.

## `AGENTS.md`

`AGENTS.md` only says when to delegate scout (pre-plan recon, codebase questions, heavy read/search work) and that edits and the user-facing answer stay on the primary session. It does not mention `--exclude-tools`. Mounting `subagent` from the start is an operator choice at launch, described above. Fresh context, one-at-a-time local runs, and the command gate are handled by `settings.json` and extensions.

Related: [[packages]] · [[command-gate]] · [[git/setup|Git setup]]
