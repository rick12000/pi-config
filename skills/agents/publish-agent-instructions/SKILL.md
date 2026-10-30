---
name: publish-agent-instructions
description: Publish one markdown instruction as an AGENTS.md routing entry plus a standalone instruction file, discoverable by any agent that reads AGENTS.md. Use when publishing instructions for coding agents. Emit platform-specific copies from the roster below only when the user requests a specific platform.
---

# Publish agent instructions

## Inputs

- `name`: file stem. Lowercase letters, numbers, and hyphens.
- `description`: one line stating what the instruction does and when to use it.
- `body`: markdown with no frontmatter.

## Existing copy

An instruction named `<name>` already exists if any of these files exists at the repository root:

- `docs/instructions/<name>.md`
- any file in the platform roster below

If the caller is reusing an existing instruction, stop and follow the file that exists. Do not write another copy.

## Default: AGENTS.md routing

`AGENTS.md` (the open plain-markdown agent instructions standard) acts only as a routing layer: one pointer line per instruction, with the full content in separate files.

1. Write `<body>` unchanged to `docs/instructions/<name>.md`. Create parent directories.

2. Update `AGENTS.md` at the repository root:
   - Does not exist: create it with exactly this content:

     ```markdown
     # Agent instructions

     - [<name>](docs/instructions/<name>.md) — <description>
     ```

   - Already exists: add one pointer line `- [<name>](docs/instructions/<name>.md) — <description>` to its bullet list (create the heading `# Agent instructions` and list if the file has neither). Never duplicate an existing pointer for `<name>`. Do not modify any other content.

3. Tell the caller which paths were created or updated.

## Platform roster (reference)

Use this roster only when the user explicitly requests a platform (for example: "produce an instruction for Cursor"). Write `<body>` unchanged into the requested host format. Create parent directories.

`.cursor/rules/<name>.mdc`

```markdown
---
description: <description>
alwaysApply: true
---

<body>
```

`.github/instructions/<name>.instructions.md`

```markdown
---
applyTo: "**"
---

<body>
```

`.claude/rules/<name>.md`

```markdown
---
paths:
  - "**/*"
---

<body>
```

`.pi/skills/<name>/SKILL.md`

```markdown
---
name: <name>
description: <description>
---

<body>
```

`.agents/skills/<name>/SKILL.md`

Use the same contents as `.pi/skills/<name>/SKILL.md`. Pi discovers both. Keep the copies identical.

`.windsurf/rules/<name>.md`

```markdown
---
trigger: always_on
description: <description>
---

<body>
```

`.clinerules/<name>.md`

Write `<body>` only. No frontmatter.

Tell the caller which paths were created.
