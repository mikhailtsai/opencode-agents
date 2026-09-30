---
name: record-outcome
description: Record a compact non-sensitive outcome after substantial work so the harness can be evaluated from real tasks; use after meaningful completed (or user-corrected) work.
---

# Record outcome

After substantial work, append one JSON object to `.opencode-evals/runs.jsonl`.

Record:
- UTC timestamp
- short non-sensitive task label and category
- outcome: `PASS`, `FAIL`, `HUMAN_CORRECTION`, or `REGRESSION`
- agents actually used
- retry count
- deterministic checks passed/failed
- meaningful review findings count
- whether `architect` or `oracle` escalation was used
- whether a human correction was required
- short non-sensitive notes/tags when useful

Schema:

```json
{"ts":"2026-09-30T12:00:00Z","task":"short-label","category":"bugfix","outcome":"PASS","agents":["researcher","implementer","reviewer"],"retries":0,"checks":{"passed":3,"failed":0},"review_findings":0,"architect":false,"oracle":false,"human_correction":false,"notes":[]}
```

Do not run this after every trivial task, and do not store prompts, code, secrets, credentials, personal data, raw logs, or large tool outputs.
Quantitative token/cost/cache telemetry is NOT stored here; it comes from Codeburn separately (see `evaluate-harness`).

PASS means available validation found no known defect; it is not a claim of mathematical correctness.
If a user later reports a defect after completion, append a `HUMAN_CORRECTION` or `REGRESSION` record rather than rewriting history.
