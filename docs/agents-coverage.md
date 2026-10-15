# Agent System Coverage Assessment — `opencode-agents`

Scope: the global OpenCode agent workflow installed from this repository (`agents/`, `config/opencode.json`,
`plugins/agent-models/`, `scripts/`). The document describes the state as of 2026-10-15, after the
rename/merge change (`solo`→`build`, `web-browser-agent`→`web-crawler`, `gamedev`→`game-developer`
with Blender merged in, `devops`→`devops-tsai`), the `/subagents` preset rework, the
built-in-browser permission fix, and the browser-policy narrowing (MCP `browser_*` reduced to
`web-crawler` only). Every non-quoted
claim here is verified against the current files; section 7 lists the commands that reproduce the
claims, and section 8 lists what is inference rather than verified fact.

Statements marked **[inference]** are reasoning from the repository, not verified platform behaviour.
Statements marked **[pre-change]** were quoted from a snapshot taken while the change was in flight and
cannot be re-verified now that the file has been replaced.

---

## What is not covered (for a reader who only reads the first screen)

- **Release / deploy / CI**: no agent owns build pipelines or GitLab CI. `devops-tsai` is Grafana-only.
- **Documentation writing**: only incidental, via `implementer` (its description mentions documentation changes).
- **Dependency / version upgrades**, **data engineering / ML**, **mobile / embedded**, **i18n / performance**:
  no agent (accessibility is mentioned only as prose in `uxui`).
- **UX/UI design**: `uxui` exists but is an explicit placeholder with no skills.
- **Per-agent cost/run observability**: cost guidance is prose only; there is no run ledger.
- **Enforcement**: `scripts/check-agent-presets.mjs` validates the model presets and their config
  wiring, and enforces the browser permission policy (global denies for `browser` and `browser_*`, the
  built-in `browser` allow rule on exactly nine agents, MCP `browser_*` on `web-crawler` only, and
  fail-closed for any unlisted agent). Permission drift between docs and agent files, override-key
  validity, and orchestrator allow-list validity are **not** machine-checked (see 4.8 and P0-2).
- Two primaries only: `orchestrator` (default, read-only router) and `build` (full-access standalone).

---

## 1. Inventory

### 1.1 Final state in one paragraph

`agents/` holds **19 files**: 2 `mode: primary` (`orchestrator`, `build`) and 17 `mode: subagent`.
Every domain agent (`web-crawler`, `devops-tsai`, `motion-designer`, `uxui`, `game-developer`,
`project-manager`) is `subagent`; none is directly selectable as a top-level agent. `agents/blender.md`
was deleted and its scope merged into `game-developer`. The MCP `browser_*` family (the `browser` MCP
server `npx -y open-browser-control`, which drives the user's own logged-in browser through an
extension and a local bridge) is opted in by exactly **one** agent — the subagent `web-crawler`; the
built-in desktop-app `browser` catalog is opted in by **nine** agents — `web-crawler`,
`orchestrator`, `build`, `researcher`, `reviewer`, `motion-designer`, `implementer`, `worker`, and
`test-engineer`; the other ten agents (including `devops-tsai` and `project-manager`) have no browser
of either kind and say so in their bodies. Any task needing the user's own browser is routed through
`web-crawler`.

Verified by `grep -n "^mode:" agents/*.md` (all 19 lines), `grep -rn 'browser_\*' agents/` (exactly one
opt-in line, `web-crawler.md:6`), and `ls agents/`.

### 1.2 Global default surface

`config/opencode.json` sets `default_agent: "orchestrator"` (`:3`) and declares a deny-by-default
`permissions` block (`:93-169`) over an otherwise allow-all surface:

- `external_directory` allowed only for `/tmp/**` (`:94-98`).
- MCP families denied: `linear_*` (`:99-103`), `gitlab_*` (`:104-108`), `browser_*` (`:109-113`),
  `grafana_*` (`:119-123`), `synthcut_*` (`:124-128`), `remotion_*` (`:129-133`),
  `blender_*` (`:134-138`).
- Built-ins denied: `set_subagent_model` (`:139-143`), `set_subagent_models` (`:144-148`),
  `subagent` (`:149-153`), `webfetch` (`:154-158`), `websearch` (`:159-163`), `skill` (`:164-168`).
- Built-in browser denied: the `browser` action (`:114-118`) — the desktop-app browser catalog,
  tabs/navigation/snapshots/screenshots/traces/`browser.preview`; docs:
  https://opencode.ai/v2/docs/tools, `## Browser`. A deny removes the whole catalog and has no
  per-operation prompts.
- `edit` and `shell` are **not** globally denied — an agent with no rule for them keeps allow-all
  (consistent with `README.md:106-118,140-145`) **[inference: runtime default not executed]**.

The `agents` block (`:170-174`) disables only `plan`; `build` is **not** disabled. The
`commands.subagents` command (`:248-253`) holds the new one-question preset template (`:251`).

### 1.3 Agents

Line numbers are current. The "shell"/"edit" columns show the agent's own frontmatter rules; where a
role has no rule, it inherits the global allow-all default. `—` in the web column means the agent
declares no webfetch/websearch rule and inherits the global deny. The `Tool opt-in` column lists the
MCP families a role allows and, where present, the built-in `browser` catalog.

