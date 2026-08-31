# AGENTS.md — Ashes of Prometheus

Onboarding for coding agents (Codex, Claude, anyone new). Read this before touching code.
Last verified against branch `claude/dice-forge-round1` @ `d40f0bc`, 2026-08-02.

---

## 0. What this actually is

Not a D&D game. **An AI-directed persistent narrative simulation** that happens to run 5e
rules. The difference drives every design decision: games fake persistence, this project
is trying to hold canonical memory, emotional continuity, and systemic consequence across
sessions.

Four layers, only two of which live in this repo:

| Layer | Name | Where it lives |
|---|---|---|
| **1 — DM Core** | Rules engine, persistent world memory, the AI DM ("Malachar"), narrative control. The brain. Non-visual. | `app/api/chat/route.ts`, `lib/world-ai/*`, Supabase edge functions |
| **2 — World Simulation** | Environments, inventory (canonical UUID'd items), NPCs as semi-autonomous agents, monsters. | Supabase tables + (future) Unreal Engine 5 |
| **3 — Player Interface** | This dashboard. Player input in, world state out. Players never touch the world directly. | This repo — `app/page.tsx`, `components/dashboard/*` |
| **4 — Cinematic Pipeline** | Turns simulation into video: shots, trailers, social clips. | `app/shotlist/page.tsx` + external (Runway, Kling, DaVinci, UE5 Sequencer) |

Flow: player acts → Layer 3 receives → Layer 1 validates rules + narrative → Layer 1
updates memory → Layer 1 issues commands → Layer 2 manifests → NPCs/monsters react →
inventory updates → Layer 4 captures the moment.

**Two invariants that come from the architecture, not from taste:**

1. **The AI cannot invent items.** Everything awarded must resolve against the canonical
   `items` catalog. Improvised loot breaks the whole premise.
2. **Facts are canon, flavour is the AI's.** Locations, named NPCs, stat blocks, what is
   actually in a room — those come from the database and the campaign book. Prose,
   sensory detail, dialogue, cruelty, pacing — those are Malachar's.

---

## 1. Stack and how to run it

- **Next.js 16.2.6** (App Router) · **React 19** · **TypeScript 5.7** (`strict: true`)
- **Tailwind v4**, CSS-first — there is **no `tailwind.config.*`**. The theme is oklch CSS
  variables in `app/globals.css`.
- **Supabase** (project `ppadxmvvvxmnnejeaoer`, `supabase-ashesofprometheus`) — Postgres,
  Realtime, Edge Functions, pgvector.
- **Vercel** hosting + Blob storage. Live at `ashes.playacartagena.com`.
- **pnpm** (`pnpm-lock.yaml`).

```bash
pnpm install
pnpm dev            # localhost:3000
pnpm build
npx tsc --noEmit    # DO THIS — see the warning below
```

Copy `.env.local.example` → `.env.local`. Note the example file only documents the three
Supabase vars; the full set is in §6.

> **`next.config.mjs` sets `typescript.ignoreBuildErrors: true`.** A green build proves
> nothing about types. Always run `tsc --noEmit` yourself before claiming a change compiles.

> **`tsc --noEmit` does not currently exit 0 on `main`, and never has recently.** The gate
> is therefore **no NEW errors against `main`'s baseline**, plus `pnpm build` exiting 0 —
> not "both exit 0". Do not repair pre-existing errors you did not cause; they are out of
> scope and belong to whoever owns those files. Measure it like this, on a clean tree:
>
> ```bash
> git stash list && git diff --stat origin/main   # must be EMPTY before you measure
> rm -f tsconfig.tsbuildinfo
> npx tsc --noEmit 2>/dev/null | grep "error TS" | sed 's/(\([0-9]*\),[0-9]*)/(/' | sort > /tmp/before.txt
> # ...make changes, then repeat into /tmp/after.txt...
> diff /tmp/before.txt /tmp/after.txt            # only deletions are acceptable
> ```
>
> Strip the line numbers as shown, or your own edits will make unchanged errors look like
> both an addition and a removal. **As of 2026-08-31 the baseline is 14 errors in 3 files**
> (`app/api/chat/route.ts`, `app/api/combat/route.ts`,
> `components/tactical/combat-board-3d.tsx`). When that reaches zero, delete this note and
> make the gate a plain `exit 0`.

> **`pnpm lint` does not work.** The script is `eslint .` but no ESLint config exists in
> the repo. The `eslint-disable-next-line` comments in source are vestigial.

> **There are no tests.** No runner, no CI, no fixtures. Verification is manual, against
> the checklists the plan docs carry.

---

## 2. Repository map

### Pages (`app/`)

| Route | File | What it is |
|---|---|---|
| `/` | `app/page.tsx` (1078 L) | The player dashboard. Three columns, `DiceProvider` wrapper, all Supabase fetches + realtime channels, claim-link flow. |
| `/join` | `app/join/page.tsx` | The access-code gate + character picker. A valid player code shows a card (portrait/class/level) with Enter / Create / Import paths; a forge code shows Create / Import; the DM code skips the picker entirely. Nothing hits localStorage until a path is chosen. |
| `/forge` | `app/forge/page.tsx` | Character Forge importer — paste `aop-character-v1` JSON; POSTs `/api/forge/import`, returns a claim link + three-word code. Quick build is retired (it produced incomplete sheets). |
| `/forge/builder` | `app/forge/builder/page.tsx` | The Character Forge 2014 builder embedded same-origin (iframe of `public/forge2014.html`, an exact copy of `docs/design/CharacterForge_2014Edition.html` — regenerate with `cp` if the source changes). Lists this browser's saved builds (`aop_forge2014_v1`); "Add to campaign" calls the iframe's own `exportPayload()`/`migrateChar()` (window-scoped function declarations) and POSTs `/api/forge/import`. |
| `/shotlist` | `app/shotlist/page.tsx` | Layer 4 view: cinematic beat timeline over `session_beats`, realtime. |
| `/music-upload` | `app/music-upload/page.tsx` | Bulk audio upload into 12 mood categories. |
| `/admin` | `app/admin/page.tsx` | Tabbed CMS over 8 tables. `force-dynamic`. |
| `/admin/npc-assets` | `app/admin/npc-assets/page.tsx` | NPC canon-asset manager (face / idle / talking media, voice, conditions). |

`app/layout.tsx` hardcodes `<html className="dark">`, loads Cinzel (`--font-serif`) and
Crimson Text (`--font-sans`), mounts `SupabaseStatus` + Vercel Analytics.

### API routes (`app/api/**/route.ts`)

| Route | Does | Service | Service-role? |
|---|---|---|---|
| `chat/route.ts` **(2066 L — the game engine)** | The Malachar DM turn: resolve speaker → build world context → call Claude → parse inline tags out of the prose → write game state. | Anthropic direct (`claude-sonnet-4-6` narration, `claude-haiku-4-5` secondary); fal `flux/schnell` for NPC/location art | only at the claim-token check |
| `forge/import/route.ts` | Validates `aop-character-v1` against column whitelists, inserts `characters` + `inventory_items`, issues a three-word `claim_code` into `character_secrets`, returns claim URL + `claimCode`, 409-warns on duplicates. | Supabase | yes |
| `verify-claim/route.ts` | Verifies `(characterId, claim_token)`; never echoes the token. | Supabase | yes |
| `inventory/transfer/route.ts` | Moves `environment_inventory` → a character's `inventory_items`. | Supabase | no |
| `lich-personality/route.ts` | GET/PUT the single personality-dial row. | Supabase | no |
| `tts/route.ts` | Malachar/player TTS. Voice IDs hardcoded, `eleven_multilingual_v2`. | ElevenLabs | no |
| `npc-tts/route.ts` | Per-NPC TTS; resolves voice via `lib/tts.ts`, persists the resolved id back. | ElevenLabs | yes |
| `npc-face/route.ts` | Canon face → `faces/<slug>.png` (overwrite); sets `face_url` on **every** row with that name. | Vercel Blob | yes |
| `npc-video/route.ts` | Same for idle/talking loops, 50 MB cap. | Vercel Blob | yes |
| `upload/route.ts`, `upload/delete/route.ts`, `file/route.ts` | Private blob upload/delete + the streaming proxy. This is why image URLs look like `/api/file?pathname=…`. | Vercel Blob | no |
| `music/route.ts`, `music/upload/route.ts` | Track listing / upload. | Vercel Blob | no |
| `generate-item-icon/route.ts` | 256×256 item icon via `gemini-3.1-flash-image-preview` through the Vercel AI Gateway. | AI Gateway + Blob | no |
| `world-ai/chat/route.ts` | Streaming World-AI assistant with an `updateEnvironment` zod tool (upsert on `name`). | Anthropic via AI Gateway | yes (in the tool) |
| `world-ai/claude/route.ts` | Bare fallback stream. | AI Gateway | no |
| `world-ai/malachar/session/route.ts`<br>`…/[sessionId]/message/route.ts`<br>`…/[sessionId]/stream/route.ts` | Anthropic **Managed Agents** beta (`anthropic-beta: managed-agents-2026-04-01`): create session, post message with world context prepended, proxy the SSE stream so the key never reaches the browser. | Anthropic direct | no |

### The inline tag protocol

Malachar emits tags inside his prose; `app/api/chat/route.ts` parses them out and writes
state. **This is the core mechanism of the app.** Do not change the syntax without
updating both the system prompt and the parser.

```
[DAMAGE:  [HEAL:  [ITEM_ADD:  [ITEM_AWARD:  [ITEM_REMOVE:
[CONDITION_ADD:  [CONDITION_REMOVE:
[NPC_ENCOUNTER:  [NPC_DAMAGE:  [NPC_LEAVE:  [NPC_IMAGE:
[LOCATION_IMAGE:  [UPDATE_LOCATION:
[TIME:  [STORY_ADVANCE  [CINEMATIC:
```

`[CINEMATIC: <cue>]` is the one tag with a **closed** vocabulary. `app/api/chat/route.ts`
queries `cinematic_clips` for the action states that have film at the party's current
location, injects them into the prompt as a whitelist, and discards any cue that is not on
it — so Malachar cannot invent a cue. The cue name alone crosses to the client (via
`lib/cinematic-cue.ts`); resolution, the once-per-character rule and solo-vs-party scope
stay in `/api/cinematics`.

`lib/tts.ts` `sanitizeForTTS()` strips these before speech. If you add a tag, add it there too.

### Components (`components/`)

**Shared primitives — change these once, everything follows:**

- `components/ui/fantasy-panel.tsx` — the gold-bracket ornate frame. **Every dashboard
  panel renders through it.**
- `components/dice/dice-provider.tsx` (462 L) — the *single* 3D dice engine
  (`@3d-dice/dice-box`) + cinematic overlay, mounted once. Exposes `useDice()`,
  `describeRoll()`, `parseDamage()`.
- `components/ui/fantasy-icons.tsx` — hand-written SVG icon set.
- `components/ui/floating-window.tsx` — modal shell for expanded sheet/inventory.
- `lib/utils.ts` `cn()` — clsx + tailwind-merge.

**`components/dashboard/`** — `left-column.tsx` (scene, interactive log, dialogue input,
TTS), `center-column.tsx` (1266 L: actions/spells/resources, NPC cards, speaker
segmentation), `right-column.tsx` (913 L: sheet, equipment, XP, rollable stats),
`panels/*` (attacks-spellcasting, character-status, detailed-stats, equipment-slots,
proficiencies), `party-status.tsx`, `basic-inventory.tsx`, `top-nav.tsx`,
`status-bar.tsx`, `dice-roller.tsx` (UI only), `dynamic-music.tsx`, `xp-tracker.tsx`,
`reactions-panel.tsx`.

**`components/world-ai/`** — `world-ai-panel.tsx` (chat/map/lore), `personality-dials.tsx`,
`dice-modal.tsx`.
**`components/admin/`** — one CRUD panel per table + `bestiary-autopopulate.tsx`, `image-uploader.tsx`.
**`components/conditions/`** — `condition-badges.tsx`, `conditions-editor.tsx`.
**`components/ui/`** — ~60 stock shadcn/ui "new-york" components. Untouched except the fantasy files above.

### `lib/`

| File | Purpose |
|---|---|
| `lib/supabase/client.ts` | Browser client. **Falls back to a chainable no-op stub** returning `{data: [], error: null}` when env vars are missing. |
| `lib/supabase/server.ts` | Cookie-bound server client for route handlers. |
| `lib/supabase/admin.ts` | `createAdminClient()` — service role. Throws if creds missing. **This is the live one.** |
| `lib/supabase.ts`, `lib/supabase-admin.ts` | **Legacy singletons.** Do not use in new code. |
| `lib/game-data.ts` | XP thresholds, class action/spell tables, `CANONICAL_START_LOCATION`, seed fallbacks. |
| `lib/conditions.ts` | Condition vocabulary, canonicalization, colour map. Stored as jsonb `string[]`. |
| `lib/character-visual-state.ts` | HP + conditions → `downed / restrained / poisoned / injured / idle` and the CSS filter. Single source for portrait effects. |
| `lib/bestiary-match.ts` | Fuzzy name matching + stat diff/patch for admin bestiary autopopulate. |
| `lib/tts.ts` | `sanitizeForTTS` + `resolveVoice` against curated ElevenLabs voices. |
| `lib/music-library.ts` | Static track catalog with moods. |
| `lib/data/spells.json` | ~377 KB spell dataset consumed by the chat route. |
| `lib/types/database.ts` | Hand-written row interfaces. **Not generated from Supabase** — keep in sync manually. |
| `lib/hooks/use-lich.ts` | `sendMessage(text, characterId, claimToken)` → `/api/chat`. |
| `lib/hooks/use-panel-assets.ts` | `dashboard_assets` override layer per panel. |
| `lib/hooks/use-telemetry.ts` | Writes `session_telemetry` (feeds the external Gemini DM integration). |
| `lib/world-ai/campaigns.ts` | `CAMPAIGNS` — system prompts, maps, lore, quick actions, scavenge tables, NPC stat helpers. |
| `lib/world-ai/world-context.ts` | `buildWorldContext` / `formatWorldContextForAI` — assembles the whole prompt. |
| `lib/world-ai/book-retrieval.ts` | RAG over the campaign book via the `ask-world` edge function. **See §4.** |
| `lib/world-ai/dice.ts` | Separate pure roller used only by the World AI panel. |
| `lib/world-ai/use-malachar.ts` | Client hook for the Managed-Agents session/message/SSE routes. |

---

## 3. Data model

**The core schema has no migration in this repo.** Tables were created through the
Supabase UI / v0. You **cannot** recreate this database from the repo, and
`migrations/*.sql` **do not run on deploy** — they are pasted into the Supabase SQL Editor
by hand.

What is in-repo: `supabase/migrations/20250528000000_lich_personality.sql` (creates the
dial table, RLS on with permissive policies), `migrations/shared_npc_encounters.sql`
(partial unique index — one active encounter per creature name, globally),
`migrations/seed_bestiary_act1.sql` (15 Act-1 creatures).

**Tables the code touches:** `characters`, `inventory_items`, `equipment_items`,
`environment_inventory`, `environments`, `npc_encounters`, `dialogue`, `items`,
`bestiary`, `abilities`, `actions`, `dashboard_assets`, `lich_personality`, `sessions`,
`session_beats`, `session_telemetry`, `campaign_saves`, plus `campaign_books` /
`campaign_chunks` (Layer 1 retrieval, service-role only).

Worth knowing:

- **`characters`** — full 5e block (`hp_current/hp_max`, `ac`, ability scores + modifiers,
  `proficiency_bonus`), `is_player`, `character_type: 'player'|'npc'|'monster'`,
  `conditions` jsonb array, `claim_token` (never readable by anon), and a large `sheet_*`
  family (`sheet_species`, `sheet_background`, `sheet_hit_dice`, `sheet_save_proficiencies`,
  `sheet_attacks`, `sheet_spellcasting`, `sheet_currency`, `sheet_backstory`,
  `sheet_appearance`, …) whitelisted in `app/api/forge/import/route.ts`.
- **`npc_encounters`** — canon identity is keyed by **name, not id**: `portrait_url`,
  `face_url`, `voice_id`, `voice_description`, `idle_url`, `talking_url`, `conditions`,
  `is_active`, `ac/hp/cr/xp`.
- **`items`** — the canonical catalog, 32 rows (19 Out of the Abyss, 13 imported from
  Sam's registry with serials like `WPN-VR-000001`). RLS on, public read / server write.
  `inventory_items.item_id` FK, nullable. Awards resolve name → alias → fuzzy against this.
- **`sessions.active_character_id`** — the DM "spotlight" pointer only. It is **not** who is
  speaking; see §5.

### Realtime

Supabase Postgres Changes only — no polling, no broadcast, no presence. Channels in
`app/page.tsx`:

| Channel | Table | Purpose |
|---|---|---|
| `dialogue-changes` | `dialogue` (INSERT) | New lines, deduped by id against optimistic entries |
| `environment-changes` | `environments` (`*`) | Party moved |
| `npc-encounters-shared` | `npc_encounters` (`*`) | Shared world state — NPC HP change on one browser updates all |
| `inventory-${characterId}` | `inventory_items`, filtered | Live item awards |
| `equipment-${characterId}` | `equipment_items`, filtered | Live equip changes |

`/shotlist` adds `shotlist-beats-${sessionId}` on `session_beats`.

Realtime only works if the table is in the `supabase_realtime` publication — **nothing in
the repo does that**, it is dashboard configuration.

---

## 4. Layer 1 — grounded retrieval (do not break this)

Malachar's Out of the Abyss knowledge used to be one ~15-line hardcoded prompt string, so
everything past Velkynvelve was improvised and presented as canon. Supabase now holds the
guide as **89 embedded passages across all 17 chapters** (`campaign_books`,
`campaign_chunks`, `vector(384)`, HNSW cosine, service-role only). Edge functions: `embed`
(gte-small, free, 384 dims), `ingest-book` (**batch size must be ≤ 3** or you hit
`WORKER_RESOURCE_LIMIT`), `ask-world` (retrieve → optionally generate).

**Two things that will silently produce confidently wrong output if you touch them:**

1. **Scene anchoring.** `lib/world-ai/book-retrieval.ts` sends `anchor_to_scene: true`
   plus the act label and resolved location. Measured on the live endpoint: a raw player
   message lands in the right chapter **1 time in 7**; anchored, **7 in 7**. "I try to slip
   out of the manacles" alone retrieves chapters 2 and 10 while the party is standing in
   the Velkynvelve slave pen. **Do not remove the anchoring.**
2. **The similarity thresholds.** gte-small compresses cosine similarity into a narrow high
   band — *unrelated text still scores ~0.76*. A fixed threshold is useless. `ask-world`
   uses `FLOOR 0.74` (hard reject), `STRONG 0.82` (the book genuinely covers it),
   `SPREAD 0.06` (keep only hits within this of the top). Measured: real questions
   0.84–0.90, nonsense 0.769, off-domain 0 hits.

Retrieval is **best-effort by contract**: 6 s timeout, returns empty on any failure, never
blocks a turn. Keep it that way.

**Malachar must never cite pages, chapters, or "the book" to players.** The DM dashboard
cites sources because Sam reads it behind the screen. Malachar citing them breaks the
fiction. The rule lives in `formatBookPassages`.

The personality dials (`lich_personality`: snark / cruelty / crassness 0–10, plus
`swearing`, `fourth_wall`, `roast_target`) feed `formatPersonality()` — they are dials on
**delivery, never on facts**. A cruel Malachar is still an accurate one.

---

## 5. Ownership, claims, and the "one global seat" rule

Per-browser identity is **not** in the database.

- Each browser stores its character in `localStorage` under `aop_character_id`.
- A claim link `/?c=<characterId>&k=<claimToken>` is verified through `/api/verify-claim`
  (service-role), then locks the selection and hides the character picker.
- `/api/chat` **re-verifies the claim token on every message** before accepting speaker
  attribution.
- **Every message and every mutation must carry its own `characterId`.** Never fall back to
  `sessions.active_character_id` to decide who acted — that is the "one global seat" bug,
  where whatever one player did got attributed to whoever the DM last spotlighted.

---

## 6. Environment variables

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | all Supabase clients, `book-retrieval.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser/server clients, `book-retrieval.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` |
| `ANTHROPIC_API_KEY` | `app/api/chat/route.ts`, all three `world-ai/malachar/*` routes |
| `ANTHROPIC_AGENT_ID` | `world-ai/malachar/session/route.ts` (falls back to a hardcoded id) |
| `ANTHROPIC_ENVIRONMENT_ID` | `world-ai/malachar/session/route.ts` — **hard-required**, 500s without it |
| `ELEVENLABS_API_KEY` | `api/tts`, `api/npc-tts` |
| `FAL_KEY` | `app/api/chat/route.ts` (warns at module load if unset) |
| `BLOB_READ_WRITE_TOKEN` | never referenced explicitly; `@vercel/blob` picks it up |

`.env.local.example` documents only the three Supabase vars. Real secrets live in Vercel →
Settings → Environment Variables, never in the repo.

**Three separate paths to Anthropic** — changing one changes nothing about the others:
direct SDK with `ANTHROPIC_API_KEY` (`/api/chat` — deliberate; the Vercel AI Gateway 403s
on Anthropic models on the free tier), bare model strings through the AI Gateway
(`/api/world-ai/chat`, `/api/world-ai/claude`), and the Managed Agents beta REST API
(`/api/world-ai/malachar/*`).

---

## 7. Conventions

- **Path alias** `@/*` → repo root (`tsconfig.json`). shadcn "new-york", lucide icons.
- **Styling**: `FantasyPanel` + raw Tailwind. Palette literals (`bg-[#0a0908]`, `amber-*`,
  `stone-*`) rather than shadcn tokens in the game UI. Dark mode is forced —
  `next-themes` is installed but `ThemeProvider` is never mounted.
- **`app/globals.css` is live. `styles/globals.css` is a stale light-theme duplicate that
  nothing imports** — editing it does nothing.
- **Supabase query discipline**: `.limit(1)` / `.maybeSingle()`, never a bare `.single()`
  on an unfiltered query. See §8.
- **Portrait rule, non-negotiable**: character and NPC art is **never cropped through the
  head**. `object-fit: contain` for framed portraits; where a cover crop is unavoidable
  (circular avatars) anchor with `object-position: center 10–18%`. Everywhere art renders.
- **Item art**: use the uploaded `icon_url` when present, otherwise a neutral framed glyph
  tile. **Never AI-generate item art.**
- **Don't build empty pages.** A nav item with an honest "soon" badge beats a dead page.

---

## 8. Landmines — read before refactoring

`app/api/chat/route.ts` carries comments documenting production bugs already fixed. They
are load-bearing:

1. **"never use an unfiltered `.single()` here"** — 12 characters in prod made
   `.eq("is_player", true).single()` throw, silently skipping the entire item-award block.
2. **The Jimjar bug** — `fetchNpcCanonByName` exists so a re-encountered NPC never gets a
   re-synthesized face or voice. Canon is keyed by **name across all rows**, not by id.
3. **The "every NPC has 75 HP" bug** — `resolveNpcStats` has a strict priority chain
   (bestiary → campaign stat block → CR-appropriate improvised, flagged) with **no silent
   default**.
4. **The "one global seat" bug** — see §5.

Other things that will bite you:

- **Two of several things.** `lib/supabase.ts` + `lib/supabase-admin.ts` (legacy) vs
  `lib/supabase/{client,server,admin}.ts` (live). `hooks/use-mobile.ts` + `use-toast.ts`
  vs the `components/ui/` copies. `app/globals.css` (live) vs `styles/globals.css` (dead).
  `sanitizeForTTS` exists in `lib/tts.ts` **and** inline in `left-column.tsx`. Pick the live one.
- **Two dice paths.** `dice-provider.tsx` is declared the single source of truth, but
  `components/world-ai/dice-modal.tsx` still rolls independently via `lib/world-ai/dice.ts`.
- **`dialogue` vs `dialogues`.** Both names appear in `.from(…)` calls
  (`components/admin/dialogue-panel.tsx` uses `dialogues`; `app/page.tsx` and `/api/chat`
  use `dialogue`). Verify against the live DB before touching either.
- **The Supabase client degrades silently.** Missing env vars → every query resolves
  `{data: [], error: null}` and channels are inert. The UI renders fine and looks *empty*
  rather than erroring. Check the `SupabaseStatus` badge before debugging "no data".
- **Private blobs** are served through `/api/file?pathname=…`. NPC face/video uploads use
  deterministic overwrite paths, so a re-upload replaces the canon asset for **every** row
  with that NPC's name.
- **Hardcoded values**: ElevenLabs voice IDs in `api/tts/route.ts`, the default agent id in
  `malachar/session/route.ts`, the Supabase project URL in `docs/GEMINI_DM_INTEGRATION.md`,
  and player names (`sam|kenta|fifi|scott`) baked into the `lich_personality.roast_target`
  CHECK constraint.
- **`SPELL_INTEGRATION_STATUS.md` is stale** — it claims the spell library is an empty
  placeholder. `lib/data/spells.json` is populated (~377 KB).
- **Biggest / most fragile files**: `app/api/chat/route.ts` (2066), `center-column.tsx`
  (1266), `app/page.tsx` (1078), `right-column.tsx` (913).

---

## 9. Current state

`main` @ `6555f21`. Feature branch **`claude/dice-forge-round1` @ `d40f0bc`** — shipped to
a Vercel preview, **not yet merged**.

**Round 1 — dice, forge, living portraits**
- One dice roller, one truth: the 3D engine lifted into `components/dice/dice-provider.tsx`
  (queue, promise API, cinematic overlay mounted once). Tray is UI-only. No sheet-local RNG.
- Rollable sheet: ability checks, saves, skills (expertise doubles proficiency), initiative,
  weapon attacks (attack → damage, dice doubled on nat 20), spell attacks. Save-DC spells
  show the DC only.
- Roll flow: checks → 🎲 line into shared `dialogue` (realtime, all browsers); attacks →
  also to `/api/chat` as that character (claim token honoured). **Malachar narrates the
  exact totals and never re-rolls.**
- `/forge`: import `aop-character-v1` JSON or quick-build.
- Portrait effects via `lib/character-visual-state.ts` (poisoned tint, injured vignette —
  reduced-motion safe, downed greyscale).

**Round 2 — v3.0 restyle** (target: `docs/design/Dashboard_Player_Version3.0.png`)
- `FantasyPanel` rebuilt: gold-bronze rule, filigree corner brackets, centred small-caps
  serif titles. Every panel inherits it.
- `TopNav` (Forge is real, the rest are badged), `StatusBar` (live last-saved clock,
  Auto-Save, DM Mode, Export Campaign).
- Left: Current Environment + Interactive Log with All/Narration/Dialogue/Combat/System
  filters, speaker colours, quick replies, Roll for Initiative.
- Right: ability boxes + saving throws (both roll through the shared roller),
  Senses/Skills, View Full Character Sheet, `BasicInventory` with weight/capacity, filters,
  coin purse.

### Open work

- **Merge `claude/dice-forge-round1` to main** — that is what goes live on
  `ashes.playacartagena.com`.
- NPC/DM window: disposition + attitude + speaking meter in the centre-column header;
  "View NPC Sheet".
- Per-section routes for Journal / Quests / Maps / NPCs / Lore — currently all open the
  World AI panel.
- `/forge` still uses its own styling, not the Character Forge 2014 look
  (`docs/design/CharacterForge_2014Edition.html`).
- **Item catalog wiring not yet applied**: `awardItem` should resolve the catalog first
  (name → alias → fuzzy), canonical name wins, insert carries `item_id`/slot/weight/value,
  slot badge suggested but **never auto-equip**, cursed items reveal nothing.
- **RLS is disabled on `sessions` and `session_beats`** — anyone with the public anon key
  can read or rewrite them. Needs enabling *with* policies, or it locks everything out.
- `ANTHROPIC_API_KEY` must be set in Supabase → Settings → Edge Functions → Secrets, or
  `ask-world` returns 503 (retrieval itself still works).
- `music_cues` is empty: items carry `music_theme` filenames that have no files yet.

---

## 10. Working agreement

- **Sam is a solo founder and not a programmer.** Explain what a change does and why in
  plain language. Don't hand back a diff and assume it reads itself.
- **Inspect the current code before changing it.** Preserve working behaviour — realtime
  channels, per-browser character selection, claim links, the chat route, TTS — unless a
  spec explicitly replaces it.
- **No new Supabase migrations without saying so out loud.** Migrations don't run on
  deploy; someone has to paste SQL into the dashboard, and that someone is Sam.
- **Never invent game data.** No fabricated stat blocks, no improvised loot, no NPC facts
  that aren't in the DB or the guide. If the source is silent, say so rather than filling
  the gap.
- **Verify before claiming done.** `npx tsc --noEmit` must report **no new errors against
  `main`'s baseline** (see the note in §1 — it does not exit 0 on `main`), and `pnpm build`
  must exit 0. The plan docs carry numbered post-deploy checklists — use them.
- Branch, push, and let Sam merge from GitHub's banner. Don't push to `main` unasked.
- 
