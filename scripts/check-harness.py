#!/usr/bin/env python3
"""Structural and policy validation for the OpenCode agent workflow.

Run: python3 scripts/check-harness.py

Validates agent frontmatter, skill frontmatter, AGENTS.md discoverability,
required directories/artifacts, and the evaluation journal.
"""
from pathlib import Path
import json
import sys

try:
    import yaml
except ImportError as error:  # pragma: no cover - environment guard
    print("Harness check FAILED")
    print(f"- PyYAML is required to parse agent/skill frontmatter: {error}")
    sys.exit(1)

try:
    from eval_schema import validate_row
except ImportError as error:
    print("Harness check FAILED")
    print(f"- scripts/eval_schema.py: cannot import shared schema: {error}")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]

# Agents live in `agents/` in the source kit and in `.opencode/agents/` once installed.
AGENTS_DIR = ROOT / ".opencode/agents"
if not AGENTS_DIR.is_dir():
    AGENTS_DIR = ROOT / "agents"

errors = []

EXPECTED_AGENTS = {
    "product-analyst",
    "system-analyst",
    "researcher",
    "implementer",
    "worker",
    "test-engineer",
    "reviewer",
    "requirements-reviewer",
    "security-reviewer",
    "architect",
    "oracle",
}
PRIMARY_AGENTS = {"orchestrator"}
ALL_AGENTS = EXPECTED_AGENTS | PRIMARY_AGENTS
EXPECTED_SKILLS = {
    "bootstrap-project",
    "debug",
    "plan",
    "verify",
    "review-loop",
    "improve-harness",
    "docs-gardening",
    "record-outcome",
    "evaluate-harness",
}


def fail(msg):
    errors.append(msg)


def read_frontmatter(path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError("missing frontmatter block")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("unterminated frontmatter block")
    data = yaml.safe_load(parts[1])
    if not isinstance(data, dict):
        raise ValueError("frontmatter is not a mapping")
    return data


# --- Agents -----------------------------------------------------------------
agent_paths = sorted(AGENTS_DIR.glob("*.md"))
agents = {p.stem for p in agent_paths}
for name in sorted(ALL_AGENTS - agents):
    fail(f"{AGENTS_DIR.relative_to(ROOT)}/{name}.md: required agent is missing")

for path in agent_paths:
    rel = path.relative_to(ROOT)
    try:
        data = read_frontmatter(path)
    except (OSError, ValueError, yaml.YAMLError) as e:
        fail(f"{rel}: invalid frontmatter: {e}")
        continue

    for field in ("description", "mode"):
        if not data.get(field):
            fail(f"{rel}: missing required field {field!r}")

    mode = data.get("mode")
    if path.stem in PRIMARY_AGENTS and mode != "primary":
        fail(f"{rel}: primary agent must use mode 'primary', got {mode!r}")
    if path.stem in EXPECTED_AGENTS and mode != "subagent":
        fail(f"{rel}: subagent must use mode 'subagent', got {mode!r}")

    # --- Skills -----------------------------------------------------------------
skill_paths = sorted((ROOT / ".opencode/skills").glob("*/SKILL.md"))
skills = {p.parent.name for p in skill_paths}
for name in sorted(EXPECTED_SKILLS - skills):
    fail(f".opencode/skills/{name}/SKILL.md: required skill is missing")

for path in skill_paths:
    rel = path.relative_to(ROOT)
    try:
        data = read_frontmatter(path)
    except (OSError, ValueError, yaml.YAMLError) as e:
        fail(f"{rel}: invalid frontmatter: {e}")
        continue
    if data.get("name") != path.parent.name:
        fail(f"{rel}: frontmatter name must match directory name {path.parent.name!r}")
    if not data.get("description"):
        fail(f"{rel}: missing description")

# --- AGENTS.md discoverability ---------------------------------------------
try:
    policy = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
except OSError as error:
    fail(f"AGENTS.md: cannot read file: {error}")
    policy = ""

for name in sorted(ALL_AGENTS & agents):
    if f"`{name}`" not in policy:
        fail(f"AGENTS.md: shipped agent '{name}' is not discoverable")
for name in sorted(EXPECTED_SKILLS & skills):
    if f"`{name}`" not in policy:
        fail(f"AGENTS.md: shipped skill '{name}' is not discoverable")

# --- Required artifacts and directories ------------------------------------
required_files = [
    "AGENTS.md",
    ".opencode-evals/README.md",
    ".opencode-evals/runs.jsonl",
    "scripts/check-harness.py",
    "scripts/eval-report.py",
    "scripts/eval_schema.py",
]
for rel in required_files:
    if not (ROOT / rel).is_file():
        fail(f"missing harness artifact: {rel}")

required_dirs = [
    str(AGENTS_DIR.relative_to(ROOT)),
    ".opencode/skills",
    ".opencode-evals",
    "docs/agent",
    "docs/exec-plans/active",
    "docs/exec-plans/completed",
]
for rel in required_dirs:
    if not (ROOT / rel).is_dir():
        fail(f"missing harness directory: {rel}")

# --- Evaluation journal -----------------------------------------------------
journal = ROOT / ".opencode-evals/runs.jsonl"
if journal.is_file():
    for n, line in enumerate(journal.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except Exception as e:
            fail(f".opencode-evals/runs.jsonl line {n}: invalid JSON: {e}")
            continue
        errors.extend(f".opencode-evals/runs.jsonl {error}" for error in validate_row(row, n, agents))

if errors:
    print("Harness check FAILED")
    for e in errors:
        print(f"- {e}")
    sys.exit(1)

print(f"Harness check PASS: {len(agents)} agents, {len(skills)} skills")
