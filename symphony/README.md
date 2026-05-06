# Symphony

This directory contains a standalone Node.js implementation of the [Symphony service specification](https://github.com/openai/symphony/blob/main/SPEC.md) for this repository.

## What It Implements

- `WORKFLOW.md` loading with YAML front matter and strict Liquid prompt rendering
- typed config resolution with defaults, `$VAR` indirection, path normalization, and live reload
- Linear or GitHub Projects v2 polling, reconciliation, startup terminal-workspace cleanup, and issue normalization
- per-issue workspace management with lifecycle hooks and path-safety enforcement
- Codex app-server orchestration over stdio with continuation turns, retry backoff, and structured logging
- runtime snapshot support through `Orchestrator#snapshot()`

Optional HTTP dashboard/server endpoints from the spec are not implemented here.

## Run

Install dependencies:

```bash
npm install
```

Start Symphony from the repo root using the default `WORKFLOW.md`:

```bash
npm run symphony
```

Or point it at an explicit workflow file:

```bash
npm run symphony -- ./symphony/WORKFLOW.example.md
```

Run the targeted test suite:

```bash
npm run test:symphony
```

Startup environment behavior:

- Symphony automatically loads `.env.local` from the current working directory before validating `WORKFLOW.md`
- if the workflow file lives in a different directory, Symphony also checks `.env.local` next to that workflow file
- existing exported environment variables win; `.env.local` only fills in missing values
- obvious placeholder values such as `your_openai_api_key_here` are ignored

## Workflow Contract

Symphony loads `WORKFLOW.md` from:

1. the CLI path argument, when provided
2. otherwise the current working directory

The file format matches the spec:

- optional YAML front matter between leading `---` markers
- Markdown body as the prompt template
- strict Liquid rendering for `issue` and `attempt`

See [WORKFLOW.example.md](/mnt/c/repo/otter-clone/symphony/WORKFLOW.example.md) for a starting point.

## Tracker Config

GitHub Projects v2 uses:

- `tracker.kind: github`
- `tracker.api_key: $GITHUB_TOKEN`
- `tracker.project_owner`: GitHub user or organization login
- `tracker.project_number`: project number from the GitHub UI
- `tracker.project_repository`: optional, only for repository-scoped projects
- `tracker.status_field_name`: optional, defaults to `Status`
- `tracker.priority_field_name`: optional, defaults to `Priority`

Linear remains supported with:

- `tracker.kind: linear`
- `tracker.api_key: $LINEAR_API_KEY`
- `tracker.project_slug`

## Implementation-Defined Policy

This implementation intentionally targets a non-interactive local operator environment.

- Default `codex.approval_policy`: `never`
- Default `codex.thread_sandbox`: `workspace-write`
- Default `codex.turn_sandbox_policy`: generated `workspaceWrite` policy scoped to the issue workspace, with `networkAccess: false`
- Command execution approvals: auto-approve for the session only when the effective approval policy is `never`; otherwise deny
- File-change approvals: auto-approve for the session only when the effective approval policy is `never`; otherwise deny
- Permissions approval requests: deny by returning an empty permission grant for the current turn
- `item/tool/requestUserInput`: auto-answer approval-like prompts only in auto-approve mode; otherwise respond with a non-interactive message
- turn-level input-required signals: fail the run immediately so it cannot stall indefinitely
- MCP elicitation requests: decline

## Dynamic Tool Support

The optional `linear_graphql` and `github_graphql` client-side tools are implemented. They accept either:

- a raw GraphQL document string
- an object with `query` and optional `variables`

Behavior:

- exactly one GraphQL operation per call
- reuses the active Symphony tracker endpoint and auth
- returns `success=false` for invalid input, missing auth, transport failures, unsupported tools, or GraphQL top-level `errors`

Compatibility note:

- the installed Codex app-server schema in this environment exposes `item/tool/call` but does not expose a startup field for advertising dynamic tools in `thread/start` or `turn/start`
- this implementation therefore handles dynamic tool calls when requested by the app-server, but cannot proactively declare them through a schema field that does not exist in the targeted protocol version

## Workspace Behavior

- Workspace root defaults to `<tmp>/symphony_workspaces`
- Issue identifiers are sanitized to `[A-Za-z0-9._-]`
- Workspaces are reused across runs
- Successful runs do not remove workspaces
- Startup cleanup removes workspaces for issues already in terminal states
- Terminal transitions during reconciliation also remove the workspace
- Existing non-directory paths at a workspace location are treated as fatal conflicts and are not replaced
- GitHub issue dependencies are not currently mapped into `blocked_by`; GitHub-backed runs therefore dispatch from project status alone

## Logging And Monitoring

- Structured logs are emitted to stderr as stable `key=value` lines
- `Orchestrator#snapshot()` returns the recommended runtime state view from the spec
