---
name: evaluate-harness
description: Analyze accumulated task outcomes plus Codeburn telemetry to find recurring workflow weaknesses and evidence-backed harness improvements; use periodically, not after every task.
---

# Evaluate harness

Run this periodically (for example at the end of a work session or after a batch of substantial
tasks), NOT after every task. Per-task samples are too small to justify changes.

1. Read `.opencode-evals/runs.jsonl` first: the qualitative record of outcomes, agents used,
   retries, checks, escalations, and human corrections.
2. Pull quantitative token/cost/cache/tool telemetry from Codeburn, for example:
   - `codeburn optimize` for concrete token waste and fixes.
   - `codeburn models --agent` (or the per-agent breakdown) for per-role spend.
   - `codeburn report` / `codeburn sessions` for the session-level view.
   Treat Codeburn as trends across many tasks, not as per-task truth.
3. Look for repeated failure classes, not isolated anecdotes: recurring `FAIL`,
   `HUMAN_CORRECTION`, `REGRESSION`, retry clusters, or expensive escalations.
4. Separate measured facts from hypotheses. State sample size and uncertainty.
5. Recommend the smallest durable improvement: test/check, repository knowledge, debugging aid,
   observability, skill, routing/model change, or only when truly necessary a new role.
6. Use `improve-harness` for an approved concrete improvement.
7. Do not optimize metrics by weakening validation or avoiding difficult tasks.
8. Do not infer model quality from tiny samples.
9. Record that Codeburn ran: `python3 scripts/codeburn_state.py mark`. This updates
   `.opencode-evals/codeburn-state.json` so the orchestrator can suggest the next review on time.

Prefer the default model for this analysis. The `architect`/`oracle` escalations are unnecessary
unless the analysis exposes an independently consequential architecture problem.
