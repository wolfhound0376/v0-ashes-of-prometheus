-- NOT YET APPLIED. Apply AFTER the code that retires the PR 819 vocabulary is live on main (the branch that
-- carries this file); applying it first would make main's old /api/party/situation writes fail until then.
--
-- Sam's decision (2026-10-25): keep the PR 832 vocabulary for party_situation — node_key, sub_location,
-- sub_label, stance, ward_active, gate_state, party_present, updated_by — and retire PR 819's. The thirteen
-- columns below were added on 2026-10-25 ~01:08 UTC (migrations/20261025010800_party_situation_reconcile_main_columns.sql)
-- only so main's then-deployed code could write while the two shapes coexisted. Nothing reads them once
-- that code is gone. The node_key default went in for the same reason (main's upsert never sent one) and
-- goes with them: every remaining writer supplies node_key.
--
-- Reversible in the sense that the reconcile migration can be pasted again; the values in these columns are
-- the walk's moment-to-moment account and are rewritten on the next plate change anyway.

alter table public.party_situation
  drop column if exists source,
  drop column if exists place,
  drop column if exists area_key,
  drop column if exists area_no,
  drop column if exists area_name,
  drop column if exists activity,
  drop column if exists talking_to,
  drop column if exists leader,
  drop column if exists party,
  drop column if exists company,
  drop column if exists nearby,
  drop column if exists flags,
  drop column if exists note;

alter table public.party_situation alter column node_key drop default;
