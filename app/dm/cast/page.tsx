"use client"

// /dm/cast — THE CAST: every agent's whole package in one place (Sam, 2026-11-23: "I want an artifact or module where
// I can deal with the agents with their knowledge, abilities, character aspects and actor aspects, files repository,
// video files, pixel art, (essentially the whole package)").
//
// Two sides to each agent (project doc claude/NPC_Agents_The_Cast_2026-11-23.md):
//   CHARACTER — who they are in the story: the card (bible, agenda, secret, voice), their sheet, what they can do.
//   ACTOR     — how Sam wants them played: coaching notes (they reach the game on the next line), the chattiness dial.
// Plus what they lived through this run (memory, standing toward each hero), and their media: voice, portrait, idle
// and talking loops, films, pixel sprites, and a shelf of files (agents/<key>/ in storage) Sam can upload to.
//
// DM only, reads included: the cards carry DM secrets. Everything goes through /api/cast, which re-checks the DM
// code. This page plays what exists; it never generates art or voice except a test line in their saved voice when
// Sam presses Speak.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Brain, Crown, FileText, Film, Map as MapIcon, Mic, Sparkles, Swords, Theater, Upload, UserRound, Users } from "lucide-react"
import { dmHeaders, hasDmKey, onDmKeyChange, setDmKey } from "@/lib/dm-key"
import { createClient } from "@/lib/supabase/client"
import { BUCKET, fileKind } from "@/lib/cast"

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const TABS = [
  { id: "character", label: "Character", icon: UserRound },
  { id: "actor", label: "Actor", icon: Theater },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "abilities", label: "Abilities", icon: Swords },
  { id: "media", label: "Voice & Video", icon: Film },
  { id: "pixel", label: "Pixel Art", icon: Sparkles },
  { id: "files", label: "Files", icon: FileText },
] as const
type TabId = (typeof TABS)[number]["id"]

const gold = "text-[#e8c56a]"
const panel = "rounded-sm border border-[#3d3428] bg-black/40 p-4"
const label = "mb-1 block font-serif text-[11px] uppercase tracking-[0.18em] text-[#c4a777]"
const input = "w-full rounded-sm border border-[#7a5f33]/50 bg-black/60 px-2 py-1.5 text-sm text-stone-100 placeholder:text-stone-600 focus:border-[#c9a868] focus:outline-none"
const btn = "rounded-sm border border-[#c9a868] bg-[#c4a777]/12 px-3 py-1 text-[11px] uppercase tracking-wider text-[#f0dcae] hover:bg-[#c4a777]/20 disabled:opacity-50"

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...dmHeaders(), ...(init.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return body
}

