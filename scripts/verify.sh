#!/usr/bin/env bash
# verify.sh - checks the pushed commit: lint, typecheck, vitest, production build of the container
# and the acceptance run (npm run test:abnahme) against it. Writes verify/<sha>.json and .md.
# Exit 0 only if everything is green; 1 = a check failed; 2 = precondition (dirty tree, not pushed).
# Usage: scripts/verify.sh [--schnell]   (--schnell skips container build and acceptance)
set -uo pipefail

SCHNELL=0
for arg in "$@"; do
  case "$arg" in
    --schnell) SCHNELL=1 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not a git repository" >&2; exit 2; }
cd "$ROOT" || exit 2

if [ -n "$(git status --porcelain)" ]; then
  echo "abort: uncommitted changes, verify only checks a committed and pushed state" >&2
  exit 2
fi
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SHA=$(git rev-parse HEAD)
git fetch --quiet origin "$BRANCH" 2>/dev/null || true
REMOTE=$(git rev-parse --verify --quiet "origin/$BRANCH") || { echo "abort: no origin/$BRANCH" >&2; exit 2; }
if [ "$SHA" != "$REMOTE" ]; then
  echo "abort: HEAD $SHA is not origin/$BRANCH ($REMOTE), push first" >&2
  exit 2
fi

OUT="$ROOT/verify"
mkdir -p "$OUT"
LOGDIR=$(mktemp -d)
COMPOSE_TIMEOUT=${VERIFY_COMPOSE_TIMEOUT:-180}
STARTED=()
RESULTS=()   # "name|command|exit|logfile"
FAILED=0

cleanup() {
  if [ "${#STARTED[@]}" -gt 0 ]; then
    timeout 120 docker compose --profile app stop "${STARTED[@]}" >/dev/null 2>&1 || true
  fi
  rm -rf "$LOGDIR"
}
trap cleanup EXIT

was_running() { docker compose --profile app ps --status running --services 2>/dev/null | grep -qx "$1"; }

run() {
  local name=$1; shift
  local log="$LOGDIR/$name.log"
  echo "== $name: $*"
  "$@" >"$log" 2>&1
  local rc=$?
  tail -n 5 "$log"
  RESULTS+=("$name|$*|$rc|$log")
  [ "$rc" -eq 0 ] || FAILED=1
  echo "== $name: exit $rc"
  return "$rc"
}

for svc in db mailpit; do was_running "$svc" || STARTED+=("$svc"); done
run db timeout "$COMPOSE_TIMEOUT" docker compose up -d --wait db mailpit

if [ "$FAILED" -eq 0 ]; then
  run lint npm run lint
  run typecheck npm run typecheck
  run vitest npm test
  if [ "$SCHNELL" -eq 0 ]; then
    was_running app || STARTED+=("migrate" "app")
    # Fresh production build; recreating the app container empties the in-process sign-in limiter.
    run build timeout 900 docker compose --profile app build --pull migrate app
    if [ "$FAILED" -eq 0 ]; then
      run container timeout "$COMPOSE_TIMEOUT" docker compose --profile app up -d --wait --force-recreate migrate app
    fi
    if [ "$FAILED" -eq 0 ]; then
      run abnahme npm run test:abnahme
    fi
  fi
fi

STATUS=green; [ "$FAILED" -eq 0 ] || STATUS=red
MODE=voll; [ "$SCHNELL" -eq 0 ] || MODE=schnell
NOW=$(date -Iseconds)
JSON="$OUT/$SHA.json"; MD="$OUT/$SHA.md"
[ "$SCHNELL" -eq 0 ] || { JSON="$OUT/$SHA.schnell.json"; MD="$OUT/$SHA.schnell.md"; }

{
  printf '{\n  "sha": "%s",\n  "branch": "%s",\n  "mode": "%s",\n  "status": "%s",\n  "date": "%s",\n  "checks": [\n' \
    "$SHA" "$BRANCH" "$MODE" "$STATUS" "$NOW"
  n=${#RESULTS[@]}; i=0
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r name cmd rc log <<<"$r"
    i=$((i + 1))
    tail_json=$(tail -n 20 "$log" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(s)))')
    cmd_json=$(printf '%s' "$cmd" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(s)))')
    sep=","; [ "$i" -lt "$n" ] || sep=""
    printf '    {"check": "%s", "command": %s, "exit": %s, "tail": %s}%s\n' "$name" "$cmd_json" "$rc" "$tail_json" "$sep"
  done
  printf '  ]\n}\n'
} >"$JSON"

{
  echo "# verify $SHA"
  echo
  echo "Branch $BRANCH, mode $MODE, $NOW: **$STATUS**"
  echo
  echo "| Check | Command | Exit |"
  echo "|---|---|---|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r name cmd rc log <<<"$r"
    echo "| $name | \`$cmd\` | $rc |"
  done
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r name cmd rc log <<<"$r"
    printf '\n## %s (exit %s)\n\n```\n' "$name" "$rc"
    tail -n 20 "$log"
    printf '```\n'
  done
} >"$MD"

echo "verify $SHA: $STATUS ($MODE) -> ${JSON#"$ROOT"/}"
[ "$FAILED" -eq 0 ] && exit 0 || exit 1
