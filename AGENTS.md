# Agent workflow

Agents are installed globally (`~/.config/opencode/agent/`, skills in `~/.config/opencode/skills/`)
and apply in every repository. The `orchestrator` is the primary, read-only router: it delegates
every change and owns the outcome. Agents carry no hardcoded model; escalation is a role choice.

## Orchestrator boundaries

You (orchestrator) cannot `edit`, `webfetch`, `websearch`, or use MCP tools. Never attempt them.
Delegate instead:

| Need | Delegate to |
|---|---|
| external docs / web search | `researcher` |
| interactive browser, logged-in pages, page captures | `web-browser-agent` |
| Grafana / observability / infra | `devops` |
| video / motion graphics | `motion-designer` |
| product / UX design | `uxui` |
| game development | `gamedev` |
| code change | `implementer` / `worker` |
| tests | `test-engineer` |
| review | `reviewer` / `requirements-reviewer` / `security-reviewer` |
| architecture | `architect` / `oracle` |

## Team & capabilities

| Agent | Mode | Capabilities | When to use |
|---|---|---|---|
| `orchestrator` | primary | no MCP; skills: `bootstrap-project` `debug` `docs-gardening` `evaluate-harness` `improve-harness` `plan` `record-outcome` `review-loop` `verify` | route work, own the outcome |
| `researcher` | subagent | `webfetch` + `websearch`; no MCP; no skills | repo investigation + external docs/APIs |
| `product-analyst` | subagent | no web; no MCP; no skills | requirements, business rules, acceptance criteria, edge cases |
| `system-analyst` | subagent | no web; no MCP; no skills | end-to-end flows, state/data, integrations, boundaries |
| `implementer` | subagent | no web; no MCP; no skills | bounded implementation |
| `worker` | subagent | no web; no MCP; no skills | mechanical edits, commands, diagnostics, narrow fixes |
| `test-engineer` | subagent | no web; no MCP; no skills | behavioral/regression tests and validation |
| `reviewer` | subagent | no web; no MCP; no skills | correctness, regression, contracts, architecture review |
| `requirements-reviewer` | subagent | no web; no MCP; no skills | acceptance against the original request |
| `security-reviewer` | subagent | no web; no MCP; no skills | security-sensitive changed surfaces only |
| `architect` | subagent | no web; no MCP; no skills | rare architecture escalation |
| `oracle` | subagent | no web; no MCP; no skills | last-resort reasoning escalation |
| `web-browser-agent` | all | MCP `browser_*`; no skills | interactive browser, logged-in pages, page captures |
| `devops` | all | MCP `grafana_*`, `browser_*`; no skills | Grafana / observability / infra |
| `motion-designer` | all | MCP `synthcut_*`, `remotion_*`, `browser_*`; skills: `video-shotcraft` `remotion-*` `motion-graphics` `cinematic-camera` `article-highlights` `terminal-inserts` `kinetic-reel` | video / motion graphics |
| `uxui` | all | no web; no MCP; no skills (placeholder) | product / UX design |
| `gamedev` | all | no web; no MCP; no skills (placeholder) | game development |

Domain agents (`web-browser-agent`, `devops`, `motion-designer`, `uxui`, `gamedev`) are installed in
the global OpenCode config; the orchestrator's task allow-list includes them.

## Routing

Use the smallest team that gives high confidence. Never run every role mechanically.

- tiny/mechanical → direct work or `worker`
- bug/failure → `researcher` when the root cause is unknown → `implementer` → `test-engineer`
- ambiguous feature → add `product-analyst`
- unclear cross-system flow → add `system-analyst`
- substantial/risky change → `test-engineer` + risk-selected reviewers
- security-sensitive change → add `security-reviewer`
- acceptance uncertainty → add `requirements-reviewer`
- repeated failure or illegible environment → improve the repository, not the prompt
- complex multi-step work → decompose into bounded slices before implementing

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

## Evaluation / Codeburn

Do not rely on agent self-confidence as evidence. Prefer deterministic checks, independent review,
real user corrections, regressions, and accumulated outcomes. Improve recurring failure classes
rather than reacting to isolated anecdotes. Never store prompts, secrets, source code, personal
data, or raw telemetry in any outcome journal.
