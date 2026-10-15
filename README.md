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
already-used config directory does not pick up edits. The one exception is the subagent model
presets below, which are re-read on every subagent launch and apply immediately.

The global config directory also holds entries this repo does **not** manage, each for one reason:

- `~/.config/opencode/agent-models.json` — **runtime state**: the `agent-models` plugin writes it
  when you change subagent models. It is gitignored here so it can never be committed by accident.
- `~/.config/opencode/service.json` — **runtime state**: the OpenCode remote/share service writes it,
  and it holds a plaintext `password` credential field, so it must never be committed or symlinked.
- `~/.config/opencode/opencode-quota/` — **runtime cache/state**: written and read by the
  `@slkiser/opencode-quota` plugin.
- `~/.config/opencode/backups/` — **installer scratch**: created by `scripts/install.sh` when it
  replaces a real file with a symlink; not tracked by git.
- `~/.config/opencode/.gitignore` — **inert leftover**: it ignored only the deleted V1 SDK files
  (`node_modules`, `package.json`, `package-lock.json`, `bun.lock`), so it matches nothing now but is
  kept deliberately.

## Layout

| Repo path | Installed location | Form |
|---|---|---|
| `config/opencode.json` | `~/.config/opencode/opencode.json` | file symlink |
| `config/cli.json` | `~/.config/opencode/cli.json` | file symlink |
| `agents/` (19 agent files) | `~/.config/opencode/agent/` | directory symlink |
| `AGENTS.md` | `~/.config/opencode/AGENTS.md` | file symlink |
| `plugins/agent-models/index.ts` | `~/.config/opencode/plugins/agent-models.ts` | file symlink |
| `.opencode/skills/{debug,plan,review-loop,verify}` | `~/.config/opencode/skills/<name>` | directory symlinks |
| `scripts/install.sh`, `scripts/migrate-secrets.sh` | not installed — run from the repo | — |
| `patches/` | not installed — vendor patch record | — |

The plugin is installed in the **file** form (`plugins/agent-models.ts`): a symlinked plugin
*directory* is not followed by OpenCode v2, a symlinked plugin *file* is. The canonical config also
references three secret files that are **not** in the repo and are never committed:

- `~/.config/opencode/secrets/grafana-bearer` (raw bearer token, no `Bearer ` prefix)
- `~/.config/opencode/secrets/grafana-sa-token`
- `~/.config/opencode/gitlab.token` (raw GitLab PAT, no prefix)

`config/cli.json` is the v2 terminal-client settings file (schema `https://opencode.ai/v2/cli.json`),
separate from `opencode.json`; the CLI rewrites it when terminal settings change, and this repo takes
ownership of its contents as-is.

## External prerequisites (not managed by this repo)

A fresh machine has to provide these already: `config/opencode.json` depends on them, and
`install.sh` neither creates nor repairs them.

- **Vendored skill clones** — seven git clones under `~/.config/opencode/vendor/`: `blender_mcp`,
  `liam-remotion-skills`, `motion-tools-and-skills`, `ref2game`, `remotion-dev-skills`,
  `studioigor-skill`, `video-shotcraft`. `patches/ref2game-opencode.patch` must be applied to
  `vendor/ref2game`, and its `.venv` (`vendor/ref2game/.venv`) built.
- **NixOS binaries** referenced by the local MCP servers:
  `/run/current-system/sw/bin/synthcut-mcp`, `/run/current-system/sw/bin/remotion-mcp`,
  `/run/current-system/sw/bin/uv` and `/run/current-system/sw/bin/blender`.
- **`MOONSHOT_API_KEY`** — environment variable for the `moonshotai` provider
  (`apiKey: "{env:MOONSHOT_API_KEY}"`); that provider is unusable without it.
- **Secret files** — `install.sh` checks for these but never creates them:
  `~/.config/opencode/secrets/grafana-bearer`, `~/.config/opencode/secrets/grafana-sa-token`, and
  `~/.config/opencode/gitlab.token` (raw GitLab PAT, no prefix, `chmod 600`, never committed).

## Providers

Provider setup and migration notes are in
[`docs/providers-setup.md`](docs/providers-setup.md).

The `local` (llama.cpp) provider was **removed** and is intentionally not declared anymore; the
providers in `config/opencode.json` are the complete set.

## Agents

19 agents: 13 core (`agents/*.md`, primary/subagent) and 6 domain (role-specialised; most are
MCP-bound, but `uxui` uses no MCP tools). Every agent file is in `agents/`; there are no
inline agent definitions in the JSON config. A per-agent coverage assessment lives in
[`docs/agents-coverage.md`](docs/agents-coverage.md).

Core agents:

