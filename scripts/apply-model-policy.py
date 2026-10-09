#!/usr/bin/env python3
"""Apply the selected model, reasoning, and temperature policy to agents."""
import sys
import yaml
from model_policy import apply_policy, load_policy


def main():
    if len(sys.argv) != 3:
        print("usage: apply-model-policy.py <agents_dir> <policy.json>", file=sys.stderr)
        return 2
    try:
        policy = load_policy(sys.argv[2])
        count = apply_policy(sys.argv[1], policy)
    except (OSError, ValueError, yaml.YAMLError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print(f"Applied '{policy['variant']}' model/reasoning policy to {count} agent file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
