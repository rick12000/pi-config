---
title: Command gate
tags:
  - pi
  - extensions
---

# Command gate

`extensions/command-gate.ts` runs on every `bash` and `powershell` tool call, in the main session and in subagents. Anything that is not on the ban list or the ask list runs.

Restart Pi or `/reload` after editing the extension. Start an interactive session with `pi --no-command-gate` to skip the gate for that process, including children spawned from it. If you also pass a startup message, put the flag last (`pi "message" --no-command-gate`). Pi treats a value after an unknown flag as that flag's argument.

## Prompt

Ask-list commands open a prompt on the main terminal. Subagents do not have their own prompt. The child waits, and the main session shows the command.

- **Enter** allows that one command.
- **n** rejects it. Escape also rejects.

There is no allow-for-the-session choice. The next ask prompts again.

A rejection comes back to the model as a tool error that says the rejection is final. A banned command is blocked with no prompt and the same instruction not to retry it.

`web_search`, `source_check`, and `fetch_content` are not checked here. Web search still has its own rate limit in `extensions/web-search-limit.ts`.

## Ask list

- Git commands that write, delete, or use the network. Read-only git is allowed, including `status`, `diff`, `log`, `show`, listing branches, `remote -v`, `stash list`, and `config --get`. `push`, `pull`, `fetch`, `commit`, `reset`, `clean`, `checkout`, and force-push ask.
- Package installs and network installers: `npm install`, `pnpm add`, `yarn`, `pip install`, `uv add`, `cargo install`, `go install`, `winget install`, `npx`, `bunx`, `curl`, `wget`, `Invoke-WebRequest`, and the same kind of command under another name.
- Deletes: `rm`, `rmdir`, `del`, `Remove-Item`, and `find -delete`.

A command that cannot be parsed, or that hides another command inside `$(...)`, backticks, `bash -c`, or an encoded PowerShell command, asks. If the hidden command is on the ban list, it is banned instead.

## Ban list

These are blocked with no prompt:

- Disk format and raw disk writes: `format`, `Format-Volume`, `Clear-Disk`, `diskpart`, `mkfs`, `dd` onto a device.
- Shutdown and reboot: `shutdown`, `Stop-Computer`, `Restart-Computer`.
- A fork bomb.
- Recursive delete of `/`, a drive root such as `C:\`, or the home directory itself. `rm file` and `rm -rf ./build` still ask.

## Subagents

`settings.json` sets `subagents.defaultSubagentOnlyExtensions` to this file. Pi's foreground children do not load the rest of `~/.pi/agent/extensions`, so the gate would miss scout's `bash` without that entry. The child writes a request under `~/.pi/agent/command-gate-queue/`, which this repo ignores, and the main session answers it.

Related: [[subagents]] · [[web-search]]
