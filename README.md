# OpenCode Agents

A repository-local multi-agent workflow kit for [OpenCode](https://opencode.ai): specialized agents,
progressive-disclosure skills, deterministic validation, an outcome journal, and a small harness-improvement loop.

It is a port of the [`codex-agents`](https://github.com/mikhailtsai/codex-agents) workflow kit to OpenCode.
The goal is to get reliable software work out of economical models by delegating bounded tasks to the
smallest useful team and escalating only when evidence justifies the cost.

OpenCode is the runtime. This repository adds only the workflow layer: agent definitions, skills,
knowledge-map scaffolding, a validation gate, and an evaluation journal. It does not replace your
project's build system, tests, documentation, or security boundary.

## Philosophy

- **Economical model first.** The primary session and most agents run on the cheap default model; escalation is exceptional.
- **A map, not a manual.** `AGENTS.md` is a short router. Detail lives in skills and the closest authoritative artifact.
- **Enforceable invariants over prose.** Model routing, agent shape, and journal integrity are checked by a script, not by hope.
- **Progressive disclosure.** `SKILL.md` procedures load on demand instead of bloating every agent prompt.
- **Evidence over confidence.** Deterministic checks and independent reviews beat agent self-assessment.
- **Improve the repository, not the prompt.** Recurring failures become checks, docs, or guardrails.

## Requirements

- OpenCode (agents live in `.opencode/agents/`, skills in `.opencode/skills/`).
- One of:
  - OpenRouter access (`OPENROUTER_API_KEY`) for the `normal` and `cheap` variants, or
  - a local llama.cpp OpenAI-compatible server for the `local` variant (see `llamacpp` provider below).
- `python3` with PyYAML (used by the installer and validation scripts).

## Install

```
bash install.sh <target-dir> [normal|cheap|local]   # default: normal
```

Files are **copied (replaced)**, not symlinked. Managed agent, skill, script, and `model-policy.json`
files are overwritten on each run. Project-owned docs (`docs/agent/README.md`) and eval state
(`codeburn-state.json`, `runs.jsonl`) are created only if absent. The selected variant patches the
installed agent models from the matching `model-policy*.json`.

### Global command

`bin/opencode-agents` is a wrapper you can put on `PATH` to install from anywhere:

```
ln -sf "$PWD/bin/opencode-agents" ~/.local/bin/opencode-agents   # or any PATH dir

cd /path/to/project && opencode-agents install          # normal, current dir
opencode-agents install cheap                            # cheap variant
opencode-agents install local                            # local llama.cpp models
opencode-agents install normal --target /path/to/project
opencode-agents check                                    # run check-harness
opencode-agents report                                   # run eval-report
```

After installing, restart OpenCode so project agents and skills are loaded.

### AGENTS.md merge

The workflow map is merged into `AGENTS.md` via a managed block:

```
<!-- opencode-agents:begin -->
...kit routing and completion policy...
<!-- opencode-agents:end -->
```

- No `AGENTS.md` → it is created containing the block.
- Existing `AGENTS.md` → the block is **appended**; the project's own content is preserved.
- Re-running install (or switching variant) → the existing block is replaced in place, no duplicates.

The merge never deletes project-authored content.

## Model variants

The model mapping is defined per agent in `model-policy.json` and enforced by `scripts/check-harness.py`.
The installer swaps in `model-policy.cheap.json` or `model-policy.local.json` for those variants.

### normal

- `architect`, `oracle`: `openrouter/z-ai/glm-5.3-flash`.
- All other agents (including `orchestrator`): `openrouter/deepseek/deepseek-v4.1-flash`.

### cheap

Swaps DeepSeek/GLM for much cheaper OpenRouter models (~6x cheaper on output for routine roles):

- `architect`, `oracle`: `openrouter/openai/gpt-oss-120b`.
- All other agents: `openrouter/inclusionai/ling-3.0-flash`.

### local

Routes to a local llama.cpp server via the `llamacpp` provider (`http://127.0.0.1:8642/v1`).
Speed-oriented: the heavy models are reserved for the rare escalation roles.

- `architect`, `oracle`: `llamacpp/qwen-local` (Qwen 3.8 27B — rare, quality over latency).
- `orchestrator`, `implementer`, `test-engineer`, `reviewer`, `security-reviewer`: `llamacpp/qwen-orch-14b` (Qwen3 14B).
- `worker`: `llamacpp/nemotron` (Nemotron Nano 12B — fastest).
- `product-analyst`, `system-analyst`, `researcher`, `requirements-reviewer`: `llamacpp/gemma-orch-12b` (Gemma 4 12B).

The `llamacpp` provider and model names come from your global OpenCode config; edit
`model-policy.local.json` to match your own models.

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

Last-review tracking: `.opencode-evals/codeburn-state.json` is updated by `evaluate-harness`
(`python3 scripts/codeburn_state.py mark`). The orchestrator runs
`python3 scripts/codeburn_state.py check` after substantial work and suggests `evaluate-harness`
when the review is due (default interval: 7 days).

## Validation

Run the local gate from the repository root:

```
python3 scripts/check-harness.py
python3 scripts/eval-report.py
```

`check-harness.py` validates agent frontmatter and mode, the model policy in `model-policy.json`,
skill frontmatter, `AGENTS.md` discoverability, required artifacts, the journal, and the Codeburn
state file. `eval-report.py` validates the same journal and computes outcome/retry/escalation metrics.
Both work in the source kit layout (`agents/`) and after installation (`.opencode/agents/`).
Requires PyYAML.

## Repository layout

```
agents/                     agent definitions (source layout)
.opencode/skills/           9 progressive-disclosure skills
bin/opencode-agents         global installer/check wrapper
scripts/
  check-harness.py          structural + policy gate
  eval-report.py            journal metrics
  eval_schema.py            shared journal schema validation
  codeburn_state.py         Codeburn last-run tracking (check/mark)
  apply-model-policy.py     rewrites agent models from a policy
  merge-agents-md.py        managed-block AGENTS.md merge
model-policy.json           normal model mapping (source of truth)
model-policy.cheap.json     cheap variant mapping
model-policy.local.json     local variant mapping
.opencode-evals/            evaluation journal + Codeburn state
docs/agent/                 agent knowledge map (built by bootstrap-project)
docs/exec-plans/            durable active/completed plans
AGENTS.md                   routing and completion policy
install.sh                  installer
```

## Scope

This kit defines the workflow inside one project. It intentionally does not implement scheduling,
worktrees, deployment, CI, or project-specific tests. It complements, rather than replaces, OpenCode's
built-in agents and your project's own tooling.
