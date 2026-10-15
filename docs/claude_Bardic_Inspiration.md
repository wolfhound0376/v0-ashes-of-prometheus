# Bardic Inspiration — stored, restored, any holder

Sam, 2026-10-15: "start with 1 and 2" — (1) store it, so uses survive a reload and a long rest restores them; (2) let allied NPCs receive it.

## The rule
Scott's sheet cites **SRD 5.2.1** (canon since 2026-10-01). 5.2.1 is **not ingested** into `campaign_chunks`, so the 5.2.1 lines are from memory and must be checked against the book. SRD 5.1 is ingested and agrees on everything except the last two rows.

| | SRD 5.1 (ingested) | SRD 5.2.1 (canon, unverified here) |
|---|---|---|
| Cost | Bonus Action | Bonus Action |
| Target | one creature other than you, 60 ft, can hear you | 60 ft, can see or hear you |
| Held | one die at a time | one die at a time |
| Uses | CHA mod (min 1), long rest | same |
| Die | d6 / d8 at 5 / d10 at 10 / d12 at 15 | same |
| Lasts | 10 minutes | **1 hour** (used here) |
| Spent | any check/attack/save, after the d20, before the outcome | **when the holder fails** a D20 Test |

The painted map already spends the die only on a roll that would fail — that is the 5.2.1 reading, so it stays.

## Storage — SCHEMA CHANGE, NOT YET APPLIED
One jsonb column on `characters`, so any row (PC or NPC) can hold a die:

```sql
alter table public.characters
  add column if not exists sheet_resources jsonb not null default '{}'::jsonb;

-- Scott's sheet_features is empty. Add the class feature he already has (sourced: SRD Bard 1).
update public.characters
set sheet_features = coalesce(sheet_features, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
  'name', 'Bardic Inspiration',
  'source', 'Bard 1',
  'desc', 'Bonus Action: one creature within 60 ft who can hear you gains a d6 for 1 hour; when it fails an ability check, attack roll or saving throw it can add the die. Uses = CHA modifier (3), all back on a long rest.'))
where id = '88cc9dd1-b0fe-4e62-9829-f84aafe3c066'
  and not (coalesce(sheet_features, '[]'::jsonb) @> '[{"name":"Bardic Inspiration"}]');
```

Shapes:
- the bard: `{"bardic_inspiration": {"used": 1}}` — max and die are computed from `cha_modifier` and `level` every time, never stored.
- the holder: `{"inspiration_held": {"die": 6, "from_id": "…", "from_name": "Scott", "granted_at": <absolute game minutes>}}`

## Code (PR 1)
- `lib/bardic-inspiration.ts` — pure rule + tests (17).
- `app/api/bardic/route.ts` — GET state, POST grant / spend. Takes an id or a name; "Eldeth" finds "Eldeth Feldrun".
- `app/api/chat/route.ts` — the long rest zeroes `used` and drops a die past its hour.

## Finding that changes item 2
In the painted map's combat, allied NPCs **do not fight**: initiative is `party + foes`; Ront, Eldeth, Derendil and Sarith stay in `npcs` and take no turns. So an NPC can hold a die (the storage allows it) but has no roll to spend it on there. On the 3D battle board (`/battle`, `app/api/combat`) allies do take turns (`allegiance: "ally"`), but that board has no Bardic Inspiration at all. Sam to choose which surface NPCs use it on.
