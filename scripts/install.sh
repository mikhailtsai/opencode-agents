#!/usr/bin/env bash
#
# install.sh — install this repository as the global OpenCode v2 configuration.
#
# The repository is the single source of truth: every installed path is a symlink
# back into the repository. Editing the repo and restarting OpenCode is therefore
# the only way the global config changes.
#
# Usage:
#   scripts/install.sh            # install / repair the symlinks (idempotent)
#   scripts/install.sh --check    # verify only, never write; non-zero on drift
#   scripts/install.sh --dry-run  # print what would happen, change nothing
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"

MODE="install"
for arg in "$@"; do
  case "$arg" in
    --check)   MODE="check" ;;
    --dry-run) [ "$MODE" = "install" ] && MODE="dry-run" ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "install.sh: unknown option: $arg" >&2
      echo "usage: install.sh [--check|--dry-run]" >&2
      exit 2
      ;;
  esac
done

BACKUP_DIR=""
DRIFT=0
N_OK=0
N_CREATED=0
N_REPLACED=0
N_SKIPPED_BACKUP=0

say()  { printf '%s\n' "$*"; }
step() { printf '\n== %s\n' "$*"; }

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

is_correct_link() {  # path target
  [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]
}

make_backup_dir() {
  [ -n "$BACKUP_DIR" ] && return 0
  local base="$CONF/backups/$(date +%Y%m%d-%H%M%S)"
  local candidate="$base" n=2
  while [ -e "$candidate" ]; do
    candidate="${base}-${n}"
    n=$((n + 1))
  done
  BACKUP_DIR="$candidate"
  mkdir -p "$BACKUP_DIR"
}

# Back up a real file/dir into $CONF/backups/<timestamp>/, then leave the source
# gone so the symlink can take its place. Symlinks are never backed up — they
# are cheap to recreate and carry no user data.
backup_path() {  # path
  local p="$1"
  if [ -L "$p" ]; then
    N_SKIPPED_BACKUP=$((N_SKIPPED_BACKUP + 1))
    return 0
  fi
  [ -e "$p" ] || return 0

  local rel="${p#"$CONF"/}"
  if [ "$MODE" = "dry-run" ]; then
    say "  would back up  $p  ->  $CONF/backups/<timestamp>/$rel"
    return 0
  fi
  make_backup_dir
  mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
  mv "$p" "$BACKUP_DIR/$rel"
  say "  backed up      $p  ->  $BACKUP_DIR/$rel"
}

# Remove an existing path (real or symlink) so a symlink can be created.
remove_path() {  # path
  local p="$1"
  [ -e "$p" ] || [ -L "$p" ] || return 0
  if [ -L "$p" ] || [ -f "$p" ]; then
    rm -f "$p"
  else
    rm -rf "$p"
  fi
}

# Install one symlink. Idempotent: a correct existing link is left alone.
install_link() {  # label source target
  local label="$1" src="$2" dst="$3"

  if [ ! -e "$src" ]; then
    say "  MISSING SOURCE $src (repository incomplete?)" >&2
    DRIFT=$((DRIFT + 1))
    return 1
  fi

  if is_correct_link "$dst" "$src"; then
    say "  ok             $dst -> $src"
    N_OK=$((N_OK + 1))
    return 0
  fi

  local existed=0
  if [ -L "$dst" ] || [ -e "$dst" ]; then existed=1; fi

  if [ "$MODE" = "check" ]; then
    if [ "$existed" = 1 ]; then
      say "  DRIFT          $dst (exists but is not -> $src)"
    else
      say "  DRIFT          $dst (missing; should be -> $src)"
    fi
    DRIFT=$((DRIFT + 1))
    return 0
  fi

  if [ "$MODE" = "dry-run" ]; then
    if [ "$existed" = 1 ]; then
      say "  would replace  $dst -> $src"
      backup_path "$dst"
    else
      say "  would create   $dst -> $src"
    fi
    return 0
  fi

  # real install
  mkdir -p "$(dirname "$dst")"
  if [ "$existed" = 1 ]; then
    backup_path "$dst"
    remove_path "$dst"
    say "  replaced       $dst -> $src"
    N_REPLACED=$((N_REPLACED + 1))
  else
    say "  created        $dst -> $src"
    N_CREATED=$((N_CREATED + 1))
  fi
  ln -s "$src" "$dst"
  return 0
}

# ---------------------------------------------------------------------------
# secrets
# ---------------------------------------------------------------------------

