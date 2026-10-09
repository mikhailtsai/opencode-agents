"""Provider capabilities and per-role reasoning from the selected policy.

Update capability metadata from the selected provider's catalog when changing models.
"""
import json
from pathlib import Path
import re
import yaml


def validate_policy(policy):
    if not isinstance(policy, dict):
        return ["policy must be an object"]
    errors = []
    agents, reasoning, models = (policy.get(key) for key in ("agents", "reasoning", "models"))
    if not isinstance(agents, dict) or not agents:
        return ["policy agents must be a nonempty object"]
    if not isinstance(reasoning, dict) or not isinstance(models, dict):
        return ["policy reasoning and models must be objects"]
    if not isinstance(policy.get("variant"), str) or not policy["variant"]:
        errors.append("policy variant must be a nonempty string")
    if set(agents) != set(reasoning):
        errors.append("policy reasoning must cover exactly the configured agents")
    for model, capability in models.items():
        if not isinstance(capability, dict):
            errors.append(f"{model}: capabilities must be an object")
            continue
        efforts = capability.get("efforts")
        if (not isinstance(efforts, list) or not all(isinstance(e, str) for e in efforts)
                or len(set(efforts)) != len(efforts)):
            errors.append(f"{model}: efforts must be a list of unique strings")
        for field in ("toggle", "temperature"):
            if type(capability.get(field)) is not bool:
                errors.append(f"{model}: {field} must be a boolean")
    for role, model in agents.items():
        if not isinstance(model, str) or model not in models:
            errors.append(f"{role}: model must have declared provider capabilities")
            continue
        capability = models[model]
        if not isinstance(capability, dict):
            continue
        setting = reasoning.get(role)
        if setting is None:
            continue  # No known override: leave reasoning to the provider/server.
        if not isinstance(setting, dict) or len(setting) != 1:
            errors.append(f"{role}: reasoning must be null or a single effort/enabled setting")
        elif "effort" in setting:
            efforts = capability.get("efforts", [])
            if not isinstance(efforts, list) or setting["effort"] not in efforts:
                errors.append(f"{role}: unsupported effort {setting['effort']!r} for {model}")
        elif "enabled" in setting:
            if capability.get("toggle") is not True or type(setting["enabled"]) is not bool:
                errors.append(f"{role}: unsupported reasoning toggle for {model}")
        else:
            errors.append(f"{role}: reasoning must use effort or enabled")
    return errors


def load_policy(path):
    policy = json.loads(Path(path).read_text(encoding="utf-8"))
    errors = validate_policy(policy)
    if errors:
        raise ValueError("; ".join(errors))
    return policy


def read_agent(path):
    text = Path(path).read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---(?:\n|\Z)", text, re.DOTALL)
    if not match:
        raise ValueError(f"{path}: missing or unterminated frontmatter")
    data = yaml.safe_load(match.group(1))
    if not isinstance(data, dict):
        raise ValueError(f"{path}: frontmatter must be an object")
    return data, text[match.end():]


def configured_agent(data, role, policy):
    data = dict(data)
    model = policy["agents"][role]
    data["model"] = model
    for key in ("variant", "reasoning", "reasoningEffort"):
        data.pop(key, None)
    options = data.get("options", {})
    if not isinstance(options, dict):
        raise ValueError(f"{role}: options must be an object")
    options = dict(options)
    for key in ("reasoning", "reasoningEffort"):
        options.pop(key, None)
    if policy["reasoning"][role] is not None:
        options["reasoning"] = dict(policy["reasoning"][role])
    if not policy["models"][model]["temperature"]:
        data.pop("temperature", None)
        options.pop("temperature", None)
    if options:
        data["options"] = options
    else:
        data.pop("options", None)
    return data


def agent_policy_errors(data, role, policy):
    expected = configured_agent(data, role, policy)
    return [f"{role}: {key} does not match model/reasoning policy"
            for key in ("model", "options", "variant", "reasoning", "reasoningEffort", "temperature")
            if data.get(key) != expected.get(key)]


def apply_policy(directory, policy):
    paths = {path.stem: path for path in Path(directory).glob("*.md")}
    missing = set(policy["agents"]) - paths.keys()
    if missing:
        raise ValueError(f"missing agents: {', '.join(sorted(missing))}")
    changes = []
    # Parse and validate every managed agent before writing any files.
    for role in sorted(policy["agents"]):
        path = paths[role]
        data, body = read_agent(path)
        updated = configured_agent(data, role, policy)
        if updated != data:
            header = yaml.safe_dump(updated, sort_keys=False, allow_unicode=True).rstrip()
            changes.append((path, f"---\n{header}\n---\n{body}"))
    for path, text in changes:
        path.write_text(text, encoding="utf-8")
    return len(changes)
