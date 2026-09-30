---
name: review-loop
description: Run independent agent-to-agent review and correction until meaningful findings are resolved; use for substantial changes before handoff.
---

# Review loop

Select reviews by risk; never run every reviewer mechanically.

- correctness/regression/architecture: `reviewer`
- user/product acceptance: `requirements-reviewer`
- auth, permissions, payments, secrets, untrusted input, sensitive data: `security-reviewer`
- behavior/test adequacy: `test-engineer`

Run independent reviews in parallel when possible.
Aggregate only concrete findings. Send bounded corrections to the `implementer` or `worker`.
Re-run affected deterministic checks and only the reviews invalidated by corrections.
Stop review theater: PASS is acceptable when there are no meaningful findings.
Escalate to `architect` only for consequential unresolved disagreement or architecture; `oracle` only after that fails.