| # | Agent id (file) | Mode | Model line | edit | shell | web | Tool opt-in | skills | Role |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `orchestrator` (`agents/orchestrator.md:3`) | primary | `#high` (`:4`) | deny (`:6-8`) | deny `*`, git/codeburn allow (`:69-86`) | deny webfetch/websearch (`:63-68`) | `browser` (built-in, `:105`) | `debug`,`plan`,`review-loop`,`verify` (`:87-98`) | Read-only router; sole delegator and model-setter (`set_subagent_model` `:99-101`, `set_subagent_models` `:102-104`) |
| 2 | `build` (`agents/build.md:3`) | primary | `#high` (`:4`) | allow (`:6-8`) | allow (`:21-23`) + external dir (`:18-20`) | allow webfetch/websearch (`:9-14`) | `synthcut_*`,`remotion_*`,`grafana_*`,`browser` (built-in, `:33`),`blender_*` (`:24-38`) | 7 video skills + `debug`/`plan`/`review-loop`/`verify` + `skill:*` (`:39-74`) | Full-access standalone generalist, no delegation (`:15-17` deny subagent) |
| 3 | `product-analyst` (`agents/product-analyst.md:3`) | subagent | `#max` (`:4`) | deny (`:6-8`) | git-only (`:18-32`) | deny (`:12-17`) | — | — | Requirements, business rules, acceptance criteria, edge cases (`:2`) |
| 4 | `system-analyst` (`agents/system-analyst.md:3`) | subagent | `#max` (`:4`) | deny (`:6-8`) | git-only (`:18-32`) | deny (`:12-17`) | — | — | End-to-end flows across UI/services/APIs/persistence/events (`:2`) |
| 5 | `researcher` (`agents/researcher.md:3`) | subagent | `#max` (`:4`) | deny (`:6-8`) | git-only (`:12-26`) | webfetch/websearch allow (`:27-32`) | `browser` (built-in, `:33`) | — | Read-only repo + external docs/API investigation (`:2`) |
| 6 | `implementer` (`agents/implementer.md:3`) | subagent | `#high` (`:4`) | allow (no rule) | allow (no rule) | deny (`:9-14`) | `browser` (built-in, `:15`) | — | Bounded multi-file implementation (`:2`) |
| 7 | `worker` (`agents/worker.md:3`) | subagent | `#low` (`:4`) | allow (no rule) | allow (no rule) | deny (`:9-14`) | `browser` (built-in, `:15`) | — | Mechanical edits, commands, diagnostics (`:2`) |
| 8 | `test-engineer` (`agents/test-engineer.md:3`) | subagent | `#low` (`:4`) | allow (no rule) | allow (no rule) | deny (`:9-14`) | `browser` (built-in, `:15`) | — | Independent behavioral/regression testing (`:2`) |
| 9 | `reviewer` (`agents/reviewer.md:3`) | subagent | `#high` (`:4`) | deny (`:6-8`) | git-only (`:18-32`) | webfetch/websearch deny (`:12-17`) | `browser` (built-in, `:33`) | — | Correctness/regression/contracts/architecture review (`:2`) |
| 10 | `requirements-reviewer` (`agents/requirements-reviewer.md:3`) | subagent | `#max` (`:4`) | deny (`:6-8`) | git-only (`:18-32`) | deny (`:12-17`) | — | — | Acceptance vs original request (`:2`) |
| 11 | `security-reviewer` (`agents/security-reviewer.md:3`) | subagent | `#max` (`:4`) | deny (`:6-8`) | git-only (`:18-32`) | deny (`:12-17`) | — | — | Security-sensitive changed surfaces (`:2`) |
| 12 | `architect` (`agents/architect.md:3`) | subagent | `#max` (`:4`) | deny (`:6-8`) | git-only (`:18-32`) | deny (`:12-17`) | — | — | Cross-cutting design escalation (`:2`) |
| 13 | `oracle` (`agents/oracle.md:3`) | subagent | `#max` (`:4`) | deny (`:6-8`) | git-only (`:18-32`) | deny (`:12-17`) | — | — | Last-resort reasoning escalation (`:2`) |
| 14 | `web-crawler` (`agents/web-crawler.md:3`) | subagent | `#low` (`:4`) | allow (no rule) | allow (no rule) | — | `browser_*` (MCP, `:6`), `browser` (built-in, `:9`) | — | Browser automation / scraping; sole route to the user's own browser (`:2,11,14`) |
| 15 | `devops-tsai` (`agents/devops-tsai.md:3`) | subagent | `#high` (`:4`) | allow (no rule) | allow (no rule) | — | `grafana_*` (`:5-8`); no browser | — | Grafana/SRE for tsai.tech; browser explicitly unavailable (`:2,13`) |
| 16 | `motion-designer` (`agents/motion-designer.md:3`) | subagent | `#high` (`:4`) | allow (no rule) | allow (no rule) | — | `synthcut_*`,`remotion_*` (`:5-10`),`browser` (built-in, `:12`) | 7 video skills (`:15-35`) | Storyboard→Remotion→SynthCut video (`:2,38-44`) |
| 17 | `uxui` (`agents/uxui.md:3`) | subagent | `#high` (`:4`) | **no permissions block** | allow (no rule) | — | — | — (placeholder, `:9`) | UX/UI design placeholder (`:2,9`) |
| 18 | `game-developer` (`agents/game-developer.md:3`) | subagent | `#high` (`:4`) | allow (no rule) | allow (no rule) | — | `blender_*` (`:12-14`); no browser | `ref2game`,`studioigor` (`:6-11`) | Gameplay + 3D/Blender pipelines (`:2`) |
| 19 | `project-manager` (`agents/project-manager.md:3`) | subagent | `#low` (`:4`) | deny (`:6-8`) | deny (`:18-20`) | — | `linear_*`,`gitlab_*` (`:12-17`), no browser | — | Linear/GitLab task tracking, MR links; browser unavailable (`:2,23,29,36`) |

