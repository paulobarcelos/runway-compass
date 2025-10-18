# Runway Compass – Engineering Process

## Branching Strategy
- Use `main` as the stable branch.
- Create feature branches per issue using the convention `feature/<short-description>` or `chore/<task-name>`.
- Open pull requests referencing the associated GitHub issue; keep scope focused and commits atomic.

## Code Review & Testing
- PR template should include summary, testing notes, and any open questions.
- Run available unit/integration tests locally before requesting review.
- Require at least one approval (self-review acceptable for solo development, but document rationale).

## Documentation
- Update relevant files in `docs/` whenever scope or architecture changes.
- Record major decisions in `docs/notes/decision-log.md`.
- Keep README links current to point to canonical documentation.

## Issue Workflow
1. Create or select an issue describing the task, acceptance criteria, and dependencies.
2. Move issue to “In Progress” on the GitHub Project board when development starts.
3. Open a PR linked to the issue; keep description updated.
4. After merging, move the issue to “Done” and add a note to the decision log if needed.

## Environment Management
- Store secrets via Vercel/Local env managers; never commit `.env` files.
- Document required environment variables and setup steps in `README.md`.

## Release Process
- Deployments triggered on merge to `main` (Vercel). Verify production app after each deploy.
- Tag significant milestones (v0.1.0 for MVP) and summarize changes in release notes.

## Collaboration Expectations
- Maintain daily status updates on the project board or decision log for asynchronous alignment.
- When multiple agents work in parallel, coordinate tab/feature ownership to minimize merge conflicts.
- Use draft PRs for visibility when work is ongoing.

