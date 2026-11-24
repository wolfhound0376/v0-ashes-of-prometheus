import { cn } from "@/lib/utils"
import { conditionColor, conditionIcon, normalizeConditions } from "@/lib/conditions"

// Read-only condition chips. Used on the player sheet, NPC detail views, and the
// featured-speaker panel. Renders nothing when empty unless `emptyLabel` is set.
// Each chip wears the condition's painted icon where the pack has one (Sam, 2026-11-23).
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
      {list.map((c) => {
        const icon = conditionIcon(c)
        return (
          <span
            key={c}
            className={cn(
              "inline-flex items-center gap-1 uppercase tracking-wider rounded border border-current/30 bg-current/10",
              size === "xs" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
              icon && (size === "xs" ? "pl-0.5" : "pl-1"),
              conditionColor(c),
            )}
          >
            {icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" aria-hidden="true" className={cn("object-contain drop-shadow", size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4")} />
            )}
            {c}
          </span>
        )
      })}
    </div>
  )
}
