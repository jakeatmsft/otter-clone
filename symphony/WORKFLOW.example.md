---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  project_owner: your-github-user-or-org
  # Set this only for repository-scoped projects. Remove it for user/org-scoped projects.
  project_repository: your-repo
  project_number: replace-with-github-project-number
  status_field_name: Status
  priority_field_name: Priority
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Closed
    - Cancelled
    - Canceled
    - Duplicate

polling:
  interval_ms: 30000

workspace:
  root: ./.symphony-workspaces

hooks:
  after_create: |
    git init >/dev/null 2>&1 || true
  timeout_ms: 60000

agent:
  max_concurrent_agents: 4
  max_turns: 20
  max_retry_backoff_ms: 300000
  max_concurrent_agents_by_state:
    In Progress: 2

codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_timeout_ms: 3600000
  read_timeout_ms: 5000
  stall_timeout_ms: 300000
---

You are the coding agent for the issue below.

Ticket: {{ issue.identifier }} - {{ issue.title }}
State: {{ issue.state }}
Attempt: {% if attempt %}{{ attempt }}{% else %}first run{% endif %}

Repository rules:

- Work only inside the current workspace.
- Prefer precise changes that resolve the issue cleanly.
- Update tests when behavior changes.
- If the issue is blocked, explain the blocker in the workpad and stop.

Issue description:

{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Useful metadata:

- Labels: {{ issue.labels | join: ", " }}
- Issue URL: {{ issue.url }}
