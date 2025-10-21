# Runway Compass – Workflow & Tracking Guide

## Source Of Truth Hierarchy

- **Product Requirements (docs/product/PRD.md):** Canonical scope and milestones. Update only when requirements change.
- **GitHub Issues & Project Board:** Single source of truth for day-to-day work. Every task maps to an issue with acceptance criteria and status on the board.
- **Decision Log (docs/notes/decision-log.md):** Immutable record of irreversible choices (architecture, process, tooling). One concise entry per decision.
- **Engineering Journal (docs/notes/journal.md):** Evergreen notes, troubleshooting, and heuristics worth remembering. Optional but encouraged.
- **Repository Docs (docs/…):** Deep dives (architecture, process, setup). Update when the underlying systems or policies change.
- **Commits / PRs:** Atomic implementation history linked back to issues.

## Onboarding Checklist

1. Read this guide, then skim the PRD and relevant Decision Log entries.
2. Pull `main`, run `npm install` (once), and execute `npm test` / `npm run lint` to ensure the workspace is healthy.
3. Review open GitHub issues (via `gh`) to select work; coordinate with Paulo if unsure.

## Working Agreement

### Before You Start
1. Confirm the task has a GitHub issue with acceptance criteria. Create one if needed.
2. Move the issue to **In Progress** and note any dependencies.
3. Review the PRD and Decision Log to ensure the task aligns with agreed scope.

### While Coding
1. Branch from `main` using `feature/<slug>` or `chore/<slug>`.
2. Reference the issue in commit messages / PR description.
3. Update documentation that reflects system behaviour (architecture, process, README).
4. When documenting insights, prefer the Engineering Journal; reserve the Decision Log for lasting decisions.

### After The Work Is Ready
1. Run tests and lint locally.
2. Open a PR linked to the issue (draft until feedback-ready). Include summary + testing.
3. On merge to `main`:
   - Append a line to `docs/notes/decision-log.md` **only** if the work introduced a durable decision. Keep entry date-aligned.
   - Capture reusable insights in the Engineering Journal when they benefit future work.
   - Close/move the GitHub issue to **Done**.

### When To Update Which Artifact

| Event | Artifact(s) |
| --- | --- |
| Scope change / milestone shift | PRD, GitHub issues |
| Architecture/process/tooling decision | Decision Log, relevant doc |
| Feature/bugfix implementation | Issue, commits, PR |
| Reusable insight / troubleshooting | Engineering Journal |
| Operational checklist change | docs/engineering/process.md |

## Best Practices

- **Decision Log entries are permanent:** avoid references to branch names; use present-tense descriptions.
- **Issues own the details:** track subtasks, discussion, and acceptance results inside GitHub issues.
- **Docs reflect `main`:** never record unmerged work.
- **Commits are atomic:** each commit corresponds to an issue slice and links back via message or PR description.
- **Use GitHub CLI:** prefer `gh issue <…>` / `gh project <…>` when updating progress so the project board stays aligned with code changes.
- **Journal stays evergreen:** update entries when they aid future work; prune obsolete advice.

### Issue Hygiene
- Use the markdown task list in each issue (`- [ ] Task`) to track progress. Check the box (`- [x] Task`) instead of posting “done” comments.
- Keep issue bodies authoritative: adjust tasks, links, or acceptance criteria via `gh issue edit <number> --body-file …`.
- Comments are for clarifications or blockers only; prefer updating the task list or project status for routine progress.

## Questions To Ask When Unsure

1. “Has this change landed on `main`?” If no, log it in the issue, not in docs.
2. “Does this alter how we build/operate going forward?” If yes, capture it in the decision log.
3. “Will future contributors need context?” If yes, update the relevant doc under `docs/`.

## Recommended CLI Commands

- `git status`, `git add -- path/to/file`, `git commit -m "scope: message" -- …`
- `git log --oneline`, `git diff <base>..HEAD`
- `gh issue list`, `gh project`, `gh pr status`
- `npm test`, `npm run lint`
