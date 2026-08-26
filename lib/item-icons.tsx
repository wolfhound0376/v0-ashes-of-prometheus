"use client"

/**
 * Item icon resolution — the single place that decides what picture an item
 * shows. (2026-08-18)
 *
 * WHY THIS EXISTS: uploaded item art lived in `items.icon_url` and
 * `dashboard_assets` while every UI read only `inventory_items.icon_url`,
 * which was NULL on all 53 rows. Art was uploaded, rows existed, nothing
 * joined them. The database now resolves the art (see the
 * `inventory_items_resolved` / `equipment_items_resolved` views and the
 * `item_key` registry); this module owns the LAST step — what to draw when
 * the resolver honestly finds nothing.
 *
 * A missing icon is a content gap, not an error. `item_icon_gaps` in the
 * database ranks those gaps by how many rows want them, so the silhouette
 * below is a placeholder with a to-do list attached, never a broken image.
 */

import { useState } from "react"
import {
  Backpack,
  BookOpen,
  Coins,
  FlaskConical,
  Gem,
  KeyRound,
  Package,
  Scroll,
  Shield,
  Shirt,
  Sword,
  Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"

type IconComponent = typeof Package

// item_type → silhouette. Keys are matched loosely (substring, lowercased) so
// "martial weapon", "weapon" and "Weapon (Simple)" all land on the sword.
const TYPE_ICONS: Array<[string, IconComponent]> = [
  ["weapon", Sword],
  ["armor", Shield],
  ["shield", Shield],
  ["clothing", Shirt],
  ["consumable", FlaskConical],
  ["potion", FlaskConical],
  ["scroll", Scroll],
  ["book", BookOpen],
  ["journal", BookOpen],
  ["treasure", Gem],
  ["gem", Gem],
  ["currency", Coins],
  ["coin", Coins],
  ["key", KeyRound],
  ["focus", Wand2],
  ["wand", Wand2],
  ["staff", Wand2],
  ["gear", Backpack],
  ["pack", Backpack],
  ["tool", Backpack],
]

/** Pick the silhouette for an item, falling back to a generic package. */
export function itemTypeIcon(itemType?: string | null, name?: string | null): IconComponent {
  const haystack = `${itemType ?? ""} ${name ?? ""}`.toLowerCase()
  for (const [needle, icon] of TYPE_ICONS) {
    if (haystack.includes(needle)) return icon
  }
  return Package
}

export interface ItemIconProps {
  /** Already-resolved art URL. Null means no art exists yet — draw the type. */
  iconUrl?: string | null
  name?: string | null
  itemType?: string | null
  /** Tailwind sizing for the rendered image / silhouette. */
  className?: string
}

/**
 * Renders real art when it exists, otherwise a type-appropriate silhouette.
 * Never renders a broken <img>: an art URL that fails to load falls back to
 * the silhouette at runtime too.
 */
export function ItemIcon({ iconUrl, name, itemType, className }: ItemIconProps) {
  const Fallback = itemTypeIcon(itemType, name)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const shouldFallback = !iconUrl || failedUrl === iconUrl

  if (shouldFallback) {
    return <Fallback className={cn("text-[#94713b]/70", className)} aria-hidden />
  }

  return (
    <img
      src={iconUrl}
      alt={name ?? ""}
      className={cn("object-contain", className)}
      onError={() => setFailedUrl(iconUrl)}
    />
  )
}
