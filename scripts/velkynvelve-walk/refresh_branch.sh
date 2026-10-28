#!/usr/bin/env bash
# Bring one PR branch up to date with main when the only thing in the way is the walk's BUILT files.
#
# Why (Sam, 2026-10-28: "do it", after three PRs in one night — #1022, #1027, #1028 — went red for the same reason):
# every Underwalk PR commits the generated page, so each merge to main leaves the other open walk PRs conflicting
# on files nobody edits by hand. This script does what was being done by hand: merge main into the branch; if the
# only conflicts are generated files, rebuild them from the merged sources and commit. Anything else (a real
# conflict in template.html, spec.py, story.json, ...) is left alone and reported, because that needs a person.
#
# Usage: scripts/velkynvelve-walk/refresh_branch.sh <branch>     (run from the repo root, origin/main fetched)
# Exit:  0 refreshed (or nothing to do) · 3 real conflict, branch untouched · other = the script itself failed
# Never touches main. Never force-pushes: the caller pushes the new merge commit as a fast-forward.
set -euo pipefail

BR="$1"
BASE="${BASE:-origin/main}"   # what to merge in; tests point it at an older main
GENERATED=(public/velkynvelve-walk/index.html scripts/velkynvelve-walk/spec.json lib/walk-plates.json)

git checkout -q -B "$BR" "origin/$BR"
if git merge-base --is-ancestor "$BASE" HEAD; then echo "up to date: $BR already contains main"; exit 0; fi

if git merge --no-edit -q "$BASE" >/dev/null 2>&1; then
  echo "merged cleanly: $BR"
else
  mapfile -t UNMERGED < <(git diff --name-only --diff-filter=U)
  # a merge that failed with nothing to resolve (no merge base, a dirty tree, ...) is the script's failure, not a conflict
  if (( ${#UNMERGED[@]} == 0 )); then git merge --abort 2>/dev/null || true; echo "merge of main into $BR failed without conflicts"; exit 1; fi
  REAL=()
  for f in "${UNMERGED[@]}"; do
    gen=0; for g in "${GENERATED[@]}"; do [[ "$f" == "$g" ]] && gen=1; done
    (( gen )) || REAL+=("$f")
  done
  if (( ${#REAL[@]} )); then
    git merge --abort
    echo "REAL CONFLICT in $BR: ${REAL[*]}"
    printf '%s\n' "${REAL[@]}" > "${RUNNER_TEMP:-/tmp}/real-conflicts-$(echo "$BR" | tr '/' '_').txt"
    exit 3
  fi
  # only built files conflicted: take either side, the rebuild below overwrites them
  git checkout --theirs -- "${UNMERGED[@]}"
  echo "built-files-only conflict in $BR: ${UNMERGED[*]}"
fi

# rebuild from the merged sources (spec.py writes spec.json; build_walk.py writes index.html and lib/walk-plates.json)
( cd scripts/velkynvelve-walk && python spec.py > /dev/null )
python scripts/velkynvelve-walk/build_walk.py > /dev/null
git add -- "${GENERATED[@]}"

if git rev-parse -q --verify MERGE_HEAD > /dev/null; then
  git commit -q --no-edit -m "Merge main into $BR; rebuild the walk

Automatic (.github/workflows/walk-rebuild.yml): only the walk's generated files stood between this branch
and main, so they were rebuilt from the merged sources with spec.py + build_walk.py."
elif ! git diff --cached --quiet; then
  git commit -q --amend --no-edit   # a clean merge whose built files were stale: fold the rebuild into the merge
fi
echo "refreshed: $BR -> $(git rev-parse --short HEAD)"
