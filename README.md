# OpenCode Agents

A **model-agnostic, globally-installed** multi-agent workflow kit for [OpenCode](https://opencode.ai):
specialized agents, progressive-disclosure skills, and an evaluation journal. Agents carry no
hardcoded model and only the tools, skills, and permissions their role needs.

It is a port of the [`codex-agents`](https://github.com/mikhailtsai/codex-agents) workflow kit to
OpenCode. The goal is reliable software work by delegating bounded tasks to the smallest useful team
and escalating only when evidence justifies the cost.

OpenCode is the runtime. This repository defines the workflow layer: agent definitions, skills,
knowledge-map scaffolding, a validation gate, and an evaluation journal. It does not replace your
project's build system, tests, documentation, or security boundary.

## Philosophy

- **Role isolation over prompt rules.** Each agent gets exactly the tools, skills, and permissions its role needs — nothing more.
- **No model hardcoding.** Agents inherit the OpenCode default model. Escalation is a role choice, not a model pin.
- **A map, not a manual.** `AGENTS.md` is a short router. Detail lives in skills and the closest authoritative artifact.
- **Enforceable invariants over prose.** Agent shape and journal integrity are checked by a script, not by hope.
- **Progressive disclosure.** `SKILL.md` procedures load on demand instead of bloating every agent prompt.
- **Evidence over confidence.** Deterministic checks and independent reviews beat agent self-assessment.
- **Improve the repository, not the prompt.** Recurring failures become checks, docs, or guardrails.

## Requirements

- OpenCode.
- `python3` with PyYAML (used by the validation scripts).

## Install (global)

Agents and skills are installed **globally** so they are available in every repository:

- Agents → `~/.config/opencode/agent/` (or `$OPENCODE_CONFIG_DIR/agent`)
- Skills → `~/.config/opencode/skills/` (or `$OPENCODE_CONFIG_DIR/skills`)

There is no per-project installer. Copy (or symlink) this repository's `agents/*.md` and
`.opencode/skills/*` into those global directories, then restart OpenCode.

## Agents

| Agent | Role |
|---|---|
| `orchestrator` | primary; routes work to the smallest useful team, owns the outcome |
| `product-analyst` | requirements, acceptance criteria, business rules, edge cases |
| `system-analyst` | end-to-end flows across UI, services, APIs, persistence, events |
| `researcher` | read-only technical/code investigation |
| `implementer` | bounded implementation |
| `worker` | mechanical edits, commands, diagnostics, narrow fixes |
| `test-engineer` | behavioral/regression tests and validation |
| `reviewer` | correctness, regressions, contracts and architecture review |
| `requirements-reviewer` | acceptance against the original request |
| `security-reviewer` | security-sensitive changed surfaces only |
| `architect` | rare architecture escalation |
| `oracle` | last-resort reasoning escalation |

Permissions mirror each role's sandbox: read-only roles deny edits and allow only read-only git
commands; write roles can edit and run commands; no agent has web access. See `AGENTS.md` for the full
routing and completion policy.

## Workflow layer

- **Skills** (`.opencode/skills/`): `bootstrap-project`, `debug`, `plan`, `verify`, `review-loop`,
  `improve-harness`, `docs-gardening`, `record-outcome`, `evaluate-harness`.
- **Knowledge maps** (`docs/agent/`): `architecture.md`, `product.md`, `workflows.md`, `quality.md`,
  created by `bootstrap-project` when repository knowledge is missing.
- **Durable plans** (`docs/exec-plans/`): active work and completed plans for complex tasks.
- **Outcome journal** (`.opencode-evals/runs.jsonl`): compact, non-sensitive records after substantial work.

## Harness evaluation with Codeburn

Do not run Codeburn after every task; per-task samples are too small. Use two complementary signals:

1. **Qualitative** — `record-outcome` appends one compact record to `.opencode-evals/runs.jsonl`
   after each *substantial* task (outcome, agents used, retries, checks, escalations, human corrections).
2. **Quantitative** — run Codeburn periodically (end of session / weekly / after a batch of tasks):
   - `codeburn optimize` — token waste and exact fixes.
   - `codeburn report` / `codeburn sessions` — session-level cost/token/cache.
   - `codeburn models --agent` — per-role spend.

Then run `evaluate-harness` to correlate the two, find repeated failure classes, and apply
`improve-harness` for the smallest durable fix. Never store prompts, code, secrets, or raw telemetry
in the journal.

## Validation

Run the structural gate from the repository root:

```
python3 scripts/check-roster.py
```

`check-roster.py` cross-checks the source `agents/*.md`, the deployed global agents
(`$OPENCODE_CONFIG_DIR/agent`), and the authoritative map in `AGENTS.md`: every enabled subagent
must be allow-listed in the orchestrator's `permission.task`, `researcher` must keep web access, and
`AGENTS.md` must only reference existing agents. Requires PyYAML.

`eval-report.py` summarizes and validates the outcome journal (`.opencode-evals/runs.jsonl`).

## Repository layout

```
agents/                     agent definitions (model-agnostic)
.opencode/skills/           9 progressive-disclosure skills
scripts/
  check-roster.py           agent/roster structural gate
  eval-report.py            journal metrics
  eval_schema.py            shared journal schema validation
.opencode-evals/            evaluation journal
docs/agent/                 agent knowledge map (built by bootstrap-project)
docs/exec-plans/            durable active/completed plans
AGENTS.md                   routing and completion policy
```

## Scope

This kit defines a reusable workflow across projects. It intentionally does not implement scheduling,
worktrees, deployment, CI, or project-specific tests. It complements, rather than replaces, OpenCode's
built-in agents and your project's own tooling.
