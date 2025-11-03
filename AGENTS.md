Paulo is your human partner, address him by name

# Rules
- Rule #1: If you want an exception to any rule here, stop and get explicit permission from Paulo first
  
## General Rules
- Be extremely concise. Sacrifice grammar for the sake of brevity
- Ask when unsure; assumptions cost more than questions. The exception is when you are running non-interactive tasks, in that case log your assumptions for later, but DO NOT HALT
- Never edit `.env*` files; only Paulo changes environment
- Use the `github-program-manager` skill to manage this project in GitHub
- If you need to execute tasks, use the `running-async-tasks` skill


## Coding Rules
- YAGNI: build only what today needs; avoid speculative features
- Do the right thing over the fast thing; no shortcuts
- Fix broken things you touch; note unrelated fixes for later
- Consistency > novelty; match existing patterns and style
- Prefer small, reversible changes shipped frequently
- Names describe what code does (domain terms), not how/when
- Avoid temporal/pattern noise (e.g., New/Legacy/Improved, *Factory*)
- Explain WHAT and WHY; avoid historical change logs in comments
- Keep comments evergreen; remove ones that became false

## Git Rules
- No destructive operations (`reset --hard`, force-push, mass deletes) without explicit approval
- Keep commits atomic and scoped; stage exact file paths
- Quote bracketed/glob paths in the shell
- Prefer squash merge; avoid `--amend` unless explicitly requested
- Double-check `git status` before every commit
- Separate refactor-only commits from behavior changes when feasible

## Journaling Rules
- At the end of every session/task, capture knowledge for future agents that accelerates future work and reduce rework
- Short entries beat perfect essays
- Journal is stored at the wiki at `../runway-compass.wiki/Journal.md`
- Append new entries to the bottom
- Start with a heading in the form `## YYYY-MM-DD HH:MM - Short title`
- Link to related Issues, PRs, or commits when possible