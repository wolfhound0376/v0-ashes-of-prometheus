import { cn } from "@/lib/utils"
import { conditionColor, normalizeConditions } from "@/lib/conditions"

// Read-only condition chips. Used on the player sheet, NPC detail views, and the
// featured-speaker panel. Renders nothing when empty unless `emptyLabel` is set.
export function ConditionBadges({
  conditions,
  size = "sm",
  className,
  emptyLabel,
  align = "start",
}: {
  conditions: unknown
  size?: "xs" | "sm"
  className?: string
  emptyLabel?: string
  align?: "start" | "center"
}) {
  const list = normalizeConditions(conditions)

  if (list.length === 0) {
    if (!emptyLabel) return null
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span>{emptyLabel}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1",
        align === "center" ? "justify-center" : "justify-start",
        className,
      )}
    >
      {list.map((c) => (
        <span
          key={c}
          className={cn(
            "uppercase tracking-wider rounded border border-current/30 bg-current/10",
            size === "xs" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
            conditionColor(c),
          )}
        >
          {c}
        </span>
      ))}
    </div>
  )
}
