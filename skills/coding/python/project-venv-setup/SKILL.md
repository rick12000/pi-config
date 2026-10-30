---
name: project-venv-setup
description: Create a Python virtual environment named .venv in the project root with uv and install the project. Use when a repository needs a Python environment. If an env instruction named env already exists, follow that file instead.
---

# Project Virtual Environment Setup

The environment is the directory `.venv` in the repository root. This is the single source of truth for the environment location. Never create a differently named environment directory and never create the environment in the user profile.

uv is the only environment and package manager used by this skill. Never use conda, pipx, poetry, pixi, or any other environment manager.

All paths in this skill and in the env instruction file are relative to the repository root, or expressed as variables (for example `<repo-root>`, `$env:USERPROFILE`). Never fill in machine-specific absolute paths. Run every command from the repository root.

## Workflow

1. Before any other step, follow `publish-agent-instructions` for `name: env`. If an instruction with that name already exists, stop this workflow and follow that file. Do not create another environment.

2. Discover the dependency manifest at the repository root, in this priority order:
   1. `pyproject.toml`
   2. `uv.lock`, used together with `pyproject.toml`
   3. pip-tools, `requirements.in` files plus generated `requirements.txt`
   4. `requirements.txt` only

   If several systems coexist, first look through the repository for documentation or agent instructions naming the authoritative one. If none does, ask the user which system is authoritative for local development.

   If no manifest exists, tell the user the project has no clear dependency definition and ask whether to generate one, and which: `pyproject.toml` or a requirements set. If the user picks one, scan the code base (imports and existing code) for the needed packages, write the file, and continue. If the user declines, stop. Create no environment and report that.

3. Classify the dependencies of the chosen manifest:
   - **Base + dev, always install.**
     - `pyproject.toml`: `[project] dependencies` plus the dev group in `[dependency-groups] dev`.
     - requirements: `requirements.txt` plus `requirements-dev.txt`.
   - **Optional, never install automatically.** Extras under `[project.optional-dependencies]` other than `dev`, and any additional requirements files for optional features. If detected, list them and ask the user which, if any, to include.

4. Verify uv with `uv --version`. If uv is missing, install it for the current user. It must be at least 0.13.6. If it is older, update it before creating the environment.

5. Create the environment with `uv venv --python <version>`. Take the Python version from the project's pin (`pyproject.toml` or `.python-version`), otherwise a recent stable 3.x.

6. Enforce the eMudhra security advisory. These steps are mandatory.
   - **certifi**: if any dependency in the tree (direct or transitive) uses certifi, pin `certifi>=2026.10.19` in the manifest and refresh the lockfile. Never add certifi to a project that does not use it. Never stop, replace, or repin primary dependencies to satisfy this.
   - **pip**: if pip is installed in `.venv` and is below 26.2.2, update it only with the SHA-256-verified wheel:
     `.\.venv\Scripts\python.exe -I -m pip install 'pip @ https://files.pythonhosted.org/packages/3f/06/3e4420302363fbb71be3c7f35ce042f54bfca330e3e66b3a2e3c4cca579f/pip-26.2.2-py3-none-any.whl#sha256=fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70'`
     Never use a plain `pip install --upgrade pip`.
   - If any of these cannot be enforced, or the user forbids it, ask the user how to proceed. Do not skip silently.

7. Install base + dev dependencies (plus any user-selected optional extras):
   - **`pyproject.toml` + `uv.lock`**: `uv sync`. This installs the project package editable and the base + dev group. Add `--extra <name>` for each selected extra.
   - **`pyproject.toml` without lockfile**: `uv pip install -e . --python .venv\Scripts\python.exe`, adding the dev group and each selected extra.
   - **requirements**: `uv pip install -r requirements.txt -r requirements-dev.txt --python .venv\Scripts\python.exe`, adding any selected optional file.

   Editable rule: if the repository contains a package with `pyproject.toml`, prefer an editable install unless the user or repository documentation explicitly forbids it. Check first whether it is already installed editable (for example `uv pip list` shows an editable entry). If so, skip reinstall. An editable install reflects source changes live, so no reinstall is needed within the session.

   Conflict handling: if install fails with a version conflict or resolver error, read the error, adjust the conflicting pins in the manifest files, and retry after each fix. Stop after repeated failure and summarize the blockers. When a retry succeeds, keep the resolution in the manifest files you changed and report those changes in the final reply.

