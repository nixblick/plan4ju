#!/usr/bin/env bash
# release-check.sh <version> - refuses to tag unless HEAD has a green full verify/<sha>.json
# (scripts/verify.sh without --schnell) and the CI run for that SHA is green. Tags v<version> if so.
# Exit 0 = tagged; 1 = refused; 2 = usage or precondition.
set -uo pipefail

VERSION=${1:-}
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: scripts/release-check.sh <x.y.z>" >&2; exit 2; }

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not a git repository" >&2; exit 2; }
cd "$ROOT" || exit 2
SHA=$(git rev-parse HEAD)
FILE="verify/$SHA.json"

if [ ! -f "$FILE" ]; then
  echo "refused: no $FILE, run scripts/verify.sh on the pushed commit first" >&2
  exit 1
fi
if ! grep -q '"status": "green"' "$FILE" || ! grep -q '"mode": "voll"' "$FILE"; then
  echo "refused: $FILE is not a green full run" >&2
  exit 1
fi

if [ "${RELEASE_CHECK_SKIP_CI:-0}" != 1 ]; then
  CI=$(gh run list --commit "$SHA" --json conclusion,status --jq '.[] | "\(.status) \(.conclusion)"' 2>&1) || {
    echo "refused: gh run list failed: $CI" >&2; exit 1; }
  [ -n "$CI" ] || { echo "refused: no CI run for $SHA" >&2; exit 1; }
  if echo "$CI" | grep -qv '^completed success$'; then
    echo "refused: CI for $SHA is not green:" >&2; echo "$CI" >&2
    exit 1
  fi
fi

if git rev-parse --verify --quiet "refs/tags/v$VERSION" >/dev/null; then
  echo "refused: tag v$VERSION exists" >&2
  exit 1
fi
git tag -a "v$VERSION" -m "Release $VERSION (verify green for $SHA)" || exit 1
echo "tagged v$VERSION at $SHA; push with: git push origin v$VERSION"
