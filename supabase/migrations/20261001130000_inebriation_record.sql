-- Time sobers you up (Sam, 2026-10-01). The level alone is on the sheet as a
-- named condition; WHEN it was set has to live somewhere, so one nullable jsonb.
-- {"level":0-4,"since":"<iso>","since_game":<minutes>|null,
--  "hangover_until":"<iso>"|null,"hangover_until_game":<minutes>|null}
-- Rules: lib/inebriation.ts. Applied live on Sam's "go ahead". Null for everyone today.
alter table characters add column if not exists inebriation jsonb;
comment on column characters.inebriation is
  'Inebriation clock: {level, since, since_game, hangover_until, hangover_until_game}. Each level wears off after an hour without a drink (game clock if running, else real time). Written by app/api/alchemy/quaff; decayed on read by app/api/alchemy/pack.';
