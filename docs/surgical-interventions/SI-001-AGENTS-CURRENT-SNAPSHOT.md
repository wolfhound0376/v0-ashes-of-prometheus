# SI-001 — AGENTS.md Current-State Reconciliation

## Status

`READY FOR PR`

## Preflight

- Verified current `main`: `e73551986ed942f4eb7eba37338bac20c19a1699` (merge of PR #226, Surgical Interventions).
- Open related PR: #220, `feat/persisted-roll-requests` (authoritative roll-request ledger).
- This intervention is documentation-only and does not touch the roll path.
- Original `AGENTS.md` verification marker: `claude/dice-forge-round1` @ `d40f0bc`, 2026-08-02.
- Current `main` is 410 commits ahead of that baseline.

## Demonstrated stale statements

The following statements in `AGENTS.md` are no longer safe to treat as current truth.

### 1. Verification baseline

Stale:

> Last verified against branch `claude/dice-forge-round1` @ `d40f0bc`, 2026-08-02.

Current verified baseline for this audit:

> `main` @ `e73551986ed942f4eb7eba37338bac20c19a1699`, 2026-08-26.

### 2. Test posture

Stale:

> There are no tests. No runner, no CI, no fixtures.

Current repo evidence includes multiple Node test files, including:

- `lib/__tests__/arrival.test.mjs`
- `lib/__tests__/journal-tag.test.mjs`
- `lib/__tests__/prompt-tags-documented.test.mjs`
- `lib/__tests__/speech-queue.test.mjs`
- `tests/roll-requests.test.mjs` on open PR #220

Revised guidance:

> Tests now exist, but coverage is partial and subsystem-specific. Run the narrowest relevant tests for the changed surface, then `pnpm build` and `npx tsc --noEmit` as appropriate. Do not assume a green build means type safety because Next.js build configuration may ignore TypeScript errors.

### 3. Repository route map

The August 2 route list is incomplete. Current `app/` includes at least these additional first-class routes:

- `/battle`
- `/intro`
- `/map`
- `/upload`

Agents should inspect the current `app/` tree before assuming the route inventory in an older document is exhaustive.

### 4. API surface

Since the August 2 baseline, the repository gained significant API surface, including:

- asset/media APIs
- character stage and voice APIs
- cinematics
- claim-code handling
- combat
- DM character-sheet and character APIs
- game clock
- item art
- restart campaign
- suggestions
- travel
- version reporting

The existing API table in `AGENTS.md` should therefore be treated as a historical subset until refreshed.

### 5. Data/migrations statement

The old statement that the core schema has no meaningful migration representation is now incomplete. The repository now contains a substantial `supabase/migrations/` history, including baseline schema, RLS, scene/item registries, cinematic bindings, voice support, and resolver fixes.

Safe current rule:

> Do not assume the repo alone fully represents production database state. Verify the live database before destructive or contract-changing work. However, do inspect `supabase/migrations/` and `migrations/` because the repository now contains substantial schema history and operational fixes.

### 6. Current-state section

The existing `## 9. Current state` is obsolete. It describes an unmerged Round-1 branch and lists work that has since landed or changed shape.

For surgical work, current state must be resolved from:

1. current `main` SHA,
2. current open PRs,
3. live production / Supabase when runtime truth matters,
4. then project documentation.

Do not reverse that order.

## Locked guidance retained

This audit does **not** invalidate the architectural rules that remain project invariants, including:

- canonical item resolution; do not invent loot
- facts/canon separated from narrative flavor
- per-character identity and the prohibition on the old global-seat behavior
- preserve scene-anchored campaign retrieval unless deliberately replacing it
- verify Supabase/RLS behavior against live state before changing contracts
- do not push directly to `main`
- run a collision check against current `main` and open PRs before merge

## Recommended AGENTS.md refresh

The next edit to root `AGENTS.md` should be a conservative reconciliation, not a rewrite:

1. update the verification header to current `main`
2. replace the obsolete test statement
3. add `/battle`, `/intro`, `/map`, and `/upload` to the route map
4. mark the API table as non-exhaustive or refresh it
5. revise the migration/schema warning to acknowledge the current migration history
6. replace the obsolete Round-1 `Current state` section with a short, date-stamped operational snapshot
7. add a pointer to `docs/surgical-interventions/README.md` for mandatory pre-merge collision checks

## Acceptance criteria

- stale claims are identified with repo evidence
- no runtime code changed
- no locked architecture changed
- open PR #220 remains untouched
- a future root-document refresh can be performed mechanically from this verified delta
