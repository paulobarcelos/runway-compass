# Runway Compass – Workflow & Tracking Guide

## Source Of Truth Hierarchy

- **Product Requirements (docs/product/PRD.md):** Canonical scope and milestones. Update only when requirements change.
- **GitHub Issues & Project Board:** Primary vehicle for day-to-day work. Every task maps to an issue with acceptance criteria and status on the board.
- **Status Note (docs/notes/status.md):** High-level snapshot of current milestone progress on `main`. Update immediately after a merge that materially changes scope, state, or next steps.
- **Decision Log (docs/notes/decision-log.md):** Immutable record of irreversible choices (architecture, process, tooling). One concise entry per decision.
- **Repository Docs (docs/…):** Deep dives (architecture, process, setup). Update when the underlying systems or policies change.
- **Commits / PRs:** Atomic implementation history linked back to issues.

## Working Agreement

### Before You Start
1. Confirm the task has a GitHub issue with acceptance criteria. Create one if needed.
2. Move the issue to **In Progress** and note any dependencies.
3. Review the PRD and Decision Log to ensure the task aligns with agreed scope.

### While Coding
1. Branch from `main` using `feature/<slug>` or `chore/<slug>`.
2. Reference the issue in commit messages / PR description.
3. Update documentation that reflects system behaviour (architecture, process, README).
4. Avoid editing `docs/notes/status.md` or `docs/notes/decision-log.md` until the work is merge-ready.

### After The Work Is Ready
1. Run tests and lint locally.
2. Open a PR linked to the issue (draft until feedback-ready). Include summary + testing.
3. On merge to `main`:
   - Update `docs/notes/status.md` with new date, latest `main` commit, notable progress, and refreshed “Next Steps”.
   - Append a line to `docs/notes/decision-log.md` **only** if the work introduced a durable decision. Keep entry date-aligned.
   - Close/move the GitHub issue to **Done**.

### When To Update Which Artifact

| Event | Artifact(s) |
| --- | --- |
| Scope change / milestone shift | PRD, Status |
| Architecture/process/tooling decision | Decision Log, relevant doc |
| Feature/bugfix implementation | Issue, commits, PR, Status |
| Operational checklist change | docs/engineering/process.md |

## Best Practices

- **Status Note stays concise:** summarize current milestone, latest `main` commit, and upcoming focus. Do not list in-flight branch work.
- **Decision Log entries are permanent:** avoid references to branch names; use present-tense descriptions.
- **Issues own the details:** track subtasks, discussion, and acceptance results inside GitHub issues.
- **Docs reflect `main`:** never record unmerged work.
- **Commits are atomic:** each commit corresponds to an issue slice and links back via message or PR description.

## Questions To Ask When Unsure

1. “Has this change landed on `main`?” If no, log it in the issue, not the status note.
2. “Does this alter how we build/operate going forward?” If yes, capture it in the decision log.
3. “Will future contributors need context?” If yes, update the relevant doc under `docs/`.
