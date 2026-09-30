#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_SOURCE="$SOURCE_DIR/agents"
SKILLS_SOURCE="$SOURCE_DIR/.opencode/skills"

TARGET_ROOT="${1:-$PWD}"
MODE="${2:-normal}"

case "$MODE" in
  normal) POLICY_SOURCE="$SOURCE_DIR/model-policy.json" ;;
  cheap)  POLICY_SOURCE="$SOURCE_DIR/model-policy.cheap.json" ;;
  local)  POLICY_SOURCE="$SOURCE_DIR/model-policy.local.json" ;;
  *)
    echo "Error: unknown install mode '$MODE' (expected 'normal', 'cheap', or 'local')" >&2
    exit 1
    ;;
esac

TARGET_OPENCODE="$TARGET_ROOT/.opencode"
TARGET_AGENTS="$TARGET_OPENCODE/agents"
TARGET_SKILLS="$TARGET_OPENCODE/skills"

if [[ ! -d "$AGENTS_SOURCE" ]]; then
  echo "Error: agents directory not found:"
  echo "  $AGENTS_SOURCE"
  exit 1
fi
if [[ ! -f "$POLICY_SOURCE" ]]; then
  echo "Error: model policy not found:"
  echo "  $POLICY_SOURCE"
  exit 1
fi
if [[ ! -d "$TARGET_ROOT" ]]; then
  echo "Error: target is not a directory:"
  echo "  $TARGET_ROOT"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required to install and validate the workflow" >&2
  exit 1
fi

# Managed agent/skill/script files are replaced; project-owned docs and state are preserved.
replace_file() {
  local source="$1" target="$2" label="$3"
  mkdir -p "$(dirname "$target")"
  rm -rf "$target"
  cp "$source" "$target"
  echo "Installed $label"
}

replace_dir() {
  local source="$1" target="$2" label="$3"
  mkdir -p "$(dirname "$target")"
  rm -rf "$target"
  cp -R "$source" "$target"
  echo "Installed $label"
}

copy_if_absent() {
  local source="$1" target="$2" label="$3"
  if [[ -e "$target" ]]; then
    echo "Skipping $label: target already exists"
    return
  fi
  mkdir -p "$(dirname "$target")"
  cp "$source" "$target"
  echo "Copied $label"
}

mkdir -p "$TARGET_AGENTS"

found=0
for source in "$AGENTS_SOURCE"/*.md; do
  [[ -f "$source" ]] || continue
  found=1
  agent="$(basename "$source")"
  replace_file "$source" "$TARGET_AGENTS/$agent" "agent $agent"
done

if [[ "$found" -eq 0 ]]; then
  echo "Warning: no agent files found in:"
  echo "  $AGENTS_SOURCE"
fi

if [[ -d "$SKILLS_SOURCE" ]]; then
  for source in "$SKILLS_SOURCE"/*/; do
    [[ -d "$source" ]] || continue
    skill="$(basename "$source")"
    replace_dir "${source%/}" "$TARGET_SKILLS/$skill" "skill $skill"
  done
fi

replace_file "$POLICY_SOURCE" "$TARGET_ROOT/model-policy.json" "model-policy.json ($MODE)"
python3 "$SOURCE_DIR/scripts/apply-model-policy.py" "$TARGET_AGENTS" "$TARGET_ROOT/model-policy.json"

for script in check-harness.py eval-report.py eval_schema.py codeburn_state.py apply-model-policy.py merge-agents-md.py; do
  replace_file "$SOURCE_DIR/scripts/$script" "$TARGET_ROOT/scripts/$script" "script $script"
done

copy_if_absent "$SOURCE_DIR/.opencode-evals/README.md" "$TARGET_ROOT/.opencode-evals/README.md" "eval journal README"
copy_if_absent "$SOURCE_DIR/.opencode-evals/codeburn-state.json" "$TARGET_ROOT/.opencode-evals/codeburn-state.json" "codeburn state"
touch "$TARGET_ROOT/.opencode-evals/runs.jsonl"

copy_if_absent "$SOURCE_DIR/docs/agent/README.md" "$TARGET_ROOT/docs/agent/README.md" "docs/agent README"
python3 "$SOURCE_DIR/scripts/merge-agents-md.py" "$SOURCE_DIR/AGENTS.md" "$TARGET_ROOT/AGENTS.md"
mkdir -p "$TARGET_ROOT/docs/exec-plans/active" "$TARGET_ROOT/docs/exec-plans/completed"

echo
echo "OpenCode workflow installed ($MODE) into:"
echo "  $TARGET_AGENTS"
echo "  $TARGET_SKILLS"
