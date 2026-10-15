# OpenCode Agents

A globally-installed multi-agent workflow for [OpenCode](https://opencode.ai) v2, pinned to direct
DeepSeek models. Agents run on `deepseek/deepseek-flash` with a per-role reasoning effort
(`low`/`high`/`max`) — `#max` is the escalation tier — and carry only the tools, skills, and
permissions their role needs.

This repository is the **single source of truth** for the global config. Nothing is copied:
`scripts/install.sh` installs everything into `~/.config/opencode/` as **symlinks** back into the
repo, so editing the repo is the only way the global config changes.

## Install

```sh
# once, on a machine whose live config still holds the Grafana secrets inline
scripts/migrate-secrets.sh

# install / repair the symlinks (idempotent — safe to re-run)
scripts/install.sh

# verify only: never writes, exits non-zero and lists drift
scripts/install.sh --check

# print what would happen, change nothing
scripts/install.sh --dry-run
```

`install.sh` backs up every real file/directory it replaces into
`~/.config/opencode/backups/<timestamp>/` before removing it. Symlinks it is about to recreate are
not backed up. A second run is a no-op.

**Restart OpenCode after config changes.** On Linux the file-watcher backend is unavailable, so an
already-used config directory does not pick up edits. The one exception is the per-subagent model
overrides below, which are re-read on every subagent launch and apply immediately.

`~/.config/opencode/agent-models.json` is **runtime state**, not part of this repo: the
`agent-models` plugin writes it when you change subagent models. It is gitignored here so it can
never be committed by accident.

## Layout

| Repo path | Installed location | Form |
|---|---|---|
| `config/opencode.json` | `~/.config/opencode/opencode.json` | file symlink |
| `agents/` (20 agent files) | `~/.config/opencode/agent/` | directory symlink |
| `AGENTS.md` | `~/.config/opencode/AGENTS.md` | file symlink |
| `plugins/agent-models/index.ts` | `~/.config/opencode/plugins/agent-models.ts` | file symlink |
| `.opencode/skills/{debug,plan,review-loop,verify}` | `~/.config/opencode/skills/<name>` | directory symlinks |
| `scripts/install.sh`, `scripts/migrate-secrets.sh` | not installed — run from the repo | — |
| `patches/` | not installed — vendor patch record | — |

The plugin is installed in the **file** form (`plugins/agent-models.ts`): a symlinked plugin
*directory* is not followed by OpenCode v2, a symlinked plugin *file* is. The canonical config also
references two secret files that are **not** in the repo and are never committed:

- `~/.config/opencode/secrets/grafana-bearer` (raw bearer token, no `Bearer ` prefix)
- `~/.config/opencode/secrets/grafana-sa-token`

## Agents

20 agents: 13 core (`agents/*.md`, primary/subagent) and 7 domain (role-specialised; most are
MCP-bound, but `uxui` and `gamedev` use no MCP tools). Every agent file is in `agents/`; there are no
inline agent definitions in the JSON config.

Core agents:

| Agent | Mode | Role | Model · effort |
|---|---|---|---|
| `orchestrator` | primary | routes work to the smallest useful team, owns the outcome | deepseek/deepseek-flash · high |
| `solo` | primary | full-access generalist (except Linear/GitLab MCP) that does the work itself, bypassing orchestration | deepseek/deepseek-flash · high |
| `product-analyst` | subagent | requirements, acceptance criteria, business rules, edge cases | deepseek/deepseek-flash · high |
| `system-analyst` | subagent | end-to-end flows across UI, services, APIs, persistence, events | deepseek/deepseek-flash · high |
| `researcher` | subagent | read-only technical/code investigation (web access) | deepseek/deepseek-flash · low |
| `implementer` | subagent | bounded implementation | deepseek/deepseek-flash · high |
| `worker` | subagent | mechanical edits, commands, diagnostics, narrow fixes | deepseek/deepseek-flash · low |
| `test-engineer` | subagent | behavioral/regression tests and validation | deepseek/deepseek-flash · low |
| `reviewer` | subagent | correctness, regressions, contracts and architecture review | deepseek/deepseek-flash · max |
| `requirements-reviewer` | subagent | acceptance against the original request | deepseek/deepseek-flash · max |
| `security-reviewer` | subagent | security-sensitive changed surfaces only | deepseek/deepseek-flash · max |
| `architect` | subagent | rare architecture escalation | deepseek/deepseek-flash · max |
| `oracle` | subagent | last-resort reasoning escalation | deepseek/deepseek-flash · max |

Domain agents:

| Agent | Mode | Role | Model · effort |
|---|---|---|---|
| `web-browser-agent` | all | interactive browser, logged-in pages, page captures | deepseek/deepseek-flash · low |
| `devops` | all | Grafana / observability / infra | deepseek/deepseek-flash · high |
| `motion-designer` | all | video / motion graphics | deepseek/deepseek-flash · high |
| `uxui` | all | product / UX design (placeholder) | deepseek/deepseek-flash · high |
| `gamedev` | all | game development; skills: `ref2game`, `studioigor` | deepseek/deepseek-flash · high |
| `blender` | all | Blender 3D modeling, animation, rendering, scene scripting (official Blender Lab MCP) | deepseek/deepseek-flash · high |
| `project-manager` | all | task tracking: Linear issues/comments/attachments, GitLab MRs, browser checks | deepseek/deepseek-flash · high |

Two boundaries are enforced by permissions, not convention:

- `project-manager` is the **only** agent allowed to use the Linear and GitLab tools.
- `orchestrator` is the **only** agent allowed to spawn subagents (`subagent`) and to set subagent
  models (`set_subagent_model`). Every other agent denies `subagent`.

`solo` is a standalone primary agent with full tool access apart from the Linear and GitLab MCP
families, which only `project-manager` may use; it does the work itself and is not part of the
orchestrated routing team. Pro-tier agents (`reviewer`, `requirements-reviewer`,
`security-reviewer`, `architect`, `oracle`) are invoked only when the task genuinely requires them.

## Permissions model

The default surface is **allow-all**, with global denies declared in `config/opencode.json` for every
MCP family and for the sensitive built-ins:

- MCP families: `linear_*`, `gitlab_*`, `browser_*`, `grafana_*`, `synthcut_*`, `remotion_*`,
  `blender_*` — all denied by default.
- Built-ins: `set_subagent_model`, `subagent`, `webfetch`, `websearch`, and `skill` — all denied by
  default.
- `external_directory` is allowed for `/tmp/**`.

Each agent then **opts in** to what its role needs through the `permissions` list in its own
frontmatter. A role that does not list a family keeps the global deny.

Two behaviours differ from the previous setup: domain agents no longer have `webfetch`/`websearch`
(they use `browser_*` where relevant), and the global `skill: *` deny means a newly vendored skill is
unreachable until it is explicitly allowed for an agent.

| Agent | MCP families allowed | Skills allowed |
|---|---|---|
| `orchestrator` | — | `debug`, `plan`, `review-loop`, `verify` |
| `solo` | `synthcut_*`, `remotion_*`, `grafana_*`, `browser_*`, `blender_*` | `video-shotcraft`, `remotion-*`, `motion-graphics`, `cinematic-camera`, `article-highlights`, `terminal-inserts`, `kinetic-reel`, `debug`, `plan`, `review-loop`, `verify` |
| `researcher` | — (has `webfetch`/`websearch`) | — |
| `product-analyst`, `system-analyst`, `implementer`, `worker`, `test-engineer` | — | — |
| `reviewer`, `requirements-reviewer`, `security-reviewer`, `architect`, `oracle` | — | — |
| `web-browser-agent` | `browser_*` | — |
| `devops` | `grafana_*`, `browser_*` | — |
| `motion-designer` | `synthcut_*`, `remotion_*`, `browser_*` | `video-shotcraft`, `remotion-*`, `motion-graphics`, `cinematic-camera`, `article-highlights`, `terminal-inserts`, `kinetic-reel` |
| `uxui` | — | — |
| `gamedev` | — | `ref2game`, `studioigor` |
| `blender` | `blender_*` | — |
| `project-manager` | `linear_*`, `gitlab_*`, `browser_*` | — |

Read-only roles (`orchestrator`, `researcher`, the analysts, the reviewers, `architect`, `oracle`)
deny `edit` and restrict `shell` to a small read-only git allow-list. `project-manager` also denies
`edit` but denies `shell` entirely — it works only through MCP and the browser. Write roles
(`implementer`, `worker`, `test-engineer`, `solo`) can edit and run commands, and the remaining
agents (`web-browser-agent`, `devops`, `motion-designer`, `uxui`, `gamedev`) declare no `shell` rule
at all, so they keep the allow-all default.

## Per-subagent model overrides

`plugins/agent-models/` lets you run chosen subagents on a different model and reasoning effort
without touching their definitions. It reads `~/.config/opencode/agent-models.json` on **every
subagent launch** and switches that subagent's model for the session, so edits apply immediately —
no restart.

```json
{
  "worker":      { "providerID": "openrouter", "model": "xiaomi/mimo-v2.6-pro", "variant": "none" },
  "implementer": { "providerID": "openrouter", "model": "xiaomi/mimo-v2.6-pro", "variant": "thinking" },
  "researcher":  { "providerID": "openai",     "model": "gpt-6-luna",        "variant": "high" }
}
```

An empty object (`{}`) overrides nothing. Only subagent (child) sessions are affected; the primary
agent keeps whatever model the session selected.

The `/subagents` command (defined inline in `config/opencode.json` under `commands.subagents`) asks
which model/effort to use for `worker`, `implementer`, `researcher`, `test-engineer` and `reviewer`,
then calls the `set_subagent_model` tool once per subagent. The plugin owns the `COMBOS` list — the
offered pairs are `deepseek/deepseek-flash#{low,high,max}`, `openrouter/xiaomi/mimo-v2.6-pro#{none,thinking}`
and `openai/gpt-6-luna#{low,high,max}`. The `variant` is the model's own effort/variant name, so it
must exist for the target model (`openrouter/xiaomi/mimo-v2.6-pro` has `none`/`thinking`;
`openai/gpt-6-luna` has `none`/`low`/`medium`/`high`/`xhigh`/`max`; `deepseek/deepseek-flash` has
`low`/`high`/`max` defined in `config/opencode.json`). `set_subagent_model` is permitted only to the
orchestrator.

## Skills

Four workflow skills live in the repo (`.opencode/skills/`, installed to `~/.config/opencode/skills/`):

- `plan` — execution plans for complex or risky work
- `debug` — reproduce, narrow, and prove a fix
- `verify` — prove a change works with deterministic checks
- `review-loop` — independent review and correction before handoff

Third-party skills are vendored under `~/.config/opencode/vendor/` (git clones, **not** in this
repo) and registered through the `skills` array in `config/opencode.json`. The `gamedev` agent uses
`ref2game` (reference → playable 2D game slice) and `studioigor` (idea → release pipeline). The
gamedev image-generation path runs through the local `codex` CLI (ref2game's built-in `codex`
provider, model `gpt-image-2`); the skill uses its own `uv` venv at `vendor/ref2game/.venv` for
Pillow/NumPy/SciPy. Local OpenCode adaptations to vendored skills are kept in `patches/` (see
`patches/README.md`).
