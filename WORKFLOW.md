---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  # Use the repo owner for repository-scoped projects. Remove `project_repository`
  # below if your project is user-scoped instead.
  project_owner: yuki-leong-1
  project_repository: otter-clone
  # Replace this with the GitHub Project number for this repo.
  project_number: replace-with-github-project-number
  status_field_name: Status
  priority_field_name: Priority
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Closed
    - Canceled
    - Cancelled

polling:
  interval_ms: 30000

workspace:
  # Keep issue workspaces on the Linux filesystem instead of /mnt/c.
  root: ~/symphony-workspaces/otter-clone

hooks:
  after_create: |
    set -eu

    SOURCE_REPO=/mnt/c/repo/otter-clone
    SOURCE_BRANCH=master

    if [ ! -d .git ]; then
      git clone --branch "$SOURCE_BRANCH" "$SOURCE_REPO" .
    fi

    # Overlay the current working tree once so brand-new workspaces include local repo edits.
    tar \
      -C "$SOURCE_REPO" \
      --exclude=.git \
      --exclude=node_modules \
      --exclude=.next \
      --exclude=.symphony-workspaces \
      --exclude=public/uploads \
      --exclude=data/transcripts \
      -cf - . | tar -xf -

    if [ -f "$SOURCE_REPO/.env.local" ] && [ ! -f .env.local ]; then
      cp "$SOURCE_REPO/.env.local" .env.local
    fi

  before_run: |
    set -eu

    SOURCE_REPO=/mnt/c/repo/otter-clone

    mkdir -p data/transcripts public/uploads

    if [ -f "$SOURCE_REPO/.env.local" ] && { [ ! -f .env.local ] || [ "$SOURCE_REPO/.env.local" -nt .env.local ]; }; then
      cp "$SOURCE_REPO/.env.local" .env.local
    fi

    if [ -f package-lock.json ]; then
      if [ ! -f .symphony-deps.stamp ] || [ package.json -nt .symphony-deps.stamp ] || [ package-lock.json -nt .symphony-deps.stamp ]; then
        npm install --no-fund --no-audit
        touch .symphony-deps.stamp
      fi
    fi

  timeout_ms: 600000

agent:
  max_concurrent_agents: 2
  max_turns: 20
  max_retry_backoff_ms: 300000
  max_concurrent_agents_by_state:
    In Progress: 1

codex:
  command: CODEX_HOME=$HOME/.codex codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_timeout_ms: 3600000
  read_timeout_ms: 30000
  stall_timeout_ms: 300000
---

You are working in the `otter-clone` repository, a Next.js 15 App Router application for audio transcription and AI summaries.

Issue:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- State: {{ issue.state }}
- Attempt: {% if attempt %}{{ attempt }}{% else %}first run{% endif %}

Context:
- Labels: {% if issue.labels.size > 0 %}{{ issue.labels | join: ", " }}{% else %}none{% endif %}
- Issue URL: {{ issue.url }}

Issue description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Blockers:
{% if issue.blocked_by.size > 0 %}
{% for blocker in issue.blocked_by %}
- {{ blocker.identifier }} (state: {{ blocker.state }})
{% endfor %}
{% else %}
- none listed by the tracker
{% endif %}

Working rules:
- Work only inside the current workspace.
- Preserve useful existing changes already present in this issue workspace.
- Keep changes scoped to the ticket.
- Follow the existing Next.js, TypeScript, and Tailwind patterns in the repo.
- Avoid long-running foreground processes like `npm run dev` unless the task specifically requires them.
- Prefer targeted verification while you work. Before you stop, run the strongest relevant non-interactive check you can.
- When app behavior, routing, build config, or API code changes, run `npm run build` before finishing if it is practical.
- If a fix depends on live OpenAI or Anthropic credentials or uploaded audio, validate as far as practical without unnecessary external calls, then state what remains unverified.
- Do not modify secrets.

Expected output:
- Implement the issue completely.
- Update or add tests when the repo has a sensible place for them.
- Leave the workspace in a state another engineer can inspect and continue.