8. Verify the advisory from step 6 with `uv pip list --python .venv\Scripts\python.exe`. Report the result.

9. Tell the user the environment is ready. Include the environment directory as a relative path (`.venv` from the repository root) and how to run commands, using exactly the run modes from the env template in step 10.

10. Follow `publish-agent-instructions` with this environment's values filled into the body. These files are how the next session reuses the environment instead of repeating this workflow.
    - `name`: `env`
    - `description`: `Use this repository's Python virtual environment before installing, running, or testing Python.`
    - `body`: the template below. Fill in the actual manifest and extras for this repository.

## Env instruction template

The template is self-contained. It must not assume knowledge of this skill. It holds only the runtime essentials for using, executing, and updating the environment.

```markdown
# Python environment

Use this virtual environment for all Python commands.

## Environment

- Directory: `<repo-root>\.venv`
- Manifest: <authoritative manifest, e.g. `pyproject.toml` + `uv.lock`>
- Base + dev dependencies are installed. Optional extras (<list, if any>) are installed only on request.
- The project package is installed editable (if the repository contains a package). Do not reinstall it if it is already editable.
- uv is the only environment and package manager for this repository.

## Activate

From the repository root:

PowerShell: `.\.venv\Scripts\Activate.ps1`
cmd: `call .venv\Scripts\activate.bat`

Or run without activating: `uv run <command>`. `uv run` uses `.venv` and synchronizes it with the manifest.

## Testing

```powershell
uv run pytest                      # all tests
uv run pytest tests/test_main.py::test_failing_case   # one specific test
```

## Linting and pre-commit (only if present in the repository)

- **ruff**: `uv run ruff check .` and `uv run ruff check --fix .`
- **pre-commit** (`.pre-commit-config.yaml`): install with `uv pip install pre-commit --python .venv\Scripts\python.exe`. One-off over all files: `uv run pre-commit run --all-files`. Git hooks: `uv run pre-commit install`.
- **prek** (pre-commit alternative): `uv run prek install`. One-off: `uv run prek run --all-files`.

## Updating dependencies

Update the manifest first, then the environment:

- **`pyproject.toml` + `uv`**: use `uv add` (or edit `pyproject.toml` directly), then `uv lock` (if a lockfile exists) and `uv sync`.
- **pip-tools**: edit the `requirements.in` files, then regenerate the frozen lock with `uv run pip-compile requirements.in -o requirements.txt` (repeat per `.in` file), then `uv pip install -r requirements.txt -r requirements-dev.txt --python .venv\Scripts\python.exe`.
- **`requirements.txt` only**: edit it, then `uv pip install -r requirements.txt -r requirements-dev.txt --python .venv\Scripts\python.exe`.

When changing the environment in any way, enforce the eMudhra security advisory:

- uv must be at least 0.13.6, verified with `uv --version`.
- If certifi appears anywhere in the dependency tree, it is pinned at `certifi>=2026.10.19` in the manifest and lockfile.
- pip, if present in `.venv`, must be at least 26.2.2. Upgrade it only with the SHA-256-verified wheel, never a plain `pip install --upgrade pip`:

    .\.venv\Scripts\python.exe -I -m pip install 'pip @ https://files.pythonhosted.org/packages/3f/06/3e4420302363fbb71be3c7f35ce042f54bfca330e3e66b3a2e3c4cca579f/pip-26.2.2-py3-none-any.whl#sha256=fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70'

- If any of this cannot be enforced, ask the user.

```
