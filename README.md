# Model the Maintenance Domain in OpenAPI

This README walks through what the AI assistant did to complete Prompt 4, step by step.
The goal is to show a **contract-first** workflow: the OpenAPI file is the single source of
truth, and the TypeScript and Python models are *generated* from it — never written by hand.

## The task

The prompt asked the assistant to:

- Extend `packages/contract/openapi.yaml` with the domain schemas for work orders
  (`WorkOrderState`, `WorkOrderAction`, `Priority`, `Asset`, `Technician`, `WorkOrder`,
  `NewWorkOrder`, `TransitionCommand`, `AssignmentCommand`, `DashboardSummary`, `ApiError`).
- Keep every existing schema (for example `HealthStatus`) unchanged.
- Add **no routes** yet.
- Regenerate the models, run `npm run verify`, and **stop and explain** if anything existing breaks,
  instead of deleting or rewriting it.
- List every design assumption at the end.

The work order lifecycle used for the schemas:

```
reported --triage--> triaged --schedule--> scheduled --start--> in_progress --complete--> completed
                        |                      |
                        +------cancel----------+------cancel--> cancelled
```

Only `triaged` and `scheduled` can be cancelled. `completed` and `cancelled` are final.

## Repository layout (relevant parts)

```
packages/contract/openapi.yaml                                   <- source of truth
packages/contract/src/generated/                                 <- generated TypeScript (@hey-api/openapi-ts)
apps/backend/src/equipment_maintenance_hub/models/generated/     <- generated Pydantic v2 (datamodel-codegen)
apps/backend/tests/test_contract_models.py                       <- tests that import generated models
scripts/verify-contract.mjs                                      <- regenerates and diffs to detect drift
```

## Step 1 — Read before changing anything

Before editing, the assistant read the contract and **everything that depends on it**:

| File | Why it matters |
|---|---|
| `packages/contract/openapi.yaml` | The file to extend. |
| `packages/contract/openapi-ts.config.ts` | How the TypeScript types are generated. |
| `apps/backend/pyproject.toml` (`[tool.datamodel-codegen]`) | How the Python models are generated (Pydantic v2, `StrEnum`, `Annotated`, …). |
| `scripts/verify-contract.mjs` | `verify:contract` regenerates and fails if the committed output differs. |
| `apps/backend/tests/test_contract_models.py` | The only existing test that uses the contract (imports `HealthStatus`). |
| root `package.json` | Defines `verify` = `verify:contract` → `lint` → `typecheck` → `test` → `build`. |

**Finding:** the prompt said "OpenAPI 3.0.3", but the existing file declares `openapi: 3.1.0`.
Changing the version would mean rewriting existing content, so the assistant **kept 3.1.0** and
reported the mismatch. This matters for nullable fields:

```yaml
# OpenAPI 3.1 (used here)          # OpenAPI 3.0.3 equivalent
technicianId:                      technicianId:
  type: [string, "null"]             type: string
                                     nullable: true
```

> Lesson: when the prompt and the code disagree, don't silently "fix" either one. Choose the
> least destructive option and tell the user.

## Step 2 — Prepare the environment and take a baseline

`node_modules` was missing, so dependencies were installed from the lockfile:

```bash
npm ci
```

Then `npm run verify` was run **before any change**. It passed. This baseline proves that any
later failure would come from the new change, not from something already broken.

> Lesson: always get a green baseline first. Otherwise you can't tell which failures you caused.

## Step 3 — Extend the contract

The new schemas were **appended** under `components/schemas`. `HealthStatus` and `/health`
were not touched, and no `paths` were added. Main decisions:

- **Mandatory fields are explicit** with `required: [...]` on every object.
- **`technicianId` in `WorkOrder` is required but nullable**: the key is always present, and its
  value is `null` while the work order is unassigned.
- **Enums are separate schemas** (`WorkOrderState`, `WorkOrderAction`, `Priority`) and are reused
  with `$ref`.
- **Non-empty strings** use `minLength: 1`, except `description`, which may be empty.
- **Timestamps** use `format: date-time`.
- **Counters** in `DashboardSummary` use `type: integer` with `minimum: 0`.
- **`byState`** is an object with one required counter per state and `additionalProperties: false`,
  so the frontend always gets every state.
- **The lifecycle rules can't be expressed in JSON Schema**, so they are documented in comments
  and descriptions. The backend will have to enforce them later.

Example:

```yaml
WorkOrder:
  type: object
  required:
    [id, reference, assetId, title, description, priority, state, technicianId, reportedAt, updatedAt]
  properties:
    priority:
      $ref: "#/components/schemas/Priority"
    state:
      $ref: "#/components/schemas/WorkOrderState"
    technicianId:
      type: [string, "null"]
      minLength: 1
    reportedAt:
      type: string
      format: date-time
    # ...
```

## Step 4 — Regenerate the models

```bash
npm run contract:generate
```

This runs both generators:

