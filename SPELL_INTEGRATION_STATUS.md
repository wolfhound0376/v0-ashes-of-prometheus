# Spell Library Integration — Implementation Complete

## What Was Done

The spell library infrastructure has been wired into Malachar (`app/api/chat/route.ts`):

### 1. **Module-Level Spell Indexing** (lines 6–10)
   - Imported `spells.json` as a JSON asset
   - Created `SPELL_INDEX` (Map: spell name → spell object) for O(1) lookup
   - Created `SPELL_NAMES` array for haystack searching

### 2. **Helper Functions** (lines 178–211)
   - `findReferencedSpells(text, knownSpellNames)` — Scans the turn text and the caster's prepared spells; returns matching spell objects
   - `formatSpell(s)` — Formats each spell's stats into readable text with save/attack info, damage, area, concentration, upcasting

### 3. **Spell Section Assembly** (lines 448–464)
   - Queries the `abilities` table for the active character's known spells
   - Calls `findReferencedSpells()` to identify which spells are being cast this turn
   - Builds a `spellSection` string that only includes spells mentioned or known (keeps prompt lean)
   - Injects `${spellSection}` into the lichPrompt right after the bestiary section

### 4. **SPELLS Rule in Combat Rules** (lines 568–569)
   - Added explicit instruction: resolve cast spells using the SPELL MECHANICS block with real DCs/damage, enforce Concentration, apply upcasting
   - Fallback: if a spell is not in the block, use official D&D 5e rules, never invent

## Next Steps: Complete the Integration

**Upload the actual spell library:**

1. Get `Spell_Library_GameReady.json` from `01_Campaign_Materials`
2. Upload it to the v0 project at `lib/data/spells.json`
3. Replace the placeholder empty array `[]` with the full 556-spell dataset

The structure expects:
```json
[
  {
    "name": "Fireball",
    "level": 3,
    "school": "Evocation",
    "classes": ["Sorcerer", "Wizard"],
    "cast_time": "1 action",
    "range": "150 feet",
    "range_ft": 150,
    "range_kind": "ranged",
    "duration": "Instantaneous",
    "concentration": false,
    "components": "V, S, M",
    "attack_roll": false,
    "save": {
      "ability": "DEX",
      "on_success": "half"
    },
    "damage": [
      {"dice": "8d6", "type": "fire"}
    ],
    "area": "20-foot radius sphere",
    "conditions": [],
    "upcast": {
      "type": "damage",
      "per_slot": "1d6",
      "above_level": 3
    },
    "effect": "..."
  },
  // ... 555 more spells
]
```

## Testing

Once the spell file is uploaded, test by:

1. Start a session with a spellcaster (e.g., wizard or cleric)
2. Have the character cast a known spell (e.g., "I cast Magic Missile")
3. Verify Malachar:
   - Calls for the correct attack roll or save
   - Rolls damage using the exact dice from the spell library
   - Applies spell-specific rules (e.g., "half damage on a successful save")
   - Enforces Concentration if needed

## Files Modified

- `app/api/chat/route.ts` — Added spell helpers, indexing, section building, prompt injection, and rules
- `lib/data/spells.json` — Created (placeholder; awaiting real data upload)

The implementation is complete and ready for real spell data!
