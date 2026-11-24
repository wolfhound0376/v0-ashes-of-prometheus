"use client"

// THE INVITE (lib/room-code.ts; Sam, 2026-11-23: "PR2"). Shown to the DM and the host while the table is open:
// the four-letter code, big; the link with Copy and Share (Share texts it from a phone); a QR code for the screen
// the table is projected on; and New code, which makes the old link stop working.

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Copy, RefreshCw, Share2 } from "lucide-react"
import { roomLink } from "@/lib/room-code"

export function InvitePanel({ code, busy, onNewCode }: { code: string; busy: boolean; onNewCode: () => void }) {
  const [link, setLink] = useState("")
  const [qr, setQr] = useState("")
  const [said, setSaid] = useState<string | null>(null)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    const l = roomLink(window.location.origin, code)
    setLink(l)
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
    // Dark squares on parchment: phone cameras read dark-on-light far more reliably than the reverse.
    QRCode.toString(l, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#120e0a", light: "#f4e8cc" } })
      .then(setQr)
      .catch(() => setQr(""))
  }, [code])

  const flash = (s: string) => { setSaid(s); window.setTimeout(() => setSaid(null), 2200) }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); flash("Link copied") } catch { flash(link) }
  }
  const share = async () => {
    try { await navigator.share({ title: "Ashes of Prometheus", text: `Join my table — code ${code}`, url: link }) } catch { /* closed the sheet */ }
  }

  const btn = "flex items-center justify-center gap-1.5 rounded-sm border border-[#3d3428] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-stone-300 hover:border-[#c9a868] hover:text-[#e8c56a] disabled:opacity-40"
  return (
    <div className="mt-6 rounded-sm border border-[#3d3428] bg-black/50 text-left">
      <div className="border-b border-[#2a241e] px-4 py-2 text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">Invite to the table</div>
      <div className="flex flex-col items-center gap-5 px-4 py-4 sm:flex-row sm:items-start">
        {qr && (
          <div
            className="h-36 w-36 shrink-0 overflow-hidden rounded-sm border-2 border-[#8a6a3a] [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label={`QR code for ${link}`}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        )}
        <div className="w-full min-w-0 flex-1 text-center sm:text-left">
          <div className="text-[10px] uppercase tracking-[0.35em] text-stone-500">Room code</div>
          <div className="font-serif text-4xl tracking-[0.5em] text-[#e8c56a]">{code}</div>
          <div className="mt-1 truncate text-[12px] text-stone-500">{link}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button type="button" onClick={copy} className={btn}><Copy className="h-3.5 w-3.5" /> Copy link</button>
            {canShare && <button type="button" onClick={share} className={btn}><Share2 className="h-3.5 w-3.5" /> Share</button>}
            <button type="button" disabled={busy} onClick={onNewCode} className={btn}><RefreshCw className="h-3.5 w-3.5" /> New code</button>
          </div>
          <p className="mt-2 min-h-[1.25rem] text-[12px] text-[#d9bd7e]" aria-live="polite">{said}</p>
          <p className="text-[12px] text-stone-600">Whoever follows the link gets a seat. Removing someone changes the code.</p>
        </div>
      </div>
    </div>
  )
}
