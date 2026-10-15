#!/usr/bin/env bash
#
# migrate-secrets.sh — one-shot migration of the Grafana secrets out of the live
# OpenCode config into the secret files the canonical config references.
#
# The canonical config (config/opencode.json in this repo) reads the Grafana
# credentials from:
#   $CONF/secrets/grafana-bearer
#   $CONF/secrets/grafana-sa-token
#
# This script reads the values that are still inline in the *live* config and
# writes them to those files. It must run BEFORE scripts/install.sh, because
# install.sh replaces the live config with a symlink to the canonical config
# (which already contains only {file:...} refs).
#
# Secret values are never printed — only byte lengths.
#
# Usage:
#   scripts/migrate-secrets.sh [--force]
#
set -euo pipefail

CONF="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
CONFIG="$CONF/opencode.json"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "migrate-secrets.sh: unknown option: $arg" >&2
      echo "usage: migrate-secrets.sh [--force]" >&2
      exit 2
      ;;
  esac
done

if [ ! -e "$CONFIG" ]; then
  echo "migrate-secrets.sh: error: $CONFIG not found" >&2
  exit 1
fi

# The whole migration runs in Python so secret values never touch argv or stdout.
CONF="$CONF" CONFIG="$CONFIG" FORCE="$FORCE" python3 - <<'PY'
import json
import os
import sys

conf = os.environ["CONF"]
config_path = os.environ["CONFIG"]
force = os.environ["FORCE"] == "1"
secrets_dir = os.path.join(conf, "secrets")

try:
    with open(config_path, encoding="utf-8") as fh:
        data = json.load(fh)
except Exception as exc:  # noqa: BLE001 - report and abort
    print(f"migrate-secrets.sh: error: cannot read {config_path}: {exc}", file=sys.stderr)
    sys.exit(1)

headers = ((data.get("mcp") or {}).get("servers") or {}).get("grafana") or {}
headers = headers.get("headers") or {}

bearer_raw = headers.get("Authorization")
sa_raw = headers.get("X-Grafana-Service-Account-Token")


def is_file_ref(value):
    return isinstance(value, str) and "{file:" in value


if bearer_raw is None and sa_raw is None:
    print(
        f"migrate-secrets.sh: error: no grafana Authorization / "
        f"X-Grafana-Service-Account-Token headers in {config_path}",
        file=sys.stderr,
    )
    print(
        "  Nothing to migrate. The config may already use {file:...} refs, "
        "or grafana is not configured here.",
        file=sys.stderr,
    )
    sys.exit(1)

refs = [
    name
    for name, value in (
        ("Authorization", bearer_raw),
        ("X-Grafana-Service-Account-Token", sa_raw),
    )
    if is_file_ref(value)
]
if refs:
    print(
        "migrate-secrets.sh: error: already migrated — these values are {file:...} refs: "
        + ", ".join(refs),
        file=sys.stderr,
    )
    print(
        "  This script only works on the live config with inline values, before "
        "scripts/install.sh symlinks it.",
        file=sys.stderr,
    )
    sys.exit(2)

if bearer_raw is None:
    print("migrate-secrets.sh: error: grafana Authorization header missing", file=sys.stderr)
    sys.exit(1)
if sa_raw is None:
    print(
        "migrate-secrets.sh: error: grafana X-Grafana-Service-Account-Token header missing",
        file=sys.stderr,
    )
    sys.exit(1)

if not isinstance(bearer_raw, str) or not bearer_raw.startswith("Bearer "):
    print(
        "migrate-secrets.sh: error: Authorization header does not start with 'Bearer '",
        file=sys.stderr,
    )
    sys.exit(1)

bearer = bearer_raw[len("Bearer "):].strip()
sa_token = sa_raw.strip() if isinstance(sa_raw, str) else ""

if not bearer:
    print("migrate-secrets.sh: error: Authorization header carries an empty bearer token", file=sys.stderr)
    sys.exit(1)
if not sa_token:
    print("migrate-secrets.sh: error: service-account token is empty", file=sys.stderr)
    sys.exit(1)

targets = [("grafana-bearer", bearer), ("grafana-sa-token", sa_token)]

existing = [name for name, _ in targets if os.path.exists(os.path.join(secrets_dir, name))]
if existing and not force:
    print(
        "migrate-secrets.sh: error: refusing to overwrite existing secret file(s): "
        + ", ".join(existing),
        file=sys.stderr,
    )
    print("  Re-run with --force to overwrite.", file=sys.stderr)
    sys.exit(3)

os.makedirs(secrets_dir, mode=0o700, exist_ok=True)
try:
    os.chmod(secrets_dir, 0o700)
except OSError:
    pass

for name, value in targets:
    path = os.path.join(secrets_dir, name)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(value)
    os.chmod(path, 0o600)
    print(f"wrote {path} ({len(value)} bytes, mode 600)")

print("migration complete — the {file:...} refs in config/opencode.json now resolve.")
PY

echo
echo "Next: run scripts/install.sh from the repository to symlink the config into place."