export default function CastPage() {
  const [keySet, setKeySet] = useState(true)
  const [draft, setDraft] = useState("")
  const [agents, setAgents] = useState<Json[]>([])
  const [sel, setSel] = useState<string>("malachar")
  const [pkg, setPkg] = useState<Json | null>(null)
  const [tab, setTab] = useState<TabId>("character")
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sync = () => setKeySet(hasDmKey())
    sync()
    return onDmKeyChange(sync)
  }, [])

  const loadList = useCallback(async () => {
    try { setAgents((await api("/api/cast")).agents ?? []); setErr(null) } catch (e) { setErr(String((e as Error).message)) }
  }, [])
  const loadOne = useCallback(async (key: string) => {
    setBusy(true)
    try { setPkg(await api(`/api/cast?agent=${encodeURIComponent(key)}`)); setErr(null) } catch (e) { setErr(String((e as Error).message)); setPkg(null) }
    setBusy(false)
  }, [])
  useEffect(() => { loadList() }, [loadList, keySet])
  useEffect(() => { loadOne(sel) }, [loadOne, sel, keySet])
  const refresh = () => { loadOne(sel); loadList() }

  const link = "inline-flex items-center gap-1.5 font-serif text-xs uppercase tracking-[0.18em] text-[#e8c56a] hover:text-[#fff3cf]"
  return (
    <main className="flex h-dvh flex-col bg-[radial-gradient(circle_at_top,#1d1509,#0a0806_65%)] text-stone-200">
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#3d3428] px-5 py-3">
        <h1 className="inline-flex items-center gap-2 font-serif text-lg tracking-wide text-[#c4a777]"><Users className="h-4 w-4" aria-hidden />The Cast</h1>
        <p className="hidden min-w-0 flex-1 truncate text-[12px] text-stone-500 md:block">Each agent's whole package: who they are, how to play them, what they remember, and everything they're made of.</p>
        <nav className="ml-auto flex items-center gap-5">
          <a href="/velkynvelve" className={link}><MapIcon className="h-3.5 w-3.5" aria-hidden />The Map</a>
          <a href="/cinematics" className={link}><Film className="h-3.5 w-3.5" aria-hidden />Cinematics</a>
          <a href="/table" className={link}><Crown className="h-3.5 w-3.5" aria-hidden />The Table</a>
        </nav>
      </header>

      {/* The DM door's cookie is enough; the strip only shows when nothing let us in. */}
      {!keySet && !agents.length ? (
        <form className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-700/40 bg-amber-900/15 px-5 py-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setDmKey(draft); setDraft("") } }}>
          <label htmlFor="dm-code" className="text-[12px] text-amber-200">The Cast holds DM secrets. Enter the DM code:</label>
          <input id="dm-code" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" placeholder="the DM code" className="w-44 rounded-sm border border-[#7a5f33]/70 bg-black/60 px-2 py-1 font-mono text-sm" />
          <button type="submit" disabled={!draft.trim()} className={btn}>Unlock</button>
        </form>
      ) : null}
      {err ? <div className="shrink-0 border-b border-red-900/50 bg-red-950/30 px-5 py-1.5 text-[12px] text-red-300">{err}</div> : null}

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-[#3d3428] p-2">
          {agents.map((a) => (
            <button key={a.key} onClick={() => setSel(a.key)} className={`mb-1 flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left ${sel === a.key ? "border-[#c9a868] bg-[#c4a777]/10" : "border-transparent hover:border-[#3d3428]"}`}>
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#3d3428] bg-black">
                {a.face ? <img src={a.face} alt="" className="h-full w-full object-cover" style={{ objectPosition: "center 14%" }} /> : <div className="grid h-full place-items-center font-serif text-[#c4a777]">{a.name[0]}</div>}
              </div>
              <div className="min-w-0">
                <div className="truncate font-serif text-sm text-stone-100">{a.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-stone-500">{a.role} · {a.memories} mem · {a.coaching} notes</div>
              </div>
            </button>
          ))}
          <div className="mt-3 rounded-sm border border-dashed border-[#3d3428] p-2 text-[11px] text-stone-500">
            <span className="mr-1 rounded bg-[#c4a777]/15 px-1 text-[9px] uppercase tracking-wider text-[#c4a777]">soon</span>
            The Green Room: talk to each actor out of character.
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {pkg ? (
            <>
              <div className="flex shrink-0 items-end gap-4 border-b border-[#3d3428] px-5 pt-3">
                <div className="pb-2">
                  <div className={`font-serif text-xl ${gold}`}>{pkg.card.name}</div>
                  <div className="text-[11px] uppercase tracking-wider text-stone-500">{pkg.card.role}{pkg.sheet ? ` · ${pkg.sheet.class ?? ""} ${pkg.sheet.level ? `L${pkg.sheet.level}` : ""}` : ""}</div>
                </div>
                <nav className="ml-auto flex flex-wrap gap-1">
                  {TABS.map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] uppercase tracking-wider ${tab === t.id ? "border-[#c9a868] text-[#f0dcae]" : "border-transparent text-stone-500 hover:text-stone-300"}`}>
                      <t.icon className="h-3.5 w-3.5" aria-hidden />{t.label}
                    </button>
                  ))}
                </nav>
              </div>
              <div className={`min-h-0 flex-1 overflow-y-auto p-5 ${busy ? "opacity-60" : ""}`}>
                {tab === "character" && <CharacterTab pkg={pkg} onSaved={refresh} />}
                {tab === "actor" && <ActorTab pkg={pkg} onSaved={refresh} />}
                {tab === "memory" && <MemoryTab pkg={pkg} onChanged={refresh} />}
                {tab === "abilities" && <AbilitiesTab pkg={pkg} />}
                {tab === "media" && <MediaTab pkg={pkg} />}
                {tab === "pixel" && <PixelTab pkg={pkg} />}
                {tab === "files" && <FilesTab pkg={pkg} onChanged={refresh} />}
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-stone-500">{busy ? "Summoning…" : "Pick an agent."}</div>
          )}
        </section>
      </div>
    </main>
  )
}

// --- Character: the card -------------------------------------------------------------------------------------------

function CharacterTab({ pkg, onSaved }: { pkg: Json; onSaved: () => void }) {
  const c = pkg.card
  const [bible, setBible] = useState(c.bible ?? "")
  const [agenda, setAgenda] = useState({ wants: c.agenda?.wants ?? "", fears: c.agenda?.fears ?? "", secret: c.agenda?.secret ?? "", turns: c.agenda?.turns ?? "" })
  const [voice, setVoice] = useState(c.voice_note ?? "")
  const [sources, setSources] = useState(c.sources ?? "")
  const [msg, setMsg] = useState("")
  useEffect(() => {
    setBible(c.bible ?? ""); setVoice(c.voice_note ?? ""); setSources(c.sources ?? "")
    setAgenda({ wants: c.agenda?.wants ?? "", fears: c.agenda?.fears ?? "", secret: c.agenda?.secret ?? "", turns: c.agenda?.turns ?? "" })
  }, [c])
  const save = async () => {
    try { await api("/api/cast", { method: "PATCH", body: JSON.stringify({ agent: c.key, bible, agenda, voice_note: voice, sources }) }); setMsg("Saved. The game reads it within a minute."); onSaved() } catch (e) { setMsg(String((e as Error).message)) }
  }
  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <div className={panel}>
        <span className={label}>Who they are (the bible)</span>
        <textarea value={bible} onChange={(e) => setBible(e.target.value)} rows={6} className={input} />
        <span className={`${label} mt-3`}>How they talk</span>
        <textarea value={voice} onChange={(e) => setVoice(e.target.value)} rows={3} className={input} />
        {pkg.media?.description ? <p className="mt-3 text-[12px] text-stone-400"><span className="text-stone-500">Encounter row says: </span>{pkg.media.description}</p> : null}
      </div>
      <div className={panel}>
        {(["wants", "fears", "turns"] as const).map((k) => (
          <div key={k} className="mb-3">
            <span className={label}>{k === "turns" ? "What turns them" : k}</span>
            <input value={agenda[k]} onChange={(e) => setAgenda({ ...agenda, [k]: e.target.value })} className={input} />
          </div>
        ))}
        <span className={`${label} text-red-300`}>Secret (players never see this page)</span>
        <input value={agenda.secret} onChange={(e) => setAgenda({ ...agenda, secret: e.target.value })} className={`${input} border-red-900/60`} />
      </div>
      <div className={`${panel} lg:col-span-2`}>
        <span className={label}>Where this card came from</span>
        <textarea value={sources} onChange={(e) => setSources(e.target.value)} rows={2} className={input} />
        <div className="mt-3 flex items-center gap-3"><button onClick={save} className={btn}>Save the card</button><span className="text-[12px] text-stone-400">{msg}</span></div>
      </div>
    </div>
  )
}

// --- Actor: coaching -----------------------------------------------------------------------------------------------

function ActorTab({ pkg, onSaved }: { pkg: Json; onSaved: () => void }) {
  const c = pkg.card
  const [note, setNote] = useState("")
  const [scope, setScope] = useState("both")
  const [chat, setChat] = useState<number>(c.chattiness ?? 3)
  useEffect(() => setChat(c.chattiness ?? 3), [c])
  const add = async () => { if (note.trim().length < 3) return; await api("/api/cast", { method: "POST", body: JSON.stringify({ action: "coach", agent: c.key, note, scope }) }); setNote(""); onSaved() }
  const toggle = async (id: string, active: boolean) => { await api("/api/cast", { method: "POST", body: JSON.stringify({ action: "coach-toggle", id, active }) }); onSaved() }
  const saveChat = async (v: number) => { setChat(v); await api("/api/cast", { method: "PATCH", body: JSON.stringify({ agent: c.key, chattiness: v }) }) }
  // THE OPTION BANK (lib/option-bank.ts): options already written, tried before any model call.
  const [bank, setBank] = useState(JSON.stringify(c.option_bank ?? [], null, 1))
  const [bankMsg, setBankMsg] = useState("")
  useEffect(() => setBank(JSON.stringify(c.option_bank ?? [], null, 1)), [c])
  const saveBank = async () => {
    let parsed: unknown
    try { parsed = JSON.parse(bank) } catch { setBankMsg("That is not valid JSON: nothing saved."); return }
    if (!Array.isArray(parsed)) { setBankMsg("The bank is a list [ … ]: nothing saved."); return }
    try { await api("/api/cast", { method: "PATCH", body: JSON.stringify({ agent: c.key, option_bank: parsed }) }); setBankMsg("Saved. The next routine beat draws from it."); onSaved() } catch (e) { setBankMsg(String((e as Error).message)) }
  }
  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-[2fr_1fr]">
      <div className={panel}>
        <span className={label}>Coach the actor</span>
        <p className="mb-2 text-[12px] text-stone-400">Notes on how to <em>play</em> {c.name}. They reach the game on the next line, and New Game keeps them.</p>
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={`e.g. "${c.name.split(" ")[0]} talks too much at camp"`} className={input} />
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-sm border border-[#7a5f33]/50 bg-black/60 px-2 text-sm">
            <option value="both">Everywhere</option><option value="stage">In the game</option><option value="offstage">Green Room</option>
          </select>
          <button onClick={add} className={btn}>Add</button>
        </div>
        <ul className="mt-4 space-y-1.5">
          {pkg.coaching.length === 0 ? <li className="text-[12px] text-stone-500">No notes yet.</li> : null}
          {pkg.coaching.map((n: Json) => (
            <li key={n.id} className={`flex items-start gap-2 rounded-sm border border-[#3d3428] px-2 py-1.5 text-sm ${n.active ? "" : "opacity-40 line-through"}`}>
              <span className="flex-1">{n.note}</span>
              <span className="text-[10px] uppercase text-stone-500">{n.scope}</span>
              <button onClick={() => toggle(n.id, !n.active)} className="text-[10px] uppercase tracking-wider text-[#c4a777] hover:text-[#f0dcae]">{n.active ? "switch off" : "switch on"}</button>
            </li>
          ))}
        </ul>
      </div>
      <div className={`${panel} lg:col-span-2 lg:row-start-2`}>
        <span className={label}>The options {c.name.split(" ")[0]} laid on the table</span>
        <p className="mb-2 text-[12px] text-stone-400">Every option is germane to the moment or bait on purpose (Sam, 2026-11-23). Players never see these tags. A ✓ marks the one they took.</p>
        <ul className="space-y-2">
          {(pkg.options ?? []).length === 0 ? <li className="text-[12px] text-stone-500">None yet. They gather as players are offered options.</li> : null}
          {(pkg.options ?? []).map((o: Json, i: number) => (
            <li key={i} className="rounded-sm border border-[#3d3428] px-2 py-1.5">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-stone-500">{new Date(o.created_at).toLocaleString()} · <span className={o.source === "bank" ? "text-[#9fe6a8]" : ""}>{o.source === "bank" ? "from the bank (no model)" : "written by the model"}</span> · {o.moment?.plate ?? "somewhere"}{o.moment?.talkingTo ? ` · with ${o.moment.talkingTo}` : ""}{o.moment?.fight ? " · in a fight" : ""}</div>
              <ul className="space-y-0.5">
                {(o.suggestions ?? []).map((sg: Json, j: number) => (
                  <li key={j} className="flex items-center gap-2 text-sm">
                    <span className={`w-14 shrink-0 rounded px-1 text-center text-[9px] uppercase ${sg.intent === "bait" ? "bg-red-900/40 text-red-300" : "bg-[#c4a777]/15 text-[#c4a777]"}`}>{sg.intent === "bait" ? "bait" : sg.kind === "observe" ? "look" : "germane"}</span>
                    <span className="flex-1">{sg.text}</span>
                    {o.picked && o.picked === sg.text ? <span className="text-[#9fe6a8]">✓</span> : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <div className={`${panel} lg:col-span-2 lg:row-start-3`}>
        <span className={label}>{c.name.split(" ")[0]}&apos;s option bank (answers routine beats with no model call)</span>
        <p className="mb-2 text-[12px] text-stone-400">
          Each entry: <code>text</code> (60 characters), <code>skill</code>, <code>bait: true</code> or <code>observe: true</code>, and <code>when</code>: <code>plates</code> (e.g. &quot;11&quot; the pen), <code>fight</code>, <code>talking</code> (talking to {c.name.split(" ")[0]}), <code>with</code> (who must be there). Optional <code>needs</code> (an item word) and <code>notIf</code> (conditions). The model is still used when a player has just spoken, or when fewer than two entries fit.
        </p>
        <textarea value={bank} onChange={(e) => setBank(e.target.value)} rows={10} spellCheck={false} className={`${input} font-mono text-[12px]`} />
        <div className="mt-2 flex items-center gap-3"><button onClick={saveBank} className={btn}>Save the bank</button><span className="text-[12px] text-stone-400">{bankMsg}</span></div>
      </div>
      <div className={`${panel} lg:row-start-1 lg:col-start-2`}>
        <span className={label}>Chattiness</span>
        <input type="range" min={0} max={10} value={chat} onChange={(e) => saveChat(Number(e.target.value))} className="w-full accent-[#c9a868]" />
        <div className="flex justify-between text-[10px] text-stone-500"><span>silent</span><span className={gold}>{chat}</span><span>never shuts up</span></div>
        <p className="mt-2 text-[11px] text-stone-500"><span className="mr-1 rounded bg-[#c4a777]/15 px-1 text-[9px] uppercase text-[#c4a777]">soon</span>Saved now; the game starts obeying it with the attention-budget PR.</p>
      </div>
    </div>
  )
}

// --- Memory: what they lived through this run ------------------------------------------------------------------------

function MemoryTab({ pkg, onChanged }: { pkg: Json; onChanged: () => void }) {
  const [msg, setMsg] = useState("")
  const remember = async () => {
    setMsg("Remembering…")
    try { const r = (await api("/api/cast", { method: "POST", body: JSON.stringify({ action: "remember", agent: pkg.card.key }) })).result; setMsg(`${r.reason}${r.written != null ? ` (${r.written} new)` : ""}`); onChanged() } catch (e) { setMsg(String((e as Error).message)) }
  }
  const forget = async (id: string) => { await api("/api/cast", { method: "POST", body: JSON.stringify({ action: "forget", id }) }); onChanged() }
  const dims = ["trust", "fear", "respect", "affection", "debt", "resentment"]
  return (
    <div className="grid max-w-6xl gap-4 xl:grid-cols-[3fr_2fr]">
      <div className={panel}>
        <div className="mb-2 flex items-center gap-3">
          <span className={label}>What {pkg.card.name} remembers of this run</span>
          <button onClick={remember} className={`${btn} ml-auto`}>Remember now</button>
        </div>
        {msg ? <p className="mb-2 text-[12px] text-stone-400">{msg}</p> : null}
        <ul className="space-y-1.5">
          {pkg.memories.length === 0 ? <li className="text-[12px] text-stone-500">Nothing yet. Memories gather after conversations and events once this lane is merged.</li> : null}
          {pkg.memories.map((m: Json) => (
            <li key={m.id} className="flex items-center gap-3 rounded-sm border border-[#3d3428] px-2 py-1.5 text-sm">
              <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded bg-stone-800" title={`gravity ${m.gravity}`}><div className="h-full bg-[#c9a868]" style={{ width: `${m.gravity}%` }} /></div>
              <span className="flex-1">{m.line}</span>
              {m.about ? <span className="text-[10px] uppercase text-stone-500">{m.about}</span> : null}
              <button onClick={() => forget(m.id)} className="text-[10px] uppercase tracking-wider text-stone-500 hover:text-red-300">forget</button>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div className={panel}>
          <span className={label}>How they feel about each hero</span>
          {pkg.card.role === "dm" ? <p className="text-[12px] text-stone-500">Malachar has no feelings to measure. He remembers.</p> : pkg.standing.length === 0 ? <p className="text-[12px] text-stone-500">No history with anyone yet.</p> : (
            <table className="w-full text-[12px]">
              <thead><tr className="text-stone-500"><th className="text-left font-normal">hero</th>{dims.map((d) => <th key={d} className="font-normal">{d.slice(0, 4)}</th>)}</tr></thead>
              <tbody>{pkg.standing.map((s: Json) => (
                <tr key={s.object_id} title={s.last_reason ?? ""}><td>{s.hero}</td>{dims.map((d) => <td key={d} className={`text-center ${s[d] > 0 ? "text-emerald-300" : s[d] < 0 ? "text-red-300" : "text-stone-600"}`}>{s[d]}</td>)}</tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <div className={panel}>
          <span className={label}>Lines on record</span>
          <p className="mb-2 text-[12px] text-stone-400">{pkg.lines.archived} archived lines spoken by {pkg.card.name}. The latest:</p>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-[12px] text-stone-300">
            {pkg.lines.recent.map((l: Json, i: number) => <li key={i} className="border-l border-[#3d3428] pl-2">{String(l.text).slice(0, 220)}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

// --- Abilities: the sheet and what the game does with them -----------------------------------------------------------

function AbilitiesTab({ pkg }: { pkg: Json }) {
  const s = pkg.sheet
  const list = (v: unknown) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v as object).flat() : [])
  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <div className={panel}>
        <span className={label}>In the game today</span>
        <ul className="space-y-1.5 text-sm">
          {pkg.abilities.length === 0 ? <li className="text-[12px] text-stone-500">Nothing special built for them yet.</li> : null}
          {pkg.abilities.map((a: Json, i: number) => <li key={i}>{a.what} <span className="text-[10px] text-stone-500">— {a.from}</span></li>)}
        </ul>
      </div>
      <div className={panel}>
        <span className={label}>Sheet</span>
        {s ? (
          <>
            <p className="text-sm">{[s.species, s.class, s.level ? `level ${s.level}` : ""].filter(Boolean).join(" · ")} — AC {s.ac ?? "?"}, HP {s.hp_current ?? "?"}/{s.hp_max ?? "?"}</p>
            <div className="mt-2 grid grid-cols-6 gap-1 text-center text-[11px]">
              {Object.entries(s.scores).map(([k, v]) => <div key={k} className="rounded-sm border border-[#3d3428] py-1"><div className="uppercase text-stone-500">{k}</div><div className={gold}>{String(v ?? "–")}</div></div>)}
            </div>
            {list(s.attacks).length ? <><span className={`${label} mt-3`}>Attacks</span><ul className="text-[12px]">{list(s.attacks).map((a: Json, i: number) => <li key={i}>{typeof a === "string" ? a : [a.name, a.bonus != null ? `+${a.bonus}` : a.attack_bonus != null ? `+${a.attack_bonus}` : "", a.damage].filter(Boolean).join(" · ")}</li>)}</ul></> : null}
            {s.spellcasting ? <><span className={`${label} mt-3`}>Spells</span><p className="text-[12px] text-stone-300">{[...list(s.spellcasting.cantrips), ...list(s.spellcasting.prepared)].map((x: Json) => (typeof x === "string" ? x : x?.name)).filter(Boolean).join(", ") || "none listed"}</p></> : null}
          </>
        ) : <p className="text-[12px] text-stone-500">{pkg.card.role === "dm" ? "Malachar has no sheet. He is the rules." : "No characters row linked."}</p>}
        {pkg.bestiary ? <p className="mt-3 text-[12px] text-stone-400">Bestiary block: {pkg.bestiary.name} (CR {pkg.bestiary.challenge_rating ?? pkg.bestiary.cr ?? "?"})</p> : null}
      </div>
    </div>
  )
}

// --- Voice & Video ------------------------------------------------------------------------------------------------

function MediaTab({ pkg }: { pkg: Json }) {
  const m = pkg.media
  const [text, setText] = useState("")
  const [state, setState] = useState("")
  const speak = async () => {
    if (!text.trim()) return
    setState("…")
    try {
      const res = await fetch("/api/npc-tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, npcName: pkg.card.name, voiceId: m?.voice_id ?? undefined }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const url = URL.createObjectURL(await res.blob())
      await new Audio(url).play()
      setState("")
    } catch (e) { setState(String((e as Error).message)) }
  }
  const films = [...pkg.films.map((f: Json) => ({ title: f.state, note: f.moment, url: f.video_url, retired: f.retired })), ...pkg.lich.map((f: Json) => ({ title: `lich · ${f.state}`, note: "", url: f.video_url }))]
  return (
    <div className="max-w-6xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={panel}><span className={label}>Canon face</span>{m?.face ? <img src={m.face} alt="" className="max-h-72 w-full object-contain" /> : <p className="text-[12px] text-stone-500">None.</p>}</div>
        <div className={panel}><span className={label}>Idle loop</span>{m?.idle ? <video src={m.idle} muted loop autoPlay playsInline className="max-h-72 w-full object-contain" /> : <p className="text-[12px] text-stone-500">None.</p>}</div>
        <div className={panel}><span className={label}>Talking loop</span>{m?.talking ? <video src={m.talking} muted loop autoPlay playsInline className="max-h-72 w-full object-contain" /> : <p className="text-[12px] text-stone-500">None.</p>}</div>
      </div>
      <div className={panel}>
        <span className={label}><Mic className="mr-1 inline h-3 w-3" />Voice</span>
        <p className="text-[12px] text-stone-400">{m?.voice_id ? <>ElevenLabs <code className="text-stone-300">{m.voice_id}</code>{m.voice_description ? ` — ${m.voice_description}` : ""}</> : pkg.card.role === "dm" ? "Malachar's voice is set in the game's TTS (\"Malachar (rotted lich, 2026-11)\")." : "No saved voice."}{m?.languages ? ` · speaks ${m.languages}` : ""}</p>
        {pkg.card.role !== "dm" ? (
          <div className="mt-2 flex gap-2"><input value={text} onChange={(e) => setText(e.target.value)} placeholder="A test line in their voice" className={input} /><button onClick={speak} className={btn}>Speak</button><span className="text-[12px] text-stone-400">{state}</span></div>
        ) : null}
      </div>
      <div className={panel}>
        <span className={label}>Films ({films.length})</span>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {films.length === 0 ? <p className="text-[12px] text-stone-500">No films name them.</p> : null}
          {films.map((f: Json, i: number) => (
            <div key={i} className={`rounded-sm border border-[#3d3428] p-2 ${f.retired ? "opacity-50" : ""}`}>
              <div className="mb-1 text-[12px] text-stone-200">{f.title}{f.retired ? " (retired)" : ""}</div>
              {f.url ? <video src={f.url} controls preload="none" className="w-full" /> : <p className="text-[11px] text-amber-300/80">awaiting film</p>}
              {f.note ? <p className="mt-1 text-[11px] text-stone-500">{f.note}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Pixel Art -----------------------------------------------------------------------------------------------------

function PixelTab({ pkg }: { pkg: Json }) {
  const [man, setMan] = useState<Json | null>(null)
  const [dir, setDir] = useState(0)
  useEffect(() => {
    setMan(null)
    if (!pkg.sprite) return
    fetch(pkg.sprite).then((r) => (r.ok ? r.json() : null)).then(setMan).catch(() => setMan(null))
  }, [pkg.sprite])
  if (!pkg.sprite) return <p className="text-sm text-stone-500">{pkg.card.role === "dm" ? "Malachar has no sprite on the map; his face is the cartoon lich in Talk to Malachar." : "No sprite folder on the card."}</p>
  if (!man) return <p className="text-sm text-stone-500">Loading {pkg.sprite}…</p>
  const base = pkg.sprite.replace(/sprite\.json$/, "")
  return (
    <div className="max-w-6xl">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-stone-400">
        Facing <input type="range" min={0} max={7} value={dir} onChange={(e) => setDir(Number(e.target.value))} className="w-32 accent-[#c9a868]" /> row {dir}
        <span className="ml-4">cell {man.cell?.join("×")} · {man.ppu} px per 5 ft</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Object.entries(man.animations ?? {}).map(([name, a]) => (
          <div key={name} className={`${panel} flex flex-col items-center`}>
            <SpriteLoop src={base + (a as Json).sheet} cell={man.cell} frames={(a as Json).frames} fps={(a as Json).fps} row={dir} />
            <div className="mt-2 font-serif text-[12px] uppercase tracking-wider text-[#c4a777]">{name}</div>
            <a href={base + (a as Json).sheet} target="_blank" rel="noreferrer" className="text-[10px] text-stone-500 hover:text-stone-300">{(a as Json).frames} frames · sheet</a>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpriteLoop({ src, cell, frames, fps, row }: { src: string; cell: [number, number]; frames: number; fps: number; row: number }) {
  const [f, setF] = useState(0)
  useEffect(() => { const t = setInterval(() => setF((x) => (x + 1) % Math.max(1, frames)), 1000 / Math.max(1, fps || 8)); return () => clearInterval(t) }, [frames, fps])
  const [w, h] = cell ?? [128, 128]
  return <div style={{ width: w, height: h, backgroundImage: `url(${src})`, backgroundPosition: `-${f * w}px -${row * h}px`, imageRendering: "pixelated" }} aria-label="sprite" />
}

// --- Files ---------------------------------------------------------------------------------------------------------

function FilesTab({ pkg, onChanged }: { pkg: Json; onChanged: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState("")
  const supabase = useMemo(() => createClient(), [])
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      setMsg(`Uploading ${file.name}…`)
      try {
        const { path, token } = await api("/api/cast", { method: "POST", body: JSON.stringify({ action: "upload-url", agent: pkg.card.key, filename: file.name }) })
        const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, file, { contentType: file.type || undefined })
        if (error) throw error
      } catch (e) { setMsg(`${file.name}: ${String((e as Error).message)}`); return }
    }
    setMsg("Uploaded.")
    onChanged()
  }
  const shelf = pkg.files.filter((f: Json) => f.shelf)
  const found = pkg.files.filter((f: Json) => !f.shelf)
  const Card = ({ f }: { f: Json }) => {
    const kind = fileKind(f.path)
    return (
      <a href={f.url} target="_blank" rel="noreferrer" className="block rounded-sm border border-[#3d3428] p-2 hover:border-[#7a5f33]">
        <div className="mb-1 grid h-28 place-items-center overflow-hidden bg-black/50">
          {kind === "image" ? <img src={f.url} alt="" className="max-h-28 object-contain" /> : kind === "video" ? <video src={f.url} preload="metadata" muted className="max-h-28" /> : <FileText className="h-8 w-8 text-stone-600" />}
        </div>
        <div className="truncate text-[11px] text-stone-300" title={f.path}>{f.path.split("/").pop()}</div>
        <div className="text-[10px] text-stone-500">{f.path.split("/")[0]}{f.size ? ` · ${(f.size / 1024 / 1024).toFixed(1)} MB` : ""}</div>
      </a>
    )
  }
  return (
    <div className="max-w-6xl space-y-4">
      <div className={panel}>
        <div className="mb-2 flex items-center gap-3">
          <span className={label}>{pkg.card.name}'s shelf</span>
          <button onClick={() => ref.current?.click()} className={`${btn} ml-auto inline-flex items-center gap-1`}><Upload className="h-3 w-3" />Upload</button>
          <input ref={ref} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
        <p className="mb-2 text-[12px] text-stone-400">References, scripts, art, anything that belongs to them. Stored in <code>agents/{pkg.card.key}/</code>; nothing is ever overwritten. {msg}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">{shelf.length ? shelf.map((f: Json) => <Card key={f.path} f={f} />) : <p className="text-[12px] text-stone-500">Empty.</p>}</div>
      </div>
      <div className={panel}>
        <span className={label}>Found in the game's media ({found.length})</span>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">{found.map((f: Json) => <Card key={f.path} f={f} />)}</div>
      </div>
    </div>
  )
}
