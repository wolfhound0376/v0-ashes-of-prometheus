-- Stage transitions, rule 4: "the table moves together".
-- One shared record of which place the party is looking at. Written by /api/stage (service role),
-- read by every browser through the existing realtime publication on `sessions` (already published).
-- Paste into the Supabase SQL editor. Safe to re-run.
alter table public.sessions add column if not exists stage jsonb;
comment on column public.sessions.stage is 'Stage record {mode, by, at, caption}: the place the table is looking at. See lib/stage.ts.';
