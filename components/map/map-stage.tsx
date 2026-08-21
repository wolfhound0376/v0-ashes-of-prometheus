"use client"

// DIAGNOSTIC BUILD — deliberately inert.
//
// The dashboard tab freezes when the stage switches to tactical. This version
// renders nothing but static markup: no data fetch, no SVG, no image, no state.
// If the freeze survives this, the fault is in the dashboard's mode switch and
// not in the map at all. Reverted as soon as it has answered the question.

export default function MapStage({ onBack }: { onBack?: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0b0714] text-[#e1d0a8]">
      <div className="text-xs uppercase tracking-widest">Map stage — diagnostic build</div>
      <div className="text-[10px] text-[#8f8061]">If this text appears and the tab stays responsive, the map content was the problem.</div>
      {onBack && (
        <button onClick={onBack} className="rounded border border-[#6b5123] px-3 py-1.5 text-[10px] uppercase tracking-wider hover:border-[#c99a49]">
          ← Character View
        </button>
      )}
    </div>
  )
}