| Agent | Mode | Role | Model · effort |
|---|---|---|---|
| `orchestrator` | primary | routes work to the smallest useful team, owns the outcome | deepseek/deepseek-flash · high |
| `build` | primary | full-access generalist (except Linear/GitLab MCP) that does the work itself, bypassing orchestration | deepseek/deepseek-flash · high |
| `product-analyst` | subagent | requirements, acceptance criteria, business rules, edge cases | deepseek/deepseek-flash · max |
| `system-analyst` | subagent | end-to-end flows across UI, services, APIs, persistence, events | deepseek/deepseek-flash · max |
| `researcher` | subagent | read-only technical/code investigation (web access) | deepseek/deepseek-flash · max |
| `implementer` | subagent | bounded implementation | deepseek/deepseek-flash · high |
| `worker` | subagent | mechanical edits, commands, diagnostics, narrow fixes | deepseek/deepseek-flash · low |
| `test-engineer` | subagent | behavioral/regression tests and validation | deepseek/deepseek-flash · low |
| `reviewer` | subagent | correctness, regressions, contracts and architecture review | deepseek/deepseek-flash · high |
| `requirements-reviewer` | subagent | acceptance against the original request | deepseek/deepseek-flash · max |
| `security-reviewer` | subagent | security-sensitive changed surfaces only | deepseek/deepseek-flash · max |
| `architect` | subagent | rare architecture escalation | deepseek/deepseek-flash · max |
| `oracle` | subagent | last-resort reasoning escalation | deepseek/deepseek-flash · max |

Domain agents:

| Agent | Mode | Role | Model · effort |
|---|---|---|---|
| `web-crawler` | subagent | interactive browser, logged-in pages, page captures | deepseek/deepseek-flash · low |
| `devops-tsai` | subagent | DevOps for tsai.tech — Grafana observability for the tsai.tech infrastructure (no browser) | deepseek/deepseek-flash · high |
| `motion-designer` | subagent | video / motion graphics | deepseek/deepseek-flash · high |
| `uxui` | subagent | product / UX design (placeholder) | deepseek/deepseek-flash · high |
| `game-developer` | subagent | game development; 3D/Blender pipelines via `blender_*` MCP; skills: `ref2game`, `studioigor` | deepseek/deepseek-flash · high |
| `project-manager` | subagent | task tracking: Linear issues/comments/attachments, GitLab MRs (no browser) | deepseek/deepseek-flash · low |

Two boundaries are enforced by permissions, not convention:

- `project-manager` is the **only** agent allowed to use the Linear and GitLab tools.
- `orchestrator` is the **only** agent allowed to spawn subagents (`subagent`) and to set subagent
  models (`set_subagent_model`, `set_subagent_models`). Every other agent denies `subagent`.

`build` is a standalone primary agent with full tool access apart from the Linear and GitLab MCP
families, which only `project-manager` may use; it does the work itself and is not part of the
orchestrated routing team. Pro-tier agents (`reviewer`, `requirements-reviewer`,
`security-reviewer`, `architect`, `oracle`) are invoked only when the task genuinely requires them.

## Permissions model

The default surface is **allow-all**, with global denies declared in `config/opencode.json` for every
MCP family and for the sensitive built-ins:

- MCP families: `linear_*`, `gitlab_*`, `browser_*`, `grafana_*`, `synthcut_*`, `remotion_*`,
  `blender_*` — all denied by default.
- Built-ins: `set_subagent_model`, `set_subagent_models`, `subagent`, `webfetch`, `websearch`, and
  `skill` — all denied by default.
- Built-in browser: the `browser` action — the desktop-app browser catalog, including
  `browser.preview` — denied by default. It works only when the session is open in the OpenCode
  desktop app, which attaches the browser; otherwise calls fail with `[browser.disconnected]`.
- `external_directory` is allowed for `/tmp/**`.

