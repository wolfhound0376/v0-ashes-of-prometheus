# SI-### — <Short intervention title>

## Intake

**Symptom:**

**Desired outcome:**

**Why this is surgical:**

## Preflight

- Current `main` SHA:
- Checked at:
- Related open PRs:
- Suspected subsystem:
- Locked behavior that must not change:
- Minimum expected file set:

## Acceptance criteria

- [ ]
- [ ]
- [ ]

## Diagnosis

**Root cause:**

**Evidence:**

**Files inspected:**

## Patch

**Branch:** `surgery/<area>-<problem>`

**Files changed:**

**What changed:**

**Explicitly out of scope:**

## Verification

- [ ] Focused reproduction/test passes
- [ ] Relevant automated tests pass
- [ ] `pnpm build` passes when relevant
- [ ] `npx tsc --noEmit` checked when TypeScript is touched
- [ ] Database/RLS behavior checked when relevant
- [ ] Live behavior checked when relevant and safe

Evidence:

## Mandatory pre-merge collision check

- [ ] Re-resolved current `main` SHA
- [ ] Re-read open PRs
- [ ] Compared overlapping files/subsystems
- [ ] Branch updated/retested if relevant `main` changes occurred
- [ ] No unresolved collision remains

Current `main` at final check:

Collision notes:

## PR / merge

PR:

Merged commit:

## Post-merge

Production/live verification:

Follow-ups:
