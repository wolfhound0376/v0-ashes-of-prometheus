-- A protective spell riding on a creature, until its duration runs out or it
-- is violated. Same shape and same sweep as vtt_tokens.summon, which already
-- solved "a spell that persists on a token until a round number" for Mage
-- Hand -- a second mechanism would expire by different arithmetic.
--
-- Sanctuary and Shield of Faith. Null means unwarded, which is almost always.
alter table public.vtt_tokens add column if not exists ward jsonb;

comment on column public.vtt_tokens.ward is
  '{spell, caster_token, cast_round, expires_round} for Sanctuary / Shield of Faith. Null = unwarded. Swept when the round turns, alongside summon.';