**Counts:** 19 agents = 13 core + 6 domain; 2 primary + 17 subagent (confirmed by
`scripts/check-agent-presets.mjs`: "17 non-primary covered by every preset (primary excluded: build, orchestrator)").

---

## 2. Orchestration map

### 2.1 Entry points

- **Default primary:** `orchestrator` (`config/opencode.json:3`; `agents/orchestrator.md:3,110-112`).
- **Second primary:** `build` (`agents/build.md:3`) — bypasses orchestration and denies `subagent` (`:15-17`).
- **Delegation:** only `orchestrator` holds `subagent` allow rules (`agents/orchestrator.md:12-62`);
  `subagent` is globally denied (`config/opencode.json:149-153`) and every other agent denies it
  locally (e.g. `implementer.md:6-8`, `researcher.md:9-11`, `project-manager.md:9-11`,
  `game-developer.md:15-17`, `build.md:15-17`).

### 2.2 Routing rules

- Delegation table `AGENTS.md:17-29`; capability table `:33-53`; routing heuristics `:76-98`.
- Normal chain: `implementer` → `test-engineer` → `reviewer` only when significant (`AGENTS.md:96`).
- Escalation: `implementer` fails twice → `architect` (`:96`); debug dead-end → `oracle` (`:97`);
  Pro-tier gating (`:80-82`).
- Skills encode the same loop: `.opencode/skills/{plan,debug,verify,review-loop}`.

### 2.3 Boundaries and single points of failure

