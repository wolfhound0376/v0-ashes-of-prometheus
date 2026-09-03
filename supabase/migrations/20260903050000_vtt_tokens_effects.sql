-- Timed spell effects riding on a creature: Faerie Fire, Sleep's Unconscious,
-- a disguise. An ARRAY, unlike vtt_tokens.ward, because a creature can be
-- outlined and asleep at once whereas it has at most one protective ward.
--
-- Swept by the same round turn as ward and summon -- one piece of expiry
-- arithmetic for all three, so they cannot drift apart.
alter table public.vtt_tokens add column if not exists effects jsonb not null default '[]'::jsonb;

comment on column public.vtt_tokens.effects is
  'Array of {condition, spell, caster_token, cast_round, expires_round, ends_on_damage, save, save_ends}. Applied by /api/combat, swept when the round turns.';
