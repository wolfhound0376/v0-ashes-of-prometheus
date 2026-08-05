# Claude Cowork Handoff — Player Dashboard

Updated: 2026-08-02

## Start here

- Repository: `05_Players/v0-ashes-of-prometheus-integration`
- Working branch: `codex/lich-dice-redesign`
- Base: `origin/main` at `89a2732`
- Do not merge or deploy until Sam explicitly approves it.
- Preserve Supabase/campaign-canon data paths. Do not replace real data with fabricated UI arrays.

## What is implemented on this branch

The branch redesigns the player dashboard into the dark ornate Ashes of Prometheus presentation and retains the shared dice provider/physics behavior.

- Cinematic three-column player dashboard and responsive character-stat panel.
- NPC/DM portrait area with speaking status below the portrait.
- Character-view and tactical-map stage modes.
- Interactive log and party-status presentation.
- Detailed armor class, proficiency, speed, and ability-score artwork.
- Interactive D&D-style full character sheet.
- Inventory/equipment manager with drag-and-drop slots and live calculated bonuses.
- Journal, Quests, Maps, and Lore campaign-book modals.
- Native dice roller controls for quantity, die type, modifier, normal/advantage/disadvantage, physics-backed roll results, and log/DM reporting.
- Animated Book of Spells with class/domain spell organization and reversible open/close treatment.
- Removed the obsolete `View All Characters` control.

## Relevant commits

- `69b6d2e` — Redesign dashboard dice experience
- `fdbd798` — Add modeled dice and roll modes
- `178a7c7` — Wire dashboard controls and campaign books
- `682c799` — Refine NPC layout and add spellbook
- `b862cfe` — Animate spellbook and refine dice faces
- The newest dice-image handoff commit follows these commits.

## Latest dice artwork update

The Dice Roller no longer crops icons from the old composite sprite. Each die renders a supplied animation still as a normal `<img>`:

- `public/images/ui/dice-stills/d4.png`
- `public/images/ui/dice-stills/d6.png`
- `public/images/ui/dice-stills/d8.png`
- `public/images/ui/dice-stills/d10.png`
- `public/images/ui/dice-stills/d12.png`
- `public/images/ui/dice-stills/d20.png`
- `public/images/ui/dice-stills/d100.png`

The Interactive Log launcher separately uses the user's ornate, opaque D20 artwork:

- `public/images/ui/dice-stills/d20-launcher.png`

Do not reintroduce the old generated number overlays or sprite background-position cropping.

## Character-sheet scene options

The full character sheet now includes a scene selector below the character header. `Option 1 · Drow Prisons` is selected by default and uses:

- `public/images/ui/character-sheet-scenes/option-1-drow-prisons.png`

The chosen scene backgrounds the full sheet through a dark readability wash. Add future scenes to the `sheetScenes` collection in `components/dashboard/v4-dashboard.tsx`; do not replace the canonical scene with an invented image.

## Spellbook debugging note

The earlier `SpellbookModal is not defined` browser error came from a stale Next/Turbopack development bundle. The generated `.next/dev` cache was cleared and the dev server was restarted. Current source contains `SpellbookModal`, and the production build passed. If the error reappears, stop the dev process, remove only `.next/dev`, and restart; do not delete source or campaign data.

The spellbook animation now uses the supplied cinematic artwork rather than the generated purple cover:

- `public/images/ui/spellbook/grimoire-closed.png` is the rotating and opening cover.
- `public/images/ui/spellbook/grimoire-open.png` is the revealed open-book study beneath the functional spell interface.
- Closing plays the existing sequence in reverse. Preserve both images and the live spell controls when refining the animation.

## Verification completed

- TypeScript: `tsc --noEmit` passes after the latest D20 replacement.
- Browser: all seven die-image paths render in the Dice Roller.
- Browser: the separate Interactive Log D20 launcher resolves `d20-launcher.png` with its opaque background intact.
- Browser: Dice Roller opens and roll controls remain present.
- Earlier full Next production build passed all routes after the spellbook work.
- These results are local verification only; they are not production/user verification.

## Files changed from `origin/main`

- `app/globals.css`
- `app/page.tsx`
- `components/dashboard/campaign-book-modal.tsx`
- `components/dashboard/dice-roller.tsx`
- `components/dashboard/party-status.tsx`
- `components/dashboard/v4-dashboard.tsx`
- `components/dice/dice-provider.tsx`
- `public/images/ui/dice-roller-reference.png`
- `public/images/ui/dice-stills/*`

## Recommended merge procedure

1. Fetch and inspect `codex/lich-dice-redesign`.
2. Read this handoff and review the full branch diff against `origin/main`.
3. Run TypeScript and the Next production build.
4. Visually verify the Dice Roller, spellbook animation, NPC layout, full character sheet, and inventory/equipment flow.
5. Confirm Supabase-backed behavior with configured environment variables.
6. Merge only after Sam explicitly authorizes it.
7. Treat merge, deployment readiness, deployment, and user-verified production behavior as separate statuses.

## Local-only files to ignore

Do not commit the `.codex-*.log` development logs. They are local diagnostic output.
