---
name: project-venv-setup
description: Create a Python virtual environment named .venv in the project root with uv or conda and install the project. Use when a repository needs a Python environment. If an env instruction named env already exists, follow that file instead.
---

# Project Virtual Environment Setup

The environment is the directory `.venv` in the repository root. This is the single source of truth for the environment location; every command in this workflow and in the env instruction file (step 11) references it. Never create a differently named environment directory (for example `.venv-myproject` or `venv`) and never create the environment in the user profile.

All paths in this skill and in the env instruction file are relative to the repository root, or expressed as variables (for example `<repo-root>`, `$env:USERPROFILE`). Never fill in machine-specific absolute paths.

## Workflow

1. Before any other step, follow `publish-agent-instructions` for `name: env`. If an instruction with that name already exists, stop this workflow and follow that file. Do not create another environment.

2. Require packaging at the repository root. At least one of `pyproject.toml`, `requirements.txt`, or `setup.py` must exist. If none exists, abort. Tell the user that no environment could be created and no code could be run because the project does not yet have proper packaging. Do not install tools, create an environment, or write env files.

3. Run every command in this workflow from the repository root of the project the environment corresponds to.

4. Detect tooling from a shell started in the repository root:
   - `uv --version`
   - `conda --version`

5. Select the backend:
   - If `uv` is available, use **uv**.
   - Else if `conda` is available, use **conda**.
   - Else install **uv** for the current user, verify `uv --version`, then use **uv**.

6. Create the environment in the repository root:
   - **uv**: `uv venv --python <version>`. Pick the Python version from `pyproject.toml`, `.python-version`, `runtime.txt`, or CI config; otherwise use a recent stable 3.x.
   - **conda**: `conda create -p .venv python=<version>` (prefix install, so the environment stays in the repository root). Pick the Python version as for **uv**.

7. Install project dependencies into that environment, from the repository root. Prefer an editable install so later runs can skip reinstall.
   - **uv**, when `pyproject.toml` or `setup.py` exists: `uv pip install -e . --python .venv\Scripts\python.exe`. If the project already uses a uv lockfile (`uv.lock`), use `uv sync` instead.
   - **uv**, when only `requirements.txt` exists: `uv pip install -r requirements.txt --python .venv\Scripts\python.exe`.
   - **conda**: `conda activate .venv`, then `pip install -e .` (or `pip install -r requirements.txt` when only `requirements.txt` exists).

8. If install fails because of version conflicts or resolver errors, resolve them and retry:
   - Read the error and adjust the conflicting pins in `pyproject.toml`, `requirements.txt`, `setup.py`, or `setup.cfg`.
   - Retry after each coherent change.
   - Stop after repeated failure and summarize the blockers.
   - When a retry succeeds, keep the resolution in the manifest files you changed.
   - Report those manifest changes in the final reply.

9. Tell the user the environment is ready. Include the environment directory as a relative path (`.venv` from the repository root) and how to run commands, using exactly the two run modes from the env template in step 11.

10. Follow `publish-agent-instructions` with this environment's values filled into the body. These files are how the next session reuses the environment instead of repeating this workflow.
    - `name`: `env`
    - `description`: `Use this repository's Python virtual environment before installing, running, or testing Python.`
    - `body`: the template below. For **conda**, replace the Activate section with `conda activate .venv` and omit the `uv run` section.

```markdown
# Python environment

Use this virtual environment for Python commands. If this repository is only a Python application, use it for every command.

## Environment

Directory: <repo-root>\.venv

## Activate

From the repository root:

PowerShell:

    .\.venv\Scripts\Activate.ps1

cmd:

    call .venv\Scripts\activate.bat

## Run

Run commands with either activation (above), or without activating:

```powershell
uv run python main.py
uv run pytest tests/
```

`uv run` automatically uses `.venv` and synchronizes it with `pyproject.toml` and `uv.lock`.

## Install

From the repository root, when dependencies change:

    uv pip install -e . --python .venv\Scripts\python.exe

Use `uv pip install -r requirements.txt --python .venv\Scripts\python.exe` when the only manifest is `requirements.txt`. Skip reinstall if the editable install is already done. If install fails on version conflicts, update `pyproject.toml`, `setup.py`, `setup.cfg`, or `requirements.txt`, retry, and report those edits in the final reply.
```
