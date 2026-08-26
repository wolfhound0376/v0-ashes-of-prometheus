# Surgical Interventions Queue

Status values: `INTAKE`, `PREFLIGHT`, `DIAGNOSING`, `PATCHING`, `VERIFYING`, `READY FOR PR`, `BLOCKED`, `MERGED`.

| ID | Area | Intervention | Status | Owner lane | Collision notes |
|---|---|---|---|---|---|
| SI-001 | Project hygiene | Refresh stale `AGENTS.md` verification metadata and reconcile it with current `main` without changing locked architecture | MERGED | ChatGPT/OpenAI | PR #227 merged to `main` @ `a3b52f36`; verified delta recorded in `SI-001-AGENTS-CURRENT-SNAPSHOT.md` |
| SI-002 | Inventory icons | Audit remaining unresolved inventory/equipment icon mappings and repair only demonstrated resolver/catalog gaps | READY FOR PR | ChatGPT/OpenAI | No open inventory PR; fixes dead-URL fallback + legacy EquipmentSlots raw image path; production DB counts deferred because connected Supabase project is not AoP production |
| SI-003 | Roll path | Review PR #220 for collision/regression risk against current `main`; do not duplicate its implementation | INTAKE | ChatGPT/OpenAI review | PR #220 owns authoritative roll-request ledger |

## Queue rules

- New work gets the next `SI-###` identifier.
- One intervention = one branch = one PR.
- Do not promote an item to `PATCHING` until preflight identifies current `main` and related open PRs.
- If an intervention expands beyond surgical qualification, mark it `BLOCKED — ESCALATE` and hand it to the sustained implementation lane.
- Completed interventions remain in this file as a lightweight audit trail.