Two browser families exist and are denied separately. The MCP `browser_*` family is the server
`browser` (`npx -y open-browser-control`), which drives the user's own logged-in browser through an
extension and a local bridge. The built-in `browser` action controls the browser attached by the
OpenCode desktop app (tabs, navigation, snapshots, screenshots, traces, and `browser.preview`, which
shows a file in the Review pane); a deny removes the whole built-in catalog and has no per-operation
prompts (docs: https://opencode.ai/v2/docs/tools, `## Browser`). Only `web-crawler` opts into the MCP
`browser_*` family (it drives the user's own browser); the built-in catalog is opted into by the
agents listed in the opt-in table below.

Each agent then **opts in** to what its role needs through the `permissions` list in its own
frontmatter. A role that does not list a family keeps the global deny.

Two behaviours differ from the previous setup: domain agents no longer have `webfetch`/`websearch`
(`web-crawler` uses both browser families instead; `devops-tsai` and `project-manager` have no browser
access at all), and the global `skill: *` deny means a newly vendored skill is unreachable until it is
explicitly allowed for an agent. The built-in `browser` catalog is available to nine agents —
`orchestrator`, `build`, `researcher`, `implementer`, `worker`, `test-engineer`, `reviewer`,
`web-crawler`, and `motion-designer` — while the MCP `browser_*` family (the user's own logged-in
browser) is opted in by exactly one agent, `web-crawler`. Route any task needing the user's own
logged-in browser through `web-crawler`; the other ten agents keep no browser of either kind.

| Agent | Opt-in tools | Skills allowed |
|---|---|---|
| `orchestrator` | `browser` (built-in) | `debug`, `plan`, `review-loop`, `verify` |
| `build` | `synthcut_*`, `remotion_*`, `grafana_*`, `browser` (built-in), `blender_*` | `video-shotcraft`, `remotion-*`, `motion-graphics`, `cinematic-camera`, `article-highlights`, `terminal-inserts`, `kinetic-reel`, `debug`, `plan`, `review-loop`, `verify` |
| `researcher` | `browser` (built-in) (has `webfetch`/`websearch`) | — |
| `product-analyst`, `system-analyst` | — | — |
| `implementer`, `worker`, `test-engineer` | `browser` (built-in) | — |
| `reviewer` | `browser` (built-in) | — |
| `requirements-reviewer`, `security-reviewer`, `architect`, `oracle` | — | — |
| `web-crawler` | `browser_*`, `browser` (built-in) | — |
| `devops-tsai` | `grafana_*` | — |
| `motion-designer` | `synthcut_*`, `remotion_*`, `browser` (built-in) | `video-shotcraft`, `remotion-*`, `motion-graphics`, `cinematic-camera`, `article-highlights`, `terminal-inserts`, `kinetic-reel` |
| `uxui` | — | — |
| `game-developer` | `blender_*` | `ref2game`, `studioigor` |
| `project-manager` | `linear_*`, `gitlab_*` | — |

Read-only roles (`orchestrator`, `researcher`, the analysts, the reviewers, `architect`, `oracle`)
deny `edit` and restrict `shell` to a small read-only git allow-list. `project-manager` also denies
`edit` but denies `shell` entirely — it works only through MCP. Write roles
(`implementer`, `worker`, `test-engineer`, `build`) can edit and run commands. The remaining agents
(`web-crawler`, `devops-tsai`, `motion-designer`, `uxui`, `game-developer`) declare no `edit`/`shell`
rule at all, so they keep the allow-all default.

## Subagent model presets (`/subagents`)

`plugins/agent-models/` lets you run every subagent on a different model and reasoning effort
without touching their definitions. It reads `~/.config/opencode/agent-models.json` on **every
subagent launch** and switches that subagent's model for the session, so changes apply immediately —
no restart.

The `/subagents` command (defined inline in `config/opencode.json` under `commands.subagents`) asks
**one** question — which preset to apply to all subagents at once — and then calls
`set_subagent_models` a single time. The presets are:

- `deepseek` — every subagent on `deepseek/deepseek-flash` at its profile effort (the default).
- `opencode-free` — the same effort profile on the free `opencode/deepseek-v4.1-flash-free`.
- `codex` — `openai/gpt-6.1-sol#medium` for `researcher`; `openai/gpt-6-luna` at profile effort for
  everyone else.
- `claude-code` — `claude-code/claude-haiku-5-5` for `worker`; `claude-code/claude-sonnet-5-5` for the
  rest (researcher `#high`, implementer/reviewer/test-engineer `#low`, others at profile effort).
- `none` — the reset option; clears every override.

The plugin owns the `PRESETS` list and applies a preset wholesale, replacing the whole overrides
file. `set_subagent_model` remains for one-off per-agent overrides (the `COMBOS` list); both tools are
permitted only to the orchestrator.

The resulting file is **runtime state**, not part of this repo — it is gitignored here and re-read on
every subagent launch:

```json
{
  "worker":      { "providerID": "deepseek", "model": "deepseek-flash", "variant": "low" },
  "implementer": { "providerID": "deepseek", "model": "deepseek-flash", "variant": "high" }
}
```

An empty object (`{}`) overrides nothing. Only subagent (child) sessions are affected; the primary
agent keeps whatever model the session selected. The `variant` is the model's own effort/variant name,
so it must exist for the target model.

## Skills

Four workflow skills live in the repo (`.opencode/skills/`, installed to `~/.config/opencode/skills/`):

- `plan` — execution plans for complex or risky work
- `debug` — reproduce, narrow, and prove a fix
- `verify` — prove a change works with deterministic checks
- `review-loop` — independent review and correction before handoff

Third-party skills are vendored under `~/.config/opencode/vendor/` (git clones, **not** in this
repo) and registered through the `skills` array in `config/opencode.json`. The `game-developer` agent
uses `ref2game` (reference → playable 2D game slice) and `studioigor` (idea → release pipeline). The
game-developer image-generation path runs through the local `codex` CLI (ref2game's built-in `codex`
provider, model `gpt-image-2`); the skill uses its own `uv` venv at `vendor/ref2game/.venv` for
Pillow/NumPy/SciPy. Local OpenCode adaptations to vendored skills are kept in `patches/` (see
`patches/README.md`).
