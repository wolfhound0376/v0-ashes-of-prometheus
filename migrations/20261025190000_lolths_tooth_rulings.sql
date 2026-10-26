-- Lolth's Tooth: Sam's rulings of 2026-10-25 (The Drow Surgeon). Data only, no schema change.
--   * its venom puts the target to sleep and does no damage / no poison damage
--   * the spider-sense glows brighter the nearer the spiders; the wielder's player says so in their own voice
-- Paste into the SQL Editor: https://supabase.com/dashboard/project/ppadxmvvvxmnnejeaoer/sql/new
update items set properties = (properties - 'spider_sense_ft')
  || '{"reservoir":{"doses":3,"poison":"lolths-tooth-venom","save":"CON","dc":13,"on_fail":"unconscious (asleep) 1 hour; wakes if it takes damage or is shaken awake","damage":"none — the venom does no damage of its own","ruling_by":"Sam 2026-10-25"}}'::jsonb
  || '{"spider_sense":{"range_ft":60,"glow":"eerie orange, brighter the nearer the spiders","narration":"the wielder notices and says it in their own voice","ruling_by":"Sam 2026-10-25"}}'::jsonb
where slug = 'lolths-tooth'
returning slug, properties->'reservoir' as reservoir, properties->'spider_sense' as spider_sense;
