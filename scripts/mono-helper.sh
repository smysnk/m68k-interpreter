#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"

LOCAL_MONO_HELPER_CANDIDATES="
${SCRIPT_DIR}/../../../../mono-helper/mono-helper
${SCRIPT_DIR}/../../../mono-helper/mono-helper
${SCRIPT_DIR}/../../mono-helper/mono-helper
"

set -a
[ -f "${REPO_DIR}/.env" ] && . "${REPO_DIR}/.env"
[ -f "${REPO_DIR}/.env.local" ] && . "${REPO_DIR}/.env.local"
set +a

for candidate in ${LOCAL_MONO_HELPER_CANDIDATES}; do
  if [ -x "${candidate}" ]; then
    exec "${candidate}" "$@"
  fi
done

if command -v mono-helper >/dev/null 2>&1; then
  exec mono-helper "$@"
fi

echo "mono-helper not found. Expected a local mono-helper checkout or a mono-helper binary in PATH." >&2
exit 1