| Generator | Output | Example result |
|---|---|---|
| `@hey-api/openapi-ts` | `packages/contract/src/generated/types.gen.ts` | `technicianId: string \| null;` |
| `datamodel-codegen` | `apps/backend/.../models/generated/__init__.py` | `class WorkOrderState(StrEnum): ...` |

The assistant checked the output to make sure it matched the intent:

- `HealthStatus` came out identical to before.
- Required fields have no `?` in TypeScript and no default in Python.
- `ApiError.details` is optional (`details?:` in TypeScript, `= None` in Python).
- Date-times become `AwareDatetime` in Python, so dates without a time zone are rejected.
- The inline `byState` object produced a helper class called `ByState` in Python.

> Lesson: never edit generated files by hand. If the output is wrong, fix `openapi.yaml`
> (or the generator config) and regenerate.

## Step 5 — Run the full verification

```bash
npm run verify
```

| Check | Result |
|---|---|
| `verify:contract` (regenerate and compare) | ✅ Generated TypeScript and Python match `openapi.yaml` |
| `lint` (ESLint and ruff) | ✅ |
| `typecheck` (`tsc` for the contract, mypy strict for the backend) | ✅ |
| `test` (pytest) | ✅ 2 passed (the existing `HealthStatus` tests) |
| `build` (`uv build`) | ✅ |
| frontend typecheck, test and build | ⚠️ Placeholders only; Angular is not set up yet |

Nothing existing broke, so no test or file had to be changed.

## Step 6 — Extra check of the new models

The existing tests only cover `HealthStatus`. To make sure the new schemas behave as intended,
the assistant validated sample data against the generated Pydantic models in a throwaway script
(no files added). All 13 cases passed, for example:

- A valid `WorkOrder` with `technicianId: null` is accepted.
- A `WorkOrder` without `technicianId`, with an unknown state, or with a date without a time zone
  is rejected.
- `TransitionCommand` accepts `cancel` and rejects `reopen`.
- `AssignmentCommand` rejects an empty technician ID.
- `DashboardSummary` rejects a negative count or a `byState` with a missing state.

**Suggested next step:** turn these cases into real tests in
`apps/backend/tests/test_contract_models.py`, so `npm run verify` covers the new models too.

## How to run the project in the Windows terminal

> **Important:** at this stage there is **no running application yet**. The FastAPI server has no
> routes and the Angular frontend has not been set up. The run command works, but it only prints
> two placeholder messages and exits. What you *can* run for real are the contract generation
> and the verification checks.

### Prerequisites

- [Node.js](https://nodejs.org/) 22 or newer (`node -v`)
- [uv](https://docs.astral.sh/uv/) for Python (`uv --version`). It installs Python 3.13 for you.

### Commands (PowerShell or Command Prompt)

Open a terminal in the project folder. The path contains spaces, so keep the quotes:

```powershell
cd "C:\path\to\Prompt4"
```

First time only: install the Node and Python dependencies:

```powershell
npm run setup
```

Run the app (frontend and backend together):

```powershell
npm run dev
```

Current output: both parts start, print a placeholder and exit with code 0:

```text
[backend] TODO: start FastAPI dev server
[frontend] "TODO: ng serve (Angular 22 not scaffolded yet)"
```

Once the FastAPI server and the Angular app are added in later prompts, this same `npm run dev`
command will start both of them. You can also start each part on its own:

```powershell
npm run backend:dev     # backend only
npm run frontend:dev    # frontend only
```

### Other useful commands

```powershell
npm run contract:generate   # regenerate TypeScript and Python models from openapi.yaml
npm run verify              # contract check, lint, typecheck, tests and build
npm run backend:test        # backend tests only (pytest)
```

## Design assumptions

The prompt left some details open. These are the assumptions made:

1. IDs are plain non-empty strings, not UUIDs or integers.
2. All listed fields are required, except `ApiError.details`.
3. `WorkOrder.technicianId` is always present but can be `null`.
4. `description` is required but may be an empty string.
5. `reference` is assigned by the server and is different from `id`. No format was defined.
6. Timestamps are ISO 8601 date-times with a time zone.
7. "Open" means any state except `completed` and `cancelled`. `criticalOpen` and `unassigned`
   count open work orders only.
8. `byState` always contains every state. It is inline, not a named schema, because the prompt
   asked for the listed schemas only.
9. `ApiError.details` is a free-form object (for example, field errors).
10. Field names use camelCase exactly as given, in both TypeScript and Python.
11. The lifecycle rules are documented but not enforced by the schemas. The backend must enforce them.

## Key takeaways

1. **Read first:** understand the contract and everything that depends on it before editing.
2. **Get a green baseline** before changing anything.
3. **Change the source of truth**, then regenerate. Never edit generated code.
4. **Verify everything** with one command (`npm run verify`).
5. **Don't hide problems:** if something breaks, stop and explain instead of deleting tests.
6. **Write down your assumptions** so the team can review them.
