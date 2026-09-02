-- Summoned tokens - Mage Hand first.
--
-- A spectral hand is a token: it has a square, it can be looked at, it can be
-- in the way. But it is not a creature. It has no hit points, no initiative,
-- and it acts only when its caster spends an action on it. This column says
-- which tokens are effects rather than bodies, who cast them, and when they
-- end, so the route can run the spell's own rules (the 30 ft leash, the
-- 1-minute duration, "vanishes if you cast this spell again") and the HUD
-- can draw the hand as a chip on its caster rather than a seat of its own.
--
-- NULL for every ordinary token. Shape, see lib/summons.ts:
--   { spell, caster_token, character_id, cast_round, expires_round }
alter table public.vtt_tokens
  add column if not exists summon jsonb;

comment on column public.vtt_tokens.summon is
  'Set when the token is a spell effect (Mage Hand) rather than a creature: {spell, caster_token, character_id, cast_round, expires_round}. See lib/summons.ts. NULL for bodies.';
