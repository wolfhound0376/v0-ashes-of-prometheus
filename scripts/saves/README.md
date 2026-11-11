# Saved-games round trip (local Postgres only)

Proves `migrations/20261110230000_campaign_saves.sql` without touching the live database.

- `stub_schema.sql` — the live schema's columns, keys and foreign keys for every table a save touches (pulled 2026-11-10),
  plus stand-in triggers that refuse loudly, so a restore that forgets to quiet a trigger fails.
- `roundtrip.sql` — builds a world, saves it as Game A, plays on, starts a New Game (Game B), refuses a load while the
  table is live, loads A and checks what came back (and that art and voice did NOT roll back), loads B, and checks the
  triggers are back on.

```
createdb t && psql -d t -f stub_schema.sql -f ../../migrations/20261110230000_campaign_saves.sql -f roundtrip.sql
```
