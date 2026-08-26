# SI-002 — Inventory / Equipment Icon Audit

## Preflight

- Base `main`: `a3b52f36e8bd90347a24e843933b58e36ef27aa8`
- Open PRs: #220 only (`feat/persisted-roll-requests`), no inventory/icon overlap found
- AoP production Supabase project expected by repo: `ppadxmvvvxmnnejeaoer`
- Connected Supabase tool currently exposes a different inactive project (`twwpvweaudekbsvudkpn`), so no production SQL was executed during this intervention

## Findings

### 1. Shared dead-URL fallback is broken

`lib/item-icons.tsx` says a failed image URL degrades to the item-type silhouette, but the current `onError` only hides the `<img>` and sets `data-icon-failed` on the parent. No code or CSS consumes that attribute, so the visible result is a blank icon region.

**Fix:** `ItemIcon` now remembers the URL that failed and renders the existing type-aware fallback for that URL. If the icon URL later changes, the new URL is tried normally.

### 2. EquipmentSlots bypasses the shared icon component

`components/dashboard/panels/equipment-slots.tsx` renders item art with raw `<img>` elements in three places. Consequences:

- dead URLs can show broken/blank art instead of the shared fallback
- item art uses `object-cover`, which can crop inventory art
- missing equipped-item art falls back to a generic slot/backpack rather than the same item-type/name fallback used elsewhere

**Fix:** route equipped and available item rendering through `ItemIcon`; preserve the slot-specific glyph only when the slot is genuinely empty.

### 3. Resolver wiring itself is present

The player dashboard reads `inventory_items_resolved` and `equipment_items_resolved`, then maps `resolved_icon_url` back onto `icon_url` for downstream components. The underlying resolver migration preserves the intended inventory order:

`row override → direct catalog item_id → catalog item_key/alias → asset library → none`

A later migration also documents and repairs the known `dagger` / `obsidian-flake-dagger` alias collision.

## Production-data verification still required

Because the connected Supabase account is not the AoP production project, this intervention does **not** claim a current count of `item_icon_gaps`, catalog coverage, or live resolver-source counts.

Once AoP Supabase access is connected, run read-only checks against:

- `item_icon_gaps`
- `inventory_items_resolved` grouped by `icon_source`
- `equipment_items_resolved` grouped by `icon_source`
- duplicate keys emitted by `item_catalog_lookup`
- catalog rows with null `icon_url`

No database write should be made until those results identify a specific data defect.
