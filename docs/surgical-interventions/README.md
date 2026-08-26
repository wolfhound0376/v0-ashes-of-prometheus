# Ashes of Prometheus — Surgical Interventions

A focused maintenance subproject for small, high-confidence changes to Ashes of Prometheus.

The purpose is to fix, verify, or harden one narrow thing at a time without dragging a large coding agent across the whole repository or colliding with parallel feature work.

## Operating model

### ChatGPT / OpenAI lane — surgical lead

Default here when the task is primarily diagnosis, coordination, verification, review, or a tightly bounded patch.

Best fits:

- inspect current `main`, active PRs, and nearby code before work starts
- isolate the smallest failing surface
- repo archaeology and cross-system reasoning
- PR collision and regression-risk review
- narrow TypeScript / React / Next.js fixes
- narrow Supabase SQL, RLS, resolver, or migration corrections
- data-integrity audits
- targeted tests and reproduction cases
- reviewing another agent's diff before merge
- production-vs-repo discrepancy diagnosis
- turning a vague bug into an exact implementation brief

### Claude lane — sustained implementation

Default here when a task benefits from keeping a large code surface in context for an extended implementation pass.

Best fits:

- broad multi-file feature construction
- large UI flows or subsystem additions
- long refactors spanning several modules
- major work inside the DM/game-engine path
- large schema + application changes that must evolve together
- implementation sessions where many files need to be read and edited repeatedly

This is a routing policy, not a claim that either model is incapable of the other lane. The goal is lower context cost, fewer collisions, and clearer ownership.

## Surgical qualification

A task belongs here when most of the following are true:

1. One clearly stated defect, gap, or verification target.
2. One subsystem or a tightly coupled pair.
3. Normally six or fewer production files changed.
4. No architectural redesign is required.
5. Acceptance criteria can be stated before editing.
6. Verification can be completed in the same intervention.
7. The change can ship as one independent PR.

Escalate out of Surgical Interventions when the task crosses multiple architectural layers, requires a broad refactor, or cannot be safely understood without loading a large percentage of the repository.

## Mandatory preflight

Every intervention must do this before editing:

1. Resolve the current SHA of `main`.
2. Read the currently open PR list.
3. Inspect changed files in any PR touching the same subsystem.
4. Confirm the intervention branch starts from current `main`.
5. Record explicit acceptance criteria.
6. Identify the minimum file set that should need modification.

**No intervention may be merged based on an earlier collision check.** The open-PR and `main` check must be repeated immediately before merge.

## Intervention lifecycle

`INTAKE → PREFLIGHT → DIAGNOSE → PATCH → VERIFY → COLLISION CHECK → PR → MERGE → POST-MERGE CHECK`

### INTAKE

Write the symptom and desired outcome in plain language. Do not start with a proposed code solution unless the root cause is already demonstrated.

### PREFLIGHT

Capture:

- current `main` SHA
- active related PRs
- suspected subsystem
- protected/locked behavior that must not change
- acceptance criteria

### DIAGNOSE

Read only the files needed to establish the actual cause. Expand scope only when evidence requires it.

### PATCH

Prefer the smallest change that fixes the cause rather than masking the symptom. Avoid opportunistic cleanup.

### VERIFY

Run the narrowest meaningful verification first, then the repository checks appropriate to the changed surface. A green Next.js build alone is not sufficient when TypeScript errors are ignored by build configuration.

### COLLISION CHECK

Immediately before merge:

- fetch current `main` again
- fetch open PRs again
- compare changed paths and logical ownership
- confirm the branch is not based on stale assumptions
- update/retest if `main` moved in a relevant way

### PR

The PR must state:

- symptom/root cause
- exact scope
- changed files
- verification evidence
- collision check result
- known follow-ups explicitly excluded from scope

### POST-MERGE CHECK

Verify the merged state, and when applicable verify production behavior independently rather than assuming deployment success from the merge alone.

## Hard boundaries

- Never push a surgical fix directly to `main`.
- Never bundle an unrelated cleanup into the same intervention.
- Never modify a database contract without checking all known consumers.
- Never weaken RLS or authorization merely to make a failing request work.
- Never change locked campaign/rules behavior as an incidental bug fix.
- Never trust a PR description as proof of runtime behavior when the live database or production app can be checked directly.
- Never merge without repeating the current-`main` and open-PR collision check.

## Naming

Branches:

- `surgery/<area>-<short-problem>`

Examples:

- `surgery/inventory-journal-icon`
- `surgery/dice-double-submit`
- `surgery/npc-voice-fallback`

Interventions:

- `SI-001`, `SI-002`, ...

Use `QUEUE.md` for status and `INTERVENTION_TEMPLATE.md` for each new case.
