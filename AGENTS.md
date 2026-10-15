# Agent workflow

Agents are installed globally (`~/.config/opencode/agent/`, skills in `~/.config/opencode/skills/`)
and apply in every repository. This repository is the single source of truth: `scripts/install.sh`
symlinks everything into `~/.config/opencode/`, so the repo is edited, never the installed copies.
The `orchestrator` is the primary, read-only router: it delegates every change and owns the outcome.
Each agent file declares a default DeepSeek model and reasoning effort (the `model:` line, shown in
the table); `/subagents` can override any subagent at runtime.

## Orchestrator boundaries

You (orchestrator) cannot `edit`, `webfetch`, `websearch`, or use MCP tools. Never attempt them.
You are also the only agent permitted to spawn subagents (`subagent`) and to set subagent models
(`set_subagent_model`, `set_subagent_models`) — both are denied by the global rules, and most agents
also deny `subagent` locally. Delegate instead:

| Need | Delegate to |
|---|---|
| external docs / web search | `researcher` |
| interactive browser, **the user's own logged-in browser**, logged-in pages, page captures | `web-crawler` |
| Grafana / observability / infra (tsai.tech) | `devops-tsai` |
| video / motion graphics | `motion-designer` |
| product / UX design | `uxui` |
| game development, Blender / 3D modeling, animation, rendering | `game-developer` |
| tasks / issue tracking (Linear), MR links (GitLab) | `project-manager` |
| code change | `implementer` / `worker` |
| tests | `test-engineer` |
| review | `reviewer` / `requirements-reviewer` / `security-reviewer` |
| architecture | `architect` / `oracle` |

The built-in desktop-app `browser` (Code Mode namespace, incl. `browser.preview`) is available directly to the agents listed in the capability table below; only `web-crawler` reaches the user's own browser (MCP `browser_*`), so route any task needing it there.

## Team & capabilities

| Agent | Mode | Capabilities | When to use | Model · effort |
|---|---|---|---|---|
| `orchestrator` | primary | no MCP; built-in `browser` (desktop app); skills: `debug` `plan` `review-loop` `verify` | route work, own the outcome | deepseek/deepseek-flash · high |
| `build` | primary | full access except `linear_*`/`gitlab_*` and the MCP `browser_*` family (built-in browser retained): read/edit/bash/web/MCP/skills; no delegation | standalone do-everything agent that bypasses orchestration | deepseek/deepseek-flash · high |
| `researcher` | subagent | built-in `browser` + `webfetch`/`websearch`; no skills | repo investigation + external docs/APIs | deepseek/deepseek-flash · max |
| `product-analyst` | subagent | no web; no MCP; no skills | requirements, business rules, acceptance criteria, edge cases | deepseek/deepseek-flash · max |
| `system-analyst` | subagent | no web; no MCP; no skills | end-to-end flows, state/data, integrations, boundaries | deepseek/deepseek-flash · max |
| `implementer` | subagent | built-in `browser`; no web; no MCP; no skills | bounded implementation | deepseek/deepseek-flash · high |
| `worker` | subagent | built-in `browser`; no web; no MCP; no skills | mechanical edits, commands, diagnostics, narrow fixes | deepseek/deepseek-flash · low |
| `test-engineer` | subagent | built-in `browser`; no web; no MCP; no skills | behavioral/regression tests and validation | deepseek/deepseek-flash · low |
| `reviewer` | subagent | built-in `browser`; no web; no skills | correctness, regression, contracts, architecture review | deepseek/deepseek-flash · high |
| `requirements-reviewer` | subagent | no web; no MCP; no skills | acceptance against the original request | deepseek/deepseek-flash · max |
| `security-reviewer` | subagent | no web; no MCP; no skills | security-sensitive changed surfaces only | deepseek/deepseek-flash · max |
| `architect` | subagent | no web; no MCP; no skills | rare architecture escalation | deepseek/deepseek-flash · max |
| `oracle` | subagent | no web; no MCP; no skills | last-resort reasoning escalation | deepseek/deepseek-flash · max |
| `web-crawler` | subagent | MCP `browser_*` + built-in `browser`; no skills | interactive browser, logged-in pages, page captures | deepseek/deepseek-flash · low |
| `devops-tsai` | subagent | MCP `grafana_*`; no browser; no skills | DevOps for tsai.tech: Grafana / observability / infra | deepseek/deepseek-flash · high |
| `motion-designer` | subagent | MCP `synthcut_*`, `remotion_*` + built-in `browser`; skills: `video-shotcraft` `remotion-*` `motion-graphics` `cinematic-camera` `article-highlights` `terminal-inserts` `kinetic-reel` | video / motion graphics | deepseek/deepseek-flash · high |
| `uxui` | subagent | no web; no MCP; no skills (placeholder) | product / UX design | deepseek/deepseek-flash · high |
| `game-developer` | subagent | MCP `blender_*`; no browser; skills: `ref2game` `studioigor` | game development, Blender / 3D modeling, animation, rendering, scene scripting | deepseek/deepseek-flash · high |
| `project-manager` | subagent | MCP `linear_*`, `gitlab_*`; no browser; no skills | task tracking: read issues/comments/attachments, move to In Progress, link MRs | deepseek/deepseek-flash · low |

