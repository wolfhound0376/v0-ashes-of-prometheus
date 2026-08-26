"use client"

// The board's failure mode must never again be Next's blank "This page
// couldn't load". A 3D scene has real ways to fail - WebGL loss, a bad
// asset, a race like the ember one - and when it does, the table deserves
// a readable message and a way back, not a dead screen.

export default function BattleError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid h-screen w-screen place-items-center bg-[#020204] p-6">
      <div className="max-w-md rounded border-2 border-[#7a2b2b] bg-[#1a1020] p-5 text-center">
        <div className="font-serif text-[15px] uppercase tracking-[0.2em] text-[#c23b2e]">The board falters</div>
        <p className="mt-2 text-[12px] leading-relaxed text-[#c9bcd8]">
          Something broke while conjuring the battlefield. The game itself is untouched —
          positions, HP and initiative all live in the ledger, not in this window.
        </p>
        <p className="mt-2 font-mono text-[10px] text-[#6f6486]">{error?.message?.slice(0, 140)}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={reset} className="rounded border border-[#8b6427] bg-[#1c1408] px-4 py-1.5 text-[10px] uppercase tracking-wider text-[#f0cd7a] hover:border-[#f4e0a8]">
            Try again
          </button>
          <a href="/" className="rounded border border-[#4a3a2a] bg-black/70 px-4 py-1.5 text-[10px] uppercase tracking-wider text-[#a89468] hover:border-[#8b6427]">
            Back to the table
          </a>
        </div>
      </div>
    </div>
  )
}
