#!/usr/bin/env python3
"""Roster consistency check for the globally-installed OpenCode agents.

Run: python3 scripts/check-roster.py

Cross-checks the source ``agents/*.md``, the deployed ``$OPENCODE_CONFIG_DIR/agent/*.md``
and ``$OPENCODE_CONFIG_DIR/opencode.json``, and the authoritative map in ``AGENTS.md``:

1. every visible/enabled ``subagent``/``all`` agent is allow-listed in the orchestrator's
   ``permission.task`` (``primary``-only agents are user-selected, not delegated);
2. ``researcher`` does not deny ``webfetch``/``websearch``;
3. every agent referenced in ``AGENTS.md`` actually exists.

Exit 0 on PASS, 1 on any failure. stdlib only (PyYAML allowed for frontmatter).
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError as error:  # pragma: no cover - environment guard
    print("Roster check FAILED")
    print(f"- PyYAML is required to parse agent frontmatter: {error}")
    sys.exit(1)

REPO_DIR = Path(__file__).resolve().parents[1]
CONFIG_DIR = Path(
    os.environ.get("OPENCODE_CONFIG_DIR") or (Path.home() / ".config" / "opencode")
)

# OpenCode built-ins that are not defined by this kit; never expected in the task allow-list.
BUILTIN_AGENTS = {
    "build",
    "plan",
    "general",
    "explore",
    "compaction",
    "title",
    "summary",
}

# Shape used to recognize an agent reference inside AGENTS.md (skills/tools/MCP are ignored).
AGENT_SUFFIXES = ("-agent", "-reviewer", "-analyst", "-engineer", "-designer")
SHORT_AGENT_NAMES = {
    "orchestrator",
    "researcher",
    "implementer",
    "worker",
    "reviewer",
    "architect",
    "oracle",
    "devops",
    "uxui",
    "gamedev",
}

errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def read_frontmatter(path: Path) -> dict:
    """Return the YAML frontmatter mapping of an agent markdown file."""
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError("missing frontmatter block")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("unterminated frontmatter block")
    data = yaml.safe_load(parts[1])
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise ValueError("frontmatter is not a mapping")
    return data


def load_agent_dir(directory: Path, label: str) -> dict:
    """Parse ``*.md`` agent definitions in a directory; missing dir is not an error."""
    agents: dict = {}
    if not directory.is_dir():
        return agents
    for path in sorted(directory.glob("*.md")):
        try:
            data = read_frontmatter(path)
        except (OSError, ValueError, yaml.YAMLError) as error:
            fail(f"{label}/{path.name}: invalid frontmatter: {error}")
            continue
        name = data.get("name") or path.stem
        agents[str(name)] = {
            "name": str(name),
            "mode": data.get("mode"),
            "permission": data.get("permission") or {},
            "disable": data.get("disable"),
            "hidden": data.get("hidden"),
            "source": f"{label}/{path.name}",
        }
    return agents


def load_config_agents(path: Path) -> tuple[dict, dict]:
    """Return (top-level config, agents defined under the ``agent`` key)."""
    if not path.is_file():
        return {}, {}
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"{path}: invalid JSON: {error}")
        return {}, {}
    if not isinstance(config, dict):
        fail(f"{path}: top-level JSON must be an object")
        return {}, {}
    agents: dict = {}
    raw_agents = config.get("agent") or {}
    if not isinstance(raw_agents, dict):
        fail(f"{path}: 'agent' must be an object")
        return config, agents
    for name, cfg in raw_agents.items():
        if not isinstance(cfg, dict):
            fail(f"{path}: agent {name!r} must be an object")
            cfg = {}
        agents[str(name)] = {
            "name": str(name),
            "mode": cfg.get("mode"),
            "permission": cfg.get("permission") or {},
            "disable": cfg.get("disable"),
            "hidden": cfg.get("hidden"),
            "source": f"{path}#agent.{name}",
        }
    return config, agents


def is_enabled(agent: dict) -> bool:
    return not (agent.get("disable") or agent.get("hidden"))


def task_allow_list(agent: dict) -> set:
    """Extract the per-agent allows from an orchestrator ``permission.task`` block."""
    permission = agent.get("permission") or {}
    task = permission.get("task") if isinstance(permission, dict) else None
    allows: set = set()
    if isinstance(task, dict):
        for key, value in task.items():
            if key == "*":
                continue
            if str(value).lower() == "allow":
                allows.add(str(key))
    return allows


def denies(agent: dict, tool: str) -> bool:
    permission = agent.get("permission") or {}
    if not isinstance(permission, dict):
        return False
    value = permission.get(tool)
    return value is not None and str(value).lower() == "deny"


def is_agent_like(token: str) -> bool:
    """Heuristic: does a backtick token look like an agent name (not a skill/tool/prefix)?"""
    token = token.strip()
    if not token or any(ch in token for ch in " */\\:.()[]{}<>"):
        return False
    token = token.rstrip("*")
    if token in SHORT_AGENT_NAMES:
        return True
    return token.endswith(AGENT_SUFFIXES)


def main() -> int:
    repo_agents = load_agent_dir(REPO_DIR / "agents", "agents")
    deployed_agents = load_agent_dir(CONFIG_DIR / "agent", str(CONFIG_DIR / "agent"))
    _config, config_agents = load_config_agents(CONFIG_DIR / "opencode.json")

    # --- Orchestrator (prefer the deployed one, else the source definition) -----
    orchestrator = deployed_agents.get("orchestrator") or repo_agents.get("orchestrator")
    if orchestrator is None:
        fail("orchestrator: not found in deployed or source agents")
        orchestrator = {"permission": {}}
    allow_list = task_allow_list(orchestrator)

    # --- 1. every enabled agent must be allow-listed ---------------------------
    by_name: dict = {}
    for agents in (repo_agents, deployed_agents, config_agents):
        for name, agent in agents.items():
            by_name.setdefault(name, []).append(agent)

    for name in sorted(by_name):
        if name == "orchestrator" or name in BUILTIN_AGENTS:
            continue
        definitions = by_name[name]
        enabled = [agent for agent in definitions if is_enabled(agent)]
        if not enabled:
            continue
        # OpenCode can only spawn subagent/all agents via `task`; primary-only agents
        # are user-selected, so they are exempt from the task allow-list requirement.
        if not any(
            str(agent.get("mode") or "").lower() in ("subagent", "all")
            for agent in enabled
        ):
            continue
        if name in allow_list:
            continue
        sources = ", ".join(sorted({agent["source"] for agent in enabled}))
        modes = ",".join(
            sorted({str(agent.get("mode")) for agent in enabled if agent.get("mode")})
        )
        fail(
            f"agent {name!r} (mode={modes or '?'}) is not allow-listed in the "
            f"orchestrator's permission.task [{sources}]"
        )

    # --- 2. researcher must keep web access ------------------------------------
    researcher = (
        repo_agents.get("researcher")
        or deployed_agents.get("researcher")
        or config_agents.get("researcher")
    )
    if researcher is None:
        fail("researcher: not found in source, deployed, or config agents")
    else:
        for tool in ("webfetch", "websearch"):
            if denies(researcher, tool):
                fail(
                    f"researcher denies {tool!r} in {researcher['source']}; "
                    "the research role must keep web access"
                )

    # --- 3. every agent referenced in AGENTS.md must exist ---------------------
    agents_md = REPO_DIR / "AGENTS.md"
    if not agents_md.is_file():
        fail("AGENTS.md: not found")
    else:
        text = agents_md.read_text(encoding="utf-8")
        existing = set(by_name) | BUILTIN_AGENTS
        for token in re.findall(r"`([^`\n]+)`", text):
            if not is_agent_like(token):
                continue
            reference = token.strip().rstrip("*")
            if reference and reference not in existing:
                fail(f"AGENTS.md: references agent {reference!r} which does not exist")

    # --- Summary --------------------------------------------------------------
    checked = len([n for n in by_name if n != "orchestrator" and n not in BUILTIN_AGENTS])
    if errors:
        print("Roster check FAILED")
        for message in errors:
            print(f"- {message}")
        print(
            f"Checked {checked} agents against {len(allow_list)} task allows; "
            f"orchestrator: {orchestrator.get('source', '?')}"
        )
        return 1

    print(
        f"Roster check PASS: {checked} agents, {len(allow_list)} task allows; "
        f"orchestrator: {orchestrator.get('source', '?')}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
