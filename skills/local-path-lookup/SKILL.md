---
name: local-path-lookup
description: Resolve machine-local file, path, or folder requests on this Windows host.
---

# Local path lookup

Static lookup for this Windows machine. Do not re-search; use these paths directly.

| Entity | Path |
|---|---|
| Obsidian vault | `C:\Users\ricca\OneDrive\Documenti\Obsidian Vault` |
| Pi installation | `C:\Users\ricca\.pi` |
| Pi custom skills (source of truth) | `C:\Users\ricca\.pi\agent\skills` |
| Global agent skills | `C:\Users\ricca\.agents\skills` |
| User directory | `C:\Users\ricca` |

## Global agent skills sync

- Source of truth: `C:\Users\ricca\.pi\agent\skills` (pi directory).
- `C:\Users\ricca\.agents\skills` is a copy for Agent Skills–compatible agents (VS Code, Cursor, Codex).
- Only skills are synced — not plugins or other pi-specific setups.
- To sync, copy skills from the pi skills directory into the global agent skills directory (e.g. `robocopy "C:\Users\ricca\.pi\agent\skills" "C:\Users\ricca\.agents\skills" /E`), at regular intervals.
