---
title: Git setup
tags:
  - pi
  - git
---

# Git setup

`~/.pi/agent` is the Git working tree. Edit files here. There is no second copy and no sync step.

- Remote: `git@github.com:rick12000/pi-config.git`
- Branch: `main`

## Tracked paths

Everything is ignored until it is allowlisted in `.gitignore`.

- Root files: `settings.json`, `keybindings.json`, `AGENTS.md`, `AGENTS.override.md`, `CLAUDE.md`, `SYSTEM.md`, `APPEND_SYSTEM.md`
- Directories: `extensions/`, `skills/`, `prompts/`, `themes/`, `docs/`

New unknown files stay ignored. Do not use `git add -f`.

## Never track

`auth.json`, `models.json`, `sessions/`, credentials, tokens, API keys, OAuth state, private keys, certificates, chat history, runtime state, caches, dependencies, build output, and logs.

Inside allowlisted folders, `.env` files, keys, `node_modules/`, `dist/`, caches, logs, and `.obsidian/` stay ignored.

## Commit

```bash
git add .
gitleaks git .
git diff --cached
git commit -m "<description>"
git push
```

If gitleaks reports a finding, stop. Do not commit or push until it is resolved.

Related: [[#Tracked paths]] · [[#Never track]]