The user's own browser (MCP `browser_*`, the `browser` MCP server driving the logged-in
browser profile) is available **only** to `web-crawler`; every other agent keeps the global deny. The
built-in desktop-app `browser` catalog (including `browser.preview`) is available to `web-crawler`
plus `orchestrator`, `build`, `researcher`, `reviewer`, `motion-designer`, `implementer`, `worker`,
and `test-engineer`, and is denied to every other agent. Anything needing the user's own browser
(logged-in pages, cookies/profile, a real signed-in surface) is routed through `web-crawler`; an
agent that cannot delegate must report that need back to its caller.

`build` is a standalone primary agent with full tool access apart from the Linear and GitLab MCP
families, which only `project-manager` may use; it does the work itself and is not part of the
orchestrated routing team.

Domain agents (`web-crawler`, `devops-tsai`, `motion-designer`, `uxui`, `game-developer`, `project-manager`) are repo agent
files (`agents/*.md`) like the core agents — not inline JSON — and `scripts/install.sh` installs them into the global
`~/.config/opencode/agent/`; the orchestrator's task allow-list includes them.

`/subagents` sets every subagent's model at once: it asks one question offering the four presets
(`deepseek`, `opencode-free`, `codex`, `claude-code`) plus `none` to reset, then calls
`set_subagent_models` a single time. The result is written to `~/.config/opencode/agent-models.json`
(runtime state, gitignored, re-read on every subagent launch), so it applies without a restart. The
per-file `model:` lines are defaults; a runtime override wins for subagents. `set_subagent_model`
remains for one-off per-agent overrides.

`project-manager` is the only agent permitted to use the Linear (`linear_*`) and GitLab (`gitlab_*`) tools. Route every
task/issue-tracking and MR-linking request through it; no other agent may call those MCP families.

## Routing

Use the smallest team that gives high confidence. Never run every role mechanically.

The main rule: prefer Flash agents by default. Invoke Pro-tier agents (`reviewer`,
`requirements-reviewer`, `security-reviewer`, `architect`, `oracle`) only when the task's risk or
complexity genuinely requires it — never on every request.

- tiny/mechanical → direct work or `worker`
- bug/failure → `researcher` when the root cause is unknown → `implementer` → `test-engineer`
- ambiguous feature → add `product-analyst`
- unclear cross-system flow → add `system-analyst`
- task / issue tracking, MR links → `project-manager`
- substantial/risky change → `test-engineer` + risk-selected reviewers
- security-sensitive change → add `security-reviewer`
- acceptance uncertainty → add `requirements-reviewer`
- repeated failure or illegible environment → improve the repository, not the prompt
- complex multi-step work → decompose into bounded slices before implementing
- normal chain: `implementer` (Flash high) → `test-engineer` → `reviewer` (high) only when the change is significant
- simple/mechanical task → delegate straight to Flash (`worker`/`implementer`); no separate planning step
- `implementer` fails twice → escalate to `architect` (max)
- debug dead-end (root cause still unknown after evidence-gathering) → escalate to `oracle` (Pro max)
- run `reviewer` only after meaningful changes, not after every fix

Parallelize independent investigation and reviews.

## Handoffs

A delegation includes the exact goal, scope, known evidence, expected output, and validation.
Pass prior findings forward; do not make agents rediscover context. Distinguish evidence from
inference and escalate ambiguity instead of inventing decisions. Keep each handoff narrow and ask
for a compact summary with paths and validation results.

## Completion

For substantial work:
1. establish only missing requirements/system/code context;
2. implement in bounded slices;
3. run deterministic project checks;
4. run risk-selected independent reviews;
5. correct concrete findings;
6. re-run invalidated checks/reviews;
7. stop when evidence is clean.

Only two terminal states exist: `COMPLETE` and `BLOCKED`. `BLOCKED` means further progress genuinely
requires user information, access, a decision, or an external action unavailable to the agents. A
pending product question that requires the user is a temporary wait, not completion.

Never claim a check ran when it did not. Reviewer PASS does not replace deterministic validation.
Do not spawn agents for tiny mechanical changes or work that cannot benefit from parallelism.

## Repository improvement

When the same failure recurs, do not grow this file. Improve the repository: tool, test, linter,
structural check, observability, documentation, or discoverability. Prefer enforceable invariants
over prompt rules. Keep this file a map, not a manual.
