#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS_SOURCE="$SOURCE_DIR/agents"

TARGET_ROOT="${1:-$PWD}"
TARGET_AGENTS="$TARGET_ROOT/.opencode/agents"

if [[ ! -d "$AGENTS_SOURCE" ]]; then
  echo "Error: agents directory not found:"
  echo "  $AGENTS_SOURCE"
  exit 1
fi

mkdir -p "$TARGET_AGENTS"

found=0

for source in "$AGENTS_SOURCE"/*.md; do
  [[ -f "$source" ]] || continue

  found=1

  agent="$(basename "$source")"
  target="$TARGET_AGENTS/$agent"

  if [[ -e "$target" || -L "$target" ]]; then
    if [[ -L "$target" ]]; then
      rm "$target"
    else
      echo "Skipping $agent: target already exists and is not a symlink"
      continue
    fi
  fi

  ln -s "$source" "$target"
  echo "Linked $agent"
done

if [[ "$found" -eq 0 ]]; then
  echo "Warning: no agent files found in:"
  echo "  $AGENTS_SOURCE"
fi

echo
echo "OpenCode agents installed into:"
echo "  $TARGET_AGENTS"

