---
name: project-engineering-process
description: Use when coordinating day-to-day work on Runway Compass — defines source-of-truth, branch naming, CI expectations, and how to journal/record decisions (GitHub Discussions) while keeping Issues for executable work and Projects for status.
---

# Project Engineering Process (Runway Compass)

## Source of Truth
- Discussions → Journal, Decision Log, Ideas (categories)
- Issues → Executable work with acceptance criteria
- PRs → Code changes linked to Issues
- Projects v2 → Planning and status (Backlog/Now/Next/Done)
- Milestones/Releases → Cadence and notes

## Branching & Commits
- Branch: `feature/<slug>` or `chore/<slug>`
- Keep commits atomic; every PR must reference its primary Issue via `Closes #<id>` so automation updates Projects/Milestones
- Default merge: squash, PR title as commit subject

## CI Discipline
- PRs must be green (lint/tests/build)
- Treat Vercel preview as deployability check; Actions as regression guard

## Journaling & Decisions
- Journal: append status/insights to a single Discussion per effort (daily or per feature)
- Decisions: one Discussion per irreversible decision; keep concise and evergreen
- Avoid ad‑hoc `.md` notes for journal/decisions in the repo; link Discussions from PRs/Issues when relevant

## Working Agreement
1. Ensure an Issue exists for the task (create if missing)
2. Move to In Progress on the Project board
3. Update docs only when system/process actually changes
4. On completion: tests green → PR → merge → close Issue

## Tools
- `gh` CLI for Issues/PRs/Projects/Discussions
- Pair with superpowers:github-program-manager (templates and scripts) and superpowers:tmux-orchestration for parallel agents
