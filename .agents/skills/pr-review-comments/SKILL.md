---
name: pr-review-comments
description: Triage unresolved GitHub PR review threads — assess merit, apply fixes when warranted, reply on each thread, and resolve it. Use when the user types `/pr-comments`, asks to address PR feedback, resolve review comments, or clear unaddressed inline review threads before merge.
user-invocable: true
argument-hint: "Optional: PR number, branch name, or GitHub PR URL"
---

# PR Review Comments

Workflow for **unresolved inline review threads** on a GitHub PR: collect them, judge merit, fix when warranted, push, reply, resolve.

Use `gh` (and GitHub GraphQL when needed — there is no `gh` subcommand to resolve inline threads). No custom scripts.

## When to use

- Open inline review threads before merge.
- After Bugbot, Copilot, or human inline comments.
- User asks to address PR feedback or `/pr-comments`.

## Workflow

### 1. Set up

- Confirm `gh auth status`.
- Resolve the PR from the skill argument, `gh pr view` on the current branch, or ask.
- `gh pr checkout <n>` and `git pull --ff-only`.

### 2. List open threads

Fetch unresolved inline review threads for the PR. Filter to `isResolved == false`.

Inline threads are not the same as PR timeline comments (`gh pr view --comments`) — only threads can be resolved in the GitHub UI.

For bot comments (Bugbot, etc.), ignore HTML and "Fix in Cursor" links; read the title and description body.

### 3. Triage each thread

Read the cited file on `HEAD` (use `originalLine` when the thread is outdated).

| Merit | Action |
| --- | --- |
| `fix` | Valid bug, security, correctness, or repo rule violation → code change |
| `already-fixed` | Valid but already on `HEAD` → cite file:line |
| `explain` | False positive, intentional, or below-threshold nit → reply with evidence |
| `defer` | Valid but out of this PR's scope → reply; link/create Linear issue if needed |
| `needs-human` | Design/product disagreement → reply with options; **do not resolve** |

Bias: fix Critical/High findings; treat linked Bugbot learned rules as team policy unless clearly wrong on inspection.

For many threads (>4), optional read-only `explore` subagents by directory, then merge triage in the main agent.

### 4. Fix, commit, push

Minimal scoped changes per `AGENTS.md`. Group related review points into one commit. Push before replying so you can cite the SHA.

Run targeted tests for code you change.

### 5. Reply and resolve

Reply on each thread (plain markdown): what you did, short SHA if fixed, tests run.

Resolve the thread when the loop is closed (fixed, explained, or verified on `HEAD`).

Do **not** resolve `needs-human` threads or unanswered reviewer questions.

Timeline-only PR comments: reply with `gh pr comment` — they cannot be resolved like inline threads.

### 6. Summarize

Short table for the user: thread, file, merit, action, resolved?, commits, tests, anything still open.

## Guardrails

- Never resolve without reading current code.
- Push before replying when you landed a fix.
- Do not greenwash the PR by resolving threads you did not evaluate.

## Related skills

- `parallel-code-review` — proactive review before feedback arrives.
- `react-doctor` — after web UI fixes.