| Capability | Sole holder(s) | Evidence |
|---|---|---|
| Spawn subagents | `orchestrator` | `orchestrator.md:12-62`; global deny `config/opencode.json:149-153` |
| Set subagent models | `orchestrator` (both tools) | `orchestrator.md:99-104`; global deny `config/opencode.json:139-148` |
| Linear + GitLab MCP | `project-manager` | `project-manager.md:12-17`; global deny `config/opencode.json:99-108`; `AGENTS.md:75-76` |
| Grafana observability | `devops-tsai` | `devops-tsai.md:5-8`; global deny `config/opencode.json:119-123` |
| Browser automation — MCP `browser_*` (user's own logged-in browser) | `web-crawler` only | `web-crawler.md:6`; global deny `config/opencode.json:109-113` |
| Built-in browser (`browser`, desktop app) | `orchestrator`, `build`, `researcher`, `reviewer`, `motion-designer`, `implementer`, `worker`, `test-engineer`, `web-crawler` | `orchestrator.md:105`; `build.md:33`; `researcher.md:33`; `reviewer.md:33`; `motion-designer.md:12`; `implementer.md:15`; `worker.md:15`; `test-engineer.md:15`; `web-crawler.md:9`; global deny `config/opencode.json:114-118` |
| Blender/3D | `game-developer`, `build` | `game-developer.md:12-14`; `build.md:36-38` |
| External web research | `researcher` | `researcher.md:27-32` |
| Full-access escape hatch | `build` | `build.md:6-74` |

**Consequence [inference]:** if `orchestrator` is unavailable or its allow-list is wrong, no other
orchestrated agent can delegate; the only fallback is the human selecting `build`.

### 2.4 Orchestration flow

```
User ──> orchestrator (primary, default_agent, read-only)
           │  config/opencode.json:3 ; orchestrator.md:3,110-112
           │  no edit/webfetch/websearch/MCP ; shell = git + codeburn (:69-86)
           │  only agent with `subagent` allow + set_subagent_model(s) (:99-104)
           ▼  delegate (AGENTS.md:78-100)
   ┌────────────┬───────────────┬────────────────┬────────────────────────┐
   │ discovery  │ build         │ verify         │ domain                 │
   │ product-   │ implementer/  │ test-engineer  │ devops-tsai(Grafana)   │
   │ analyst,   │ worker        │ reviewer/      │ web-crawler(browser)   │
   │ system-    │               │ requirements-  │ motion-designer        │
   │ analyst,   │               │ reviewer/      │ game-developer(+blender)│
   │ researcher │               │ security-rev.  │ project-manager(L/G)   │
   └────────────┴───────────────┴────────────────┴────────────────────────┘
           │ escalate: architect ──> oracle (AGENTS.md:98-99)
           │ model override: plugins/agent-models/index.ts:189-215
           ▼
        COMPLETE | BLOCKED  (AGENTS.md:122-124)
```

Per-run model resolution: on every subagent prompt the plugin re-reads
`~/.config/opencode/agent-models.json`; if the child's agent name has an entry it calls `switchModel`
inside a `try/catch` (`plugins/agent-models/index.ts:189-215`) — a bad or unavailable provider
override is swallowed and the subagent keeps its default instead of failing its own prompt. An
override otherwise **wins over** the frontmatter `model:` line for that subagent; with no entry the
frontmatter default applies.

---

## 3. Coverage matrix — software-delivery lifecycle

Legend: **C** = covered, **P** = partial, **N** = not covered.

| Lifecycle stage | Status | Responsible agent(s) | Evidence |
|---|---|---|---|
| Discovery / requirements | **C** | `product-analyst`, `system-analyst`, `researcher` | `product-analyst.md:2`; `system-analyst.md:2`; `researcher.md:2` |
| Design — UX/UI | **P** | `uxui` (placeholder, no skills) | `uxui.md:2,9`; `AGENTS.md:51` |
| Design — architecture | **C** | `architect`, `oracle` (escalation only) | `architect.md:2`; `oracle.md:2`; `AGENTS.md:98-99` |
| Implementation | **C** | `implementer`, `worker`, `build` | `implementer.md:2`; `worker.md:2`; `build.md:77-90` |
| Testing / verification | **C** | `test-engineer` (+ skills `verify`,`debug`) | `test-engineer.md:2`; `.opencode/skills/verify`,`debug` |
| Review — correctness | **C** | `reviewer` | `reviewer.md:2` |
| Review — acceptance | **C** | `requirements-reviewer` | `requirements-reviewer.md:2` |
| Review — security | **C** | `security-reviewer` | `security-reviewer.md:2` |
| Release / deploy / CI | **N** | — | No agent owns build pipelines; `devops-tsai` is Grafana-only (`devops-tsai.md:5-8`) |
| Observability / incident | **P** | `devops-tsai` | `devops-tsai.md:2,5-8,11-15` (Grafana only; no browser) |
| Docs / writing | **P** | `implementer` (incidental) | `implementer.md:2` mentions documentation changes; no dedicated writer |
| Maintenance / upgrades / deps | **N** | — | No agent for dependency/version upgrades |
| Data / ML | **N** | — | No agent |
| Mobile / embedded | **N** | — | No agent |
| i18n / a11y / perf | **N** (a11y mentioned only as prose) | `uxui` (accessibility text only) | `uxui.md:7`; no skills or dedicated agent |
| Game development | **C** | `game-developer` | `game-developer.md:2`; skills `:6-11` |
| Video / motion graphics | **C** | `motion-designer` | `motion-designer.md:2,5-35,38-44` |
| 3D / Blender | **C** | `game-developer` (merged) | `game-developer.md:12-14,31-41`; `blender.md` deleted |
| Task tracking / MR links | **C** | `project-manager` | `project-manager.md:12-17,27-38` |
| External web research / browsing | **C** | `researcher` (web), `web-crawler` (user's own browser) | `researcher.md:27-33`; `web-crawler.md:6` |

---

## 4. Gaps and risks

### 4.1 Resolved by this change

These were real defects in an earlier snapshot; the current files fix them. They are recorded so the
history is not re-discovered as new work.

| Was | Now (fix) |
|---|---|
| **`/subagents` configured only a hard-coded five** [pre-change]: the old `commands.subagents` template was a per-agent questionnaire naming exactly `worker`, `implementer`, `researcher`, `test-engineer`, `reviewer` and instructing a per-agent call of the then-existing `set_subagent_model` (see 5(a)); the other 12 subagents had no path through the command. | The one-question template (`config/opencode.json:251`) calls the bulk `set_subagent_models`; the plugin implements both tools (`plugins/agent-models/index.ts:220` bulk, `:257` one-off); the global deny list covers both (`config/opencode.json:139-148`); the orchestrator allows both (`orchestrator.md:99-104`). Verified: `node scripts/check-agent-presets.mjs` passes. |
| **Orchestrator allow-list referenced deleted/renamed agents** (`devops`, `web-browser-agent`, `gamedev`, `blender`). | The allow-list now names the current ids: `devops-tsai` (`orchestrator.md:49`), `web-crawler` (`:52`), `game-developer` (`:58`); deleted names removed (`:12-62`). |
| **Browser access realigned to agent instructions**: `project-manager` had `browser_*` [pre-change] even though its work runs through the Linear/GitLab MCP tools; this change removed it. `devops-tsai` had the same class of mismatch. | Both now state browser tools are **NOT available** (`project-manager.md:2,23,29,36`; `devops-tsai.md:2,13`) and neither opts in to `browser_*`. MCP `browser_*` is now restricted to `web-crawler` alone (`web-crawler.md:6`); see the browser-policy-narrowing row below. |
| **Blender merge left doc drift**: `AGENTS.md`/`README.md` still documented a separate `blender` agent and the orchestrator still allowed it. | `AGENTS.md:24,52` and `README.md:92` document `game-developer` as the 3D/Blender owner; `orchestrator.md` no longer lists `blender`; `agents/blender.md` is deleted. |
| **Docs ↔ files permission drift**: docs described `solo`, `web-browser-agent`, `devops`, `gamedev`, `blender` and `mode: all` for domain agents; `README.md:61` claimed 20 agents while the directory held 19. | `AGENTS.md:33-53` and `README.md:68-93,125-138` now list the current ids and `subagent` modes; `README.md:61` says 19 agents (13 core + 6 domain). |
| **`game-developer` over-restricted**: the merged Blender agent (`blender.md`, now deleted) brought a blanket `shell` deny plus Blender-only `shell` allows (`blender`, `setsid *blender*`, `nohup *blender*`, `pgrep *blender*`, `pkill *blender*`, `ss -ltn*`, the `blender-mcp` launcher), so the gameplay/studioigor commands (`git`, `python3`, `node`, engines) were blocked. | `game-developer.md` now declares no `edit`/`shell` rule and keeps the allow-all default like `web-crawler`/`devops-tsai`/`motion-designer`/`uxui` (see 4.3); `blender_*` was re-added as an MCP opt-in (`game-developer.md:12-14`). |
| **Built-in `browser` action was un-gated** [pre-change]: the built-in desktop-app browser catalog (tabs/navigation/snapshots/screenshots/traces/`browser.preview`, docs: https://opencode.ai/v2/docs/tools, `## Browser`) is a distinct action from the `browser_*` MCP family; no global rule matched action `browser`, so the allow-all default exposed it to all 19 agents, contradicting the documented "browser tools are NOT available" policy for `devops-tsai`/`project-manager`. | `config/opencode.json` now denies the built-in `browser` action globally alongside the `browser_*` MCP family; nine agents opt in with an agent-level `browser` allow — `build`, `researcher`, `reviewer`, `web-crawler`, `motion-designer` and `orchestrator`, `implementer`, `worker`, `test-engineer` (built-in only, so they keep `browser.preview`); only `web-crawler` also opts into MCP `browser_*` (narrowed in the next row). The remaining ten agents have no browser of either kind, which makes the existing "browser tools are NOT available" prose in `devops-tsai`/`project-manager` accurate again. Evidence: global deny `config/opencode.json:114-118`; agent-level `browser` allows `orchestrator.md:105`, `implementer.md:15`, `worker.md:15`, `test-engineer.md:15`, `build.md:33`, `researcher.md:33`, `reviewer.md:33`, `web-crawler.md:9`, `motion-designer.md:12`. |
| **MCP `browser_*` over-granted** [pre-change]: the user's own logged-in browser (the `browser` MCP server, `npx -y open-browser-control`) was opted in by five agents — `researcher`, `reviewer`, `web-crawler`, `motion-designer`, `build` — although only `web-crawler` exists to drive the user's real browser/profile. | MCP `browser_*` is now narrowed to **`web-crawler` only**; the other four dropped it and instead state in their bodies that the user's own browser is not available and that a need for it is reported back to the caller (`build.md:81`; `researcher.md:47-48`; `reviewer.md:51`; `motion-designer.md:43`). The built-in desktop-app `browser` is unchanged at nine agents. The routing rule is now explicit: the user's browser is reachable **only** through `web-crawler`, so any task needing it (logged-in pages, cookies/profile, a real signed-in surface) is routed there (`AGENTS.md:20,57-63`; `orchestrator.md:118-133`). Evidence: `grep -rn 'browser_\*' agents/` → exactly one opt-in, `web-crawler.md:6`; global deny `config/opencode.json:109-113`. |

### 4.2 Open — reviewer overlap / escalation ambiguity (P1)

`reviewer` is `#high` and the four other read-only reviewers/escalations share `#max`:
`requirements-reviewer`, `security-reviewer`, `architect`, `oracle` (`requirements-reviewer.md:4`,
`security-reviewer.md:4`, `architect.md:4`, `oracle.md:4`; `reviewer.md:4` is `#high`). Selection
guidance exists only as prose (`AGENTS.md:82-100`). `reviewer.md:2` folds correctness + regressions +
contracts + architecture into one role, overlapping `security-reviewer`/`requirements-reviewer`/
`architect`. No rule prevents running all five.

### 4.3 Open — `uxui` is a placeholder with unrestricted `edit`/`shell` (P1)

`uxui.md:2` says "(placeholder; design skills to be added)"; `:9` says no design skills are attached.
The file has **no `permissions` block at all** (`uxui.md:1-5`), so it inherits allow-all for `edit`
and `shell` (the config denies neither). A "design" role can edit files and run arbitrary commands.
The same unrestricted `edit`/`shell` applies to `web-crawler` (`web-crawler.md:5-9` lists only
`browser_*` and the built-in `browser`), `devops-tsai` (`:5-8`), `motion-designer` (`:5-38`), and `game-developer`
(`game-developer.md:1-18`; no `edit`/`shell` rule). `README.md:140-145` acknowledges that this
allow-all group keeps the default.

`game-developer` is the newest member of that group, and its position is a **conscious tradeoff, not
an oversight**. The merged Blender agent had arrived with a blanket `shell` deny plus Blender-only
command allows (4.1), which over-restricted the resulting agent: the `git`/`python3`/`node` and
engine commands its `ref2game`/`studioigor` skills need were blocked, as was starting Blender itself.
The change exchanged that over-restriction for the unrestricted `shell` the other write-capable
domain agents keep, so the agent now works but its `shell` is unbounded rather than Blender-scoped.
P1-2 proposes tightening `edit`/`shell` for the other members of this group (`uxui`, `web-crawler`,
`devops-tsai`, `motion-designer`) if their writes turn out to be unnecessary.

### 4.4 Open — model overrides are keyed by name and can go stale silently (P1)

The plugin applies an override only when `overrides[info.agent]` exists
(`plugins/agent-models/index.ts:196-197`). Because the key is the **agent name**, a rename leaves a
stale key that silently stops matching; and an override masks the frontmatter `model:` line
(`AGENTS.md:68-73`/`README.md:167-171` describe the mechanism but not the masking). `set_subagent_model`
validates `combo` against `COMBOS` (`index.ts:276-277`) but the `agent` field is a free string
(`:263`) and is **not** validated against real agent files.

### 4.5 Open — `build` is the only second primary (P2)

`orchestrator.md:3` and `build.md:3` are the only `mode: primary` files. With every domain agent on
`subagent`, the only user-selectable primaries are `orchestrator` and `build`. Blender/3D and
browser work are no longer directly selectable as primaries **[inference: selection semantics]**.

### 4.6 Open — missing roles (P1/P2)

No agent covers release/CI (`devops-tsai` is Grafana-only, `devops-tsai.md:5-8`), documentation
writing (only incidental via `implementer.md:2`), dependency/upgrade maintenance, data engineering/ML,
mobile/embedded, or i18n/performance. `uxui.md:7` mentions accessibility but attaches no skill.
Verified by absence: the 19 agent files and `AGENTS.md:33-53` name none of these.

### 4.7 Open — no per-agent cost/run observability (P2)

Cost guidance is prose only (`AGENTS.md:82-83`; `orchestrator.md:130-135`). The quota plugin
`@slkiser/opencode-quota@5.0.2` (`config/opencode.json:90`) and the `codeburn*` shell allow
(`orchestrator.md:84-86`) exist, but there is **no per-agent attribution or run ledger** in the repo.
**[unverified: whether the quota plugin exposes per-agent attribution.]**

### 4.8 Open — permission/enforcement gaps not covered by the new check (P0)

`scripts/check-agent-presets.mjs` now covers a wide slice of the preset surface (section 7 runs it):

- **coverage** — preset ↔ agent-name coverage: all 17 non-primary agents present in every preset, and
  no preset naming an agent that is not a real non-primary file; primary agents are excluded;
- **frontmatter ↔ preset parity** — every non-primary agent file's frontmatter `model:` equals that
  agent's `deepseek` preset entry rendered as `providerID/model#variant` (the documented default
  profile);
- **provider/model validity** — every preset providerID is a configured provider (or the built-in
  `opencode`) and every provider/model pair is known;
- **preset → provider binding** — `deepseek`→`deepseek`, `opencode-free`→`opencode`, `codex`→`openai`,
  `claude-code`→`claude-code`, with the offending entry reported;
- **variants** — derived from `providers.<p>.models.<m>.variants` in `config/opencode.json` where the
  pair is declared there, and from a hardcoded registry (mirroring the providers' own definitions)
  otherwise; the registry is authoritative only for pairs the repo config does not declare;
- **enum exactness** — the plugin's `PRESET_IDS` enum equals exactly `{presets…, "none"}`, so a missing
  member *and* an extra member (which would advertise a preset returning "unknown preset") both fail;
- **`COMBOS` consistency** — no duplicate `value`, and every `value` equals its own
  `providerID/model#variant`; every pair a preset uses must be offered;
- **config template** — all four preset ids offered, the one-call phrase present, and the tool the
  template tells the model to call is exactly `set_subagent_models` (a regression to the one-off
  `set_subagent_model` fails even though that tool exists).

It still does **not** check:

- that the `agent` argument of `set_subagent_model`/`set_subagent_models` exists as a real agent file;
- that the orchestrator `subagent` allow-list targets exist and match `agents/*.md`;
- that MCP families other than the browser tools are denied globally and opted in per agent (e.g.
  `linear_*`/`gitlab_*` on exactly one agent, or the other MCP families' global denies) — the
  browser policy is the exception and **is** checked (global `browser`/`browser_*` deny, the built-in
  `browser` allow on exactly nine agents, MCP `browser_*` on `web-crawler` only, fail-closed);
- that `mode` values are valid and domain agents stay `subagent`;
- that docs (`AGENTS.md`, `README.md`) match the agent files, or that the README count equals
  `ls agents/*.md | wc -l`;
- that a preset's effort is *right* rather than merely internally consistent — it validates values, not
  intent, so a wrong-but-valid whole-profile swap still passes;
- that a provider is actually authenticated, that OpenCode really enforces the permissions, or that the
  installed config is loaded as written (no provider-auth or permission-enforcement check).

This is the residual of the drift class fixed in 4.1 — it can recur because nothing fails the build.

### 4.9 Open — `devops-tsai` name leaks vendor/tenant into the agent id (P2)

`devops-tsai.md:2` scopes the agent to "tsai.tech" and `config/opencode.json:37` hardcodes
`https://mcp-grafana.tsai.tech/mcp`. This couples a global agent id to one tenant.

---

## 5. Root causes

### 5(a) Why `/subagents` used to configure only 5 subagents

**Verified mechanism (structure).** The old `/subagents` command was a *hardcoded* per-agent
questionnaire: its template named exactly five subagents — `worker`, `implementer`, `researcher`,
`test-engineer`, `reviewer` **[pre-change: quoted from a snapshot of `config/opencode.json` before the
template was replaced; not re-verifiable now]**. The plugin's singular tool sets **one** agent per
call and its `agent` field is a free string with no enumeration
(`plugins/agent-models/index.ts:263`), so the only thing limiting the set was the template's fixed
list.

**Corroborating runtime evidence [pre-change].** At the time, `~/.config/opencode/agent-models.json`
contained exactly those five keys. No other subagent was ever written. The plugin only applies an
override when `overrides[info.agent]` exists (`index.ts:196-197`); with no entry, a subagent keeps its
frontmatter `model:` line. So `product-analyst`, `system-analyst`, `requirements-reviewer`,
`security-reviewer`, `architect`, `oracle`, `motion-designer`, `uxui`, `game-developer`, `web-crawler`,
`devops-tsai`, `project-manager` were never configurable through `/subagents` — not because they are
not subagents, but because the command never asked about them.

**Fix (implemented).** The template (`config/opencode.json:251`) now asks **one** question: which
preset to apply to all subagents. It offers `deepseek`, `opencode-free`, `codex`, `claude-code`, plus
`none` to reset, and calls `set_subagent_models` exactly once. The plugin owns the `PRESETS` list
(`plugins/agent-models/index.ts:22-119`) covering **all 17 subagents** and replaces the whole
overrides file in one serialized write (`:218-252`). `set_subagent_model` (`:257`) remains for one-off
per-agent overrides. Verified: the runtime `~/.config/opencode/agent-models.json` now holds all 17
subagents, and `node scripts/check-agent-presets.mjs` reports every preset covers all 17.

### 5(b) Why domain agents appeared as selectable primaries but `researcher` did not

**Verified mechanism.** OpenCode's `mode` frontmatter controls availability: `primary` = top-level
only, `subagent` = child only, `all` = both. `researcher.md:3` is `mode: subagent`, so it is not
selectable as a primary. The domain agents were declared `mode: all`
**[pre-change: `uxui`, `project-manager`, `motion-designer`, and the then-current
`devops`/`gamedev`/`blender`/`web-browser-agent`]**.

`all` is what made an agent appear in the primary picker alongside `orchestrator` and `build`
**[inference: platform semantics, not executed]**; `researcher` (and every core subagent) is
`subagent`, so it never appeared.

**Fix (implemented).** Every domain agent is now `mode: subagent`
(`uxui.md:3`, `project-manager.md:3`, `motion-designer.md:3`, `web-crawler.md:3`,
`devops-tsai.md:3`, `game-developer.md:3`). The only `mode: primary` files are `orchestrator.md:3`
and `build.md:3`. Verified by `grep -n "^mode:" agents/*.md`.

---

## 6. Recommendations

Format: action — file to change — benefit — risk/cost.

### P0 — correctness / enforcement

| # | Action | Files | Benefit | Risk / cost |
|---|---|---|---|---|
| P0-1 | Validate the `agent` argument of both model tools against real agent files (e.g. glob `agents/*.md`), and warn/ignore stale override keys on load. | `plugins/agent-models/index.ts:189-215,218-252,255-285` | Prevents typos and stale keys from silently masking an agent's frontmatter model (4.4) | Low: the plugin must list agent names; keep the self-contained single-file constraint |
| P0-2 | Wire `scripts/check-agent-presets.mjs` into `scripts/install.sh --check`/CI so it is not manual. The browser-policy part ((b) and the browser half of (c)) is **done**: the check now enforces it. Still to add: (a) every orchestrator `subagent` allow target exists in `agents/`, (d) `mode` values are valid and domain agents are `subagent`, (e) every tool named in `commands.*` exists in the plugin, (f) README agent count equals the file count. | `scripts/install.sh:239-247`; `scripts/check-agent-presets.mjs` | Runs the preset + browser-policy check automatically | Medium: a frontmatter/JSON parser to maintain |

### P1 — coverage / structural invariants

| # | Action | Files | Benefit | Risk / cost |
|---|---|---|---|---|
| P1-1 | Publish a reviewer-selection decision table and encode it (at most one of `reviewer`/`requirements-reviewer`/`security-reviewer` mandatory per change class). | `AGENTS.md:82-100`; `.opencode/skills/review-loop/SKILL.md` | Reduces 4.2 overlap and cost | Low |
| P1-2 | Add `edit`/`shell` deny to the read-only-ish domain agents (`uxui`, `web-crawler`, `devops-tsai`, `motion-designer`) unless writes are required. | those frontmatters | Closes 4.3 over-permission | Low–medium: may block legitimate motion/browser file writes |
| P1-3 | Add missing roles as thin agents: `release`/CI, `docs`, `deps` (upgrades). Reuse existing permission patterns. | new `agents/*.md`; `AGENTS.md` tables | Closes 4.6 | Medium: each needs a clear tool boundary |

### P2 — hygiene / observability

| # | Action | Files | Benefit | Risk / cost |
|---|---|---|---|---|
| P2-1 | Generate the `AGENTS.md` capability/routing tables from agent frontmatter instead of hand-maintaining them. | `AGENTS.md:33-53`; a generator script | Eliminates the docs-drift class permanently | Medium |
| P2-2 | Add per-agent run attribution (agent id → tokens/quota) using the quota plugin surface; surface a short ledger. | `config/opencode.json:90`; new script | Enables cost control (4.7) | Medium: depends on the plugin API |
| P2-3 | Rename `devops-tsai` to a tenant-neutral id, or document the coupling. | `agents/devops-tsai.md`; `config/opencode.json:37`; docs | Portability (4.9) | Low |
| P2-4 | Decide explicitly whether i18n/a11y/perf and data/mobile are out of scope, and record the decision. | `AGENTS.md` | Makes 4.6 explicit rather than an omission | Low |

**Invariant-first principle:** prefer a failing script + `install.sh --check` (which already exits
non-zero on drift, `scripts/install.sh:239-247`) over new prose in `AGENTS.md`, per `AGENTS.md:129-133`.

---

## 7. How to re-verify

Run from the repository root. These are the exact checks behind this document.

```sh
# Agent-preset coverage: 4 presets × 17 agents; frontmatter `model:` == "deepseek"
# preset entry; providerID + preset→provider binding; config-derived variant
# allow-list; exact PRESET_IDS enum; COMBOS duplicate/field consistency; one-call
# config template naming exactly the bulk tool set_subagent_models.
# Exits 0 on success, 1 with a violation list otherwise.
node scripts/check-agent-presets.mjs

# Modes: expect 2 primary (build, orchestrator) and 17 subagent.
grep -n "^mode:" agents/*.md

# MCP browser_* opt-in: expect exactly ONE opt-in — web-crawler.md:6. Assert the count;
# any other match must be body prose only.
grep -rn 'action: "browser_\*"' agents/ | wc -l   # -> 1
grep -n "browser_\*" -r agents/

# Built-in browser grants: expect the `browser` action on build, researcher, reviewer,
# web-crawler, motion-designer, orchestrator, implementer, worker, test-engineer only.
grep -n "browser" agents/*.md | grep -v "browser_"

# Model tools: bulk + one-off both defined in the plugin, both denied globally,
# both allowed by the orchestrator; config template calls the bulk tool.
grep -n "set_subagent_models\|set_subagent_model" \
  plugins/agent-models/index.ts config/opencode.json agents/orchestrator.md

# Linear/GitLab exclusivity and the global deny surface.
grep -n "linear_\*\|gitlab_\*" -r agents/ config/opencode.json

# Global default surface and the disabled agents block (only `plan`).
grep -n "\"permissions\"\|\"agents\"\|\"disabled\"\|\"commands\"" config/opencode.json

# Agent count (should be 19).
ls agents/*.md | wc -l

# Installed global config: every path a correct symlink into this repo, secrets present.
scripts/install.sh --check

# Optional: what a change would do to the installed config, without writing.
scripts/install.sh --dry-run
```

---

## 8. Evidence notes and uncertainties

- **Verified by execution:** `node scripts/check-agent-presets.mjs` → `agent-presets check OK`
  (4 presets × 17 agents); `scripts/install.sh --check` → 8 links correct, 0 drift, exit 0.
- **Verified by reading:** every `path:line` in sections 1–6; the plugin's tool definitions,
  `PRESETS`/`COMBOS`, and prompt hook; the config permission block, agents block and
  `commands.subagents` template; all 19 agent frontmatters.
- **[inference] OpenCode runtime semantics.** That `mode: all` puts an agent in the primary picker and
  `mode: subagent` does not is grounded in the frontmatter values and observed behaviour, not in
  OpenCode source/docs.
- **[inference] Default permission semantics.** "No `edit`/`shell` rule ⇒ allow-all" rests on
  `README.md:106-118,140-145` plus the absence of a global `edit`/`shell` deny in
  `config/opencode.json:93-169`; OpenCode was not executed to confirm the runtime default.
- **[pre-change]/[unverified] §5(a) and §5(b) history.** The old 5-name template, the five runtime
  keys, and the old `mode: all` values were observed in a snapshot taken while the change was in
  flight; they cannot be re-verified now that the files have been replaced. The structural mechanism
  (one-agent tool + free-string `agent`) is verified in the current plugin.
- **[unverified] Quota tooling.** The quota plugin is listed (`config/opencode.json:90`) but its
  per-agent attribution capability was not verified (relevant to 4.7/P2-2).
- **[unverified] Installed config equality.** `install.sh --check` confirms the symlinks point at this
  repo; it does not confirm OpenCode loads them in a running process (the Linux file-watcher caveat is
  documented in `README.md:32-34`).
