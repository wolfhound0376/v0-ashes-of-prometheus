# Underdark Drinks

Beverage list for the alchemy system. Status: **draft for Sam's approval 2026-09-29. Nothing written to the catalog.**

Rules live in `claude/claude_Alchemy_Minigame.md`. This doc is the content.

---

## What is already in the catalog

Checked live against `items` on 2026-09-29. **The beer / liquor / wine triad already exists** — one of each, plus a fermented milk. Nothing below needs inventing to make the system work:

| slug | name | class | note |
|---|---|---|---|
| `darklake-stout` | Darklake Stout | beer | duergar ale, "thick, earthy… you could stand a spoon in it" |
| `fire-lichen-liquor` | Fire Lichen Liquor | liquor | duergar fermented fire lichen spirit; row already flagged canon |
| `mushroom-wine` | Mushroom Wine | **wine** | fermented fungal blend, drow and duergar |
| `deep-rothe-milk` | Deep Rothé Milk (skin) | fermented | row already says duergar drink it fermented |

Every base ingredient is already a row too: `barrelstalk`, `bluecap`, `fire-lichen`, `trillimac`, `ripplebark`, `waterorb`, `zurkhwood`, `torchstalk`, `timmask`, `tongue-of-madness`, `nilhoggs-nose`, `pygmywort`, `bigwig`, `ormu-moss`, `nightlight-fungus`, `tainted-spores-pouch`, `blind-cave-fish`, `sporebread-loaf`. Plus `holy-water`.

**So phase one is columns on existing rows, not new content.** Only the additions in the last section are new.

## Proof and the ladder

Proof sets the Constitution save DC to resist each step of the inebriation ladder (`claude_Alchemy_Minigame.md` §7 — level 1 is **disadvantage on Dexterity checks**, Sam's ruling).

| Proof | Save DC per drink | Steps per drink |
|---|---|---|
| Low (beer, milk) | DC 10 | 1 |
| Middling (wine) | DC 12 | 1 |
| High (liquor) | DC 14 | 2 |

---

## Existing rows — proposed drink data

| Drink | Class | Proof | Who can make it | Proposed character note |
|---|---|---|---|---|
| Darklake Stout | beer | low | any brewer | Brewed from `bluecap` mash. The Underdark's working drink; every duergar hall has a barrel. |
| Fire Lichen Liquor | liquor | **high** | any brewer, needs a still | `fire-lichen` distilled. Two ladder steps a cup. The burn is the point. |
| Mushroom Wine | **wine** | middling | **cleric only** | `zurkhwood` and `trillimac` must. This is the sacramental one — and the base holy water wants. |
| Deep Rothé Milk | fermented | low | any brewer | Sours into something halfway to beer in about a day. Free if you have rothé. |

**Design note on Mushroom Wine:** it is already in the catalog as a drow-and-duergar staple, which sits awkwardly against the cleric-only ruling — drow clerics of Lolth exist, so the fiction holds, but it means *the drow can make wine and the party can only make it through Samson.* That is either a nice piece of scarcity or an unintended implication. **Flagged for Sam.**

---

## Proposed additions

New rows, each built from ingredients already in the catalog. All homebrew.

| Proposed slug | Name | Class | Proof | Built from | What it does |
|---|---|---|---|---|---|
| `sporebread-small-beer` | Sporebread Small Beer | beer | low | `bluecap`, `waterorb` | The weakest thing you can safely drink. Ladder level 1 only, never higher. What you give someone who has to stay useful. |
| `torchstalk-brandy` | Torchstalk Brandy | liquor | high | `torchstalk`, `barrelstalk` | Flammable. Genuinely — a thrown flask is a 1-use improvised incendiary, which makes it worth more as a tool than a drink. |
| `ripplebark-bitter` | Ripplebark Bitter | beer | low | `ripplebark`, `bluecap` | Ripplebark's row already calls it genuinely sustaining. Counts as a day's rations as well as a drink. |
| `nightlight-cordial` | Nightlight Cordial | liquor | middling | `nightlight-fungus`, `waterorb` | The drinker faintly glows for an hour. Disadvantage on Stealth, and nobody loses you in the dark. Comedy and tactics in one bottle. |
| `communion-wine` | Communion Wine | **wine** | middling | `mushroom-wine` + a cleric's blessing | The consecrated step between mushroom wine and holy water. This is the row that makes the cleric a supply line. |
| `whorlstone-punch` | Whorlstone Punch | liquor | high | `pygmywort`, `bigwig` | Both Whorlstone fungi in one cup, so the size effects fight. Roll which one wins. Duergar brawl fuel, and the row for `bigwig` already says why. |

### Deliberately not drinks
`timmask`, `tongue-of-madness`, `tainted-spores-pouch` and `nilhoggs-nose` stay ingredients. They are Eat It And See material and belong to the impurity and corruption side, not the bar. A drink whose downside is madness is not a trade, it is a trap — and traps should be the Poisoned Cookbook's job, where the player at least had a reason to trust it.

---

## Sourced vs homebrew

**SOURCED (Underdark / OotA canon):** fire lichen and fire lichen ale as a duergar drink; zurkhwood, bluecap and sporebread, trillimac, barrelstalk, ripplebark, timmask, torchstalk, waterorb, nightlight, ormu, tongue of madness as Underdark fungi with the properties their catalog rows already carry; pygmywort and bigwig as Whorlstone Tunnels fungi; the Darklake; deep rothé.

**HOMEBREW (all invented here):** every proof rating and save DC; the inebriation ladder; cleric-gated wine; all six proposed new rows and their effects; the glow, incendiary and size-fight effects; ripplebark counting as rations.

## Open questions

1. **Mushroom Wine's existing description makes it a drow and duergar staple** — does cleric-only mean only *player* clerics, or is wine genuinely a consecrated craft across the Underdark?
2. **Torchstalk Brandy as a thrown incendiary** overlaps `alchemists-fire` (50 gp, already in the catalog). Keep it strictly weaker, or cut it?
3. **Six new rows or fewer?** Every one needs a pixel icon at the ladder in `claude_Session_Capture_ItemCatalog_Icons`. Say the number and they get generated in one batch.