check_secrets() {
  local missing=()
  [ -f "$CONF/secrets/grafana-bearer" ]         || missing+=("grafana-bearer")
  [ -f "$CONF/secrets/grafana-sa-token" ]       || missing+=("grafana-sa-token")
  if [ "${#missing[@]}" -eq 0 ]; then
    return 0
  fi

  say ""
  say "!! WARNING: missing secret file(s): ${missing[*]}"
  say "   The canonical config references:"
  say "     mcp.servers.grafana.headers.Authorization            -> {file:$CONF/secrets/grafana-bearer}"
  say "     mcp.servers.grafana.headers.X-Grafana-Service-Account-Token -> {file:$CONF/secrets/grafana-sa-token}"
  say "   If the live config still holds the values inline, migrate them first"
  say "   (BEFORE install.sh symlinks the config):"
  say "     $REPO/scripts/migrate-secrets.sh"
  say "   Otherwise create them by hand — the token file holds the raw value, no 'Bearer ' prefix:"
  say "     mkdir -p \"$CONF/secrets\" && chmod 700 \"$CONF/secrets\""
  say "     echo -n '<grafana-bearer-token>'  > \"$CONF/secrets/grafana-bearer\""
  say "     echo -n '<grafana-service-account-token>' > \"$CONF/secrets/grafana-sa-token\""
  say "     chmod 600 \"$CONF/secrets/grafana-bearer\" \"$CONF/secrets/grafana-sa-token\""
  say "   Or link an existing file elsewhere:"
  say "     ln -s /path/to/grafana-bearer       \"$CONF/secrets/grafana-bearer\""
  say "     ln -s /path/to/grafana-sa-token     \"$CONF/secrets/grafana-sa-token\""
  return 1
}

# ---------------------------------------------------------------------------
# preflight
# ---------------------------------------------------------------------------

step "OpenCode global config installer"
say "  repo: $REPO"
say "  conf: $CONF"
say "  mode: $MODE"

if [ "$REPO" = "$CONF" ]; then
  echo "install.sh: repo and conf resolve to the same path; refusing to symlink a directory onto itself" >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# install targets
# ---------------------------------------------------------------------------

step "Symlinks"

# Directory symlink: agent/ -> agents/
install_link "agent"      "$REPO/agents"                       "$CONF/agent"          || true

# File symlinks: config, instructions.
install_link "config"     "$REPO/config/opencode.json"         "$CONF/opencode.json"  || true
install_link "instructions" "$REPO/AGENTS.md"                  "$CONF/AGENTS.md"      || true

# Plugin: the FILE form, because a symlinked plugin *directory* is not followed.
# Remove the legacy directory form first (backed up if it is a real directory).
LEGACY_PLUGIN_DIR="$CONF/plugins/agent-models"
if [ -L "$LEGACY_PLUGIN_DIR" ] || [ -e "$LEGACY_PLUGIN_DIR" ]; then
  if [ "$MODE" = "check" ]; then
    say "  DRIFT          $LEGACY_PLUGIN_DIR (legacy plugin directory; should be removed)"
    DRIFT=$((DRIFT + 1))
  elif [ "$MODE" = "dry-run" ]; then
    say "  would remove   $LEGACY_PLUGIN_DIR (legacy plugin directory)"
    backup_path "$LEGACY_PLUGIN_DIR"
  else
    backup_path "$LEGACY_PLUGIN_DIR"
    remove_path "$LEGACY_PLUGIN_DIR"
    say "  removed        $LEGACY_PLUGIN_DIR (legacy plugin directory)"
  fi
fi
install_link "plugin"     "$REPO/plugins/agent-models/index.ts" "$CONF/plugins/agent-models.ts" || true

# Workflow skills.
for s in debug plan review-loop verify; do
  install_link "skill:$s" "$REPO/.opencode/skills/$s" "$CONF/skills/$s" || true
done

# ---------------------------------------------------------------------------
# summary
# ---------------------------------------------------------------------------

step "Summary"
if [ "$MODE" = "check" ]; then
  check_secrets || DRIFT=$((DRIFT + 1))
  say "  $N_OK link(s) correct, $DRIFT drift(s) detected."
  if [ "$DRIFT" -gt 0 ]; then
    say "  Run '$REPO/scripts/install.sh' to fix."
    exit 1
  fi
  say "  Everything is installed."
  exit 0
fi

if [ "$MODE" = "dry-run" ]; then
  say "  dry run only — nothing was written."
  check_secrets || true
  if [ "$DRIFT" -gt 0 ]; then
    exit 1
  fi
  exit 0
fi

say "  created:  $N_CREATED"
say "  replaced: $N_REPLACED"
say "  already correct: $N_OK"
if [ -n "$BACKUP_DIR" ]; then
  say "  backups:  $BACKUP_DIR"
else
  say "  backups:  none needed"
fi
check_secrets || true

if [ "$DRIFT" -gt 0 ]; then
  say "  $DRIFT problem(s) detected — see the warnings above."
  exit 1
fi

step "Restart required"
say "  OpenCode must be restarted after config changes: on Linux the file-watcher"
say "  backend is unavailable, so an already-used config directory does not pick up"
say "  edits. The exception is per-subagent model overrides, which are re-read on"
say "  every subagent launch."
