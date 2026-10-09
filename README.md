# OpenCode Agents

A model-agnostic, globally-installed multi-agent workflow for [OpenCode](https://opencode.ai).
This repository is the source for those agents and the four workflow skills they use. Agents carry
no hardcoded model and only the tools, skills, and permissions their role needs.

## Install (global)

Agents and skills are installed globally so they are available in every repository:

- Agents → `~/.config/opencode/agent/` (or `$OPENCODE_CONFIG_DIR/agent`)
- Skills → `~/.config/opencode/skills/` (or `$OPENCODE_CONFIG_DIR/skills`)

There is no per-project installer. Copy (or symlink) `agents/*.md` and `.opencode/skills/*` into
those global directories, then restart OpenCode.

## Agents

| Agent | Role |
|---|---|
| `orchestrator` | primary; routes work to the smallest useful team, owns the outcome |
| `product-analyst` | requirements, acceptance criteria, business rules, edge cases |
| `system-analyst` | end-to-end flows across UI, services, APIs, persistence, events |
| `researcher` | read-only technical/code investigation (web access) |
| `implementer` | bounded implementation |
| `worker` | mechanical edits, commands, diagnostics, narrow fixes |
| `test-engineer` | behavioral/regression tests and validation |
| `reviewer` | correctness, regressions, contracts and architecture review |
| `requirements-reviewer` | acceptance against the original request |
| `security-reviewer` | security-sensitive changed surfaces only |
| `architect` | rare architecture escalation |
| `oracle` | last-resort reasoning escalation |

Permissions mirror each role's sandbox: read-only roles deny edits; write roles can edit and run
commands. See `AGENTS.md` for the full routing and completion policy.

## Skills

- `plan` — execution plans for complex or risky work
- `debug` — reproduce, narrow, and prove a fix
- `verify` — prove a change works with deterministic checks
- `review-loop` — independent review and correction before handoff
