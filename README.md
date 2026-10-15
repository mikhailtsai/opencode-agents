# OpenCode Agents

A globally-installed multi-agent workflow for [OpenCode](https://opencode.ai), pinned to direct
DeepSeek models. Agents run on `deepseek/deepseek-flash` with a per-role reasoning effort
(`low`/`high`/`max`) — `#max` is the escalation tier — and carry only the tools, skills, and
permissions their role needs.

## Install (global)

Agents and skills are installed globally so they are available in every repository:

- Core agents → `~/.config/opencode/agent/` (copy `agents/*.md`)
- Skills → `~/.config/opencode/skills/` (copy `.opencode/skills/*`)
- Plugin → `~/.config/opencode/plugins/agent-models/` (copy `plugins/agent-models/index.ts`)

The seven domain agents (`web-browser-agent`, `devops`, `motion-designer`, `uxui`, `gamedev`, `blender`, `project-manager`) are
defined inline in `~/.config/opencode/opencode.json` under `agent`, not as files, because they bind
the MCP servers and skill paths declared in that same file. They are not part of this repository.

Restart OpenCode after changing agent files or the JSON config: on Linux the file-watcher backend is
unavailable, so an already-used directory does not pick up edits. The exception is the per-subagent
model overrides below, which are re-read on every subagent launch and apply immediately.

## Per-subagent model overrides

`plugins/agent-models/` is a plugin that lets you run chosen subagents on a different model and
reasoning effort without touching their definitions. It reads
`~/.config/opencode/agent-models.json` on every subagent launch and switches that subagent's model
for the session, so edits apply immediately — no restart.

```json
{
  "worker":      { "providerID": "openrouter", "model": "xiaomi/mimo-v2.6-pro", "variant": "none" },
  "implementer": { "providerID": "openrouter", "model": "xiaomi/mimo-v2.6-pro", "variant": "thinking" },
  "researcher":  { "providerID": "openai",     "model": "gpt-6-luna",        "variant": "high" }
}
```

An empty object (`{}`) overrides nothing. The `variant` is the model's own effort/variant name, so it
must exist for the target model (`openrouter/xiaomi/mimo-v2.6-pro` has `none`/`thinking`;
`openai/gpt-6-luna` has `none`/`low`/`medium`/`high`/`xhigh`/`max`; `deepseek/deepseek-flash` has
`high`/`low`/`max` defined in the global config). Only subagent (child) sessions are affected; the
primary agent keeps whatever model the session selected.

## Agents

Core agents (source of truth: `agents/*.md`):

| Agent | Role | Model · effort |
|---|---|---|
| `orchestrator` | primary; routes work to the smallest useful team, owns the outcome | deepseek/deepseek-flash · high |
| `solo` | primary; full-access generalist that does the work itself, bypassing orchestration | deepseek/deepseek-flash · high |
| `product-analyst` | requirements, acceptance criteria, business rules, edge cases | deepseek/deepseek-flash · high |
| `system-analyst` | end-to-end flows across UI, services, APIs, persistence, events | deepseek/deepseek-flash · high |
| `researcher` | read-only technical/code investigation (web access) | deepseek/deepseek-flash · low |
| `implementer` | bounded implementation | deepseek/deepseek-flash · high |
| `worker` | mechanical edits, commands, diagnostics, narrow fixes | deepseek/deepseek-flash · low |
| `test-engineer` | behavioral/regression tests and validation | deepseek/deepseek-flash · low |
| `reviewer` | correctness, regressions, contracts and architecture review | deepseek/deepseek-flash · max |
| `requirements-reviewer` | acceptance against the original request | deepseek/deepseek-flash · max |
| `security-reviewer` | security-sensitive changed surfaces only | deepseek/deepseek-flash · max |
| `architect` | rare architecture escalation | deepseek/deepseek-flash · max |
| `oracle` | last-resort reasoning escalation | deepseek/deepseek-flash · max |

Domain agents (inline in `~/.config/opencode/opencode.json`):

| Agent | Role | Model · effort |
|---|---|---|
| `web-browser-agent` | interactive browser, logged-in pages, page captures | deepseek/deepseek-flash · low |
| `devops` | Grafana / observability / infra | deepseek/deepseek-flash · high |
| `motion-designer` | video / motion graphics | deepseek/deepseek-flash · high |
| `uxui` | product / UX design (placeholder) | deepseek/deepseek-flash · high |
| `gamedev` | game development; skills: `ref2game`, `studioigor` | deepseek/deepseek-flash · high |
| `blender` | Blender 3D modeling, animation, rendering, scene scripting (official Blender Lab MCP) | deepseek/deepseek-flash · high |
| `project-manager` | task tracking via Linear, GitLab MRs, browser checks | deepseek/deepseek-flash · high |

Permissions mirror each role's sandbox: read-only roles deny edits; write roles can edit and run
commands. Pro-tier agents (`reviewer`, `requirements-reviewer`, `security-reviewer`, `architect`,
`oracle`) are invoked only when the task requires them, not on every request. See `AGENTS.md` for the
full routing and completion policy.

## Skills

- `plan` — execution plans for complex or risky work
- `debug` — reproduce, narrow, and prove a fix
- `verify` — prove a change works with deterministic checks
- `review-loop` — independent review and correction before handoff

Third-party skills are vendored under `~/.config/opencode/vendor/` (git clones) and registered through
`skills.paths` in the global config. The `gamedev` agent uses `ref2game` (reference → playable 2D game
slice) and `studioigor` (idea → release pipeline). The gamedev image-generation path runs through the local `codex` CLI (ref2game's built-in `codex` provider, model `gpt-image-2`); the skill uses its own `uv` venv at `vendor/ref2game/.venv` for Pillow/NumPy/SciPy. Local OpenCode adaptations to vendored skills are kept in `patches/`.
