# Backend

Independent Python project managed with **uv** (not part of the npm workspaces).
Every command below runs from `apps/backend`; the root `backend:*` npm scripts are thin wrappers.

| Task | Command |
| --- | --- |
| Install | `uv sync` |
| Lint | `uv run ruff check && uv run ruff format --check` |
| Format | `uv run ruff check --fix && uv run ruff format` |
| Typecheck | `uv run mypy` |
| Test | `uv run pytest` |
| Build | `uv build` |
| Regenerate contract models | `uv run datamodel-codegen` |

## Generated models

Pydantic v2 models are generated from `../../packages/contract/openapi.yaml` into
`src/equipment_maintenance_hub/models/generated/` (config: `[tool.datamodel-codegen]` in
`pyproject.toml`). **Do not edit them by hand.** Change the contract, regenerate, and review
the diff. Ruff skips this directory, and mypy still type-checks it. `npm run verify:contract`
(from the repo root) fails if the committed output differs from a fresh regeneration.
