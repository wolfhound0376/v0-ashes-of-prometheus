"use client"

// The travel map's cards and panels, shared by the 2D map and the 3D diorama (Sam, 2026-10-27: make the diorama the
// real travel map). Moved VERBATIM out of underdark-map.tsx: the road choice, the departure sheet (pace, navigator),
// the entrance, the options card and its result, the arrival line and beat, the hover price, the DM's day HUD and
// the halt card (TravelCards, drawn over the map), then the boats and who-leads panels (TravelPanels, under it).
// Both read the one march in ./use-travel.ts, so the two views cannot drift.

import { StageLink } from "@/components/stage/stage-provider"
import { battleHref } from "@/lib/travel/battle"
import { VESSELS, seats } from "@/lib/travel/vessels"
import { MARCH_HOURS_PER_DAY, PACES, fatigue, legPreview } from "@/lib/travel/march"
import { isRoadMarker } from "@/lib/travel/standing"
import type { NodeRow, useTravel } from "./use-travel"

export type Travel = ReturnType<typeof useTravel>

export function TravelCards({ t, embedded = false }: { t: Travel; embedded?: boolean }) {
  const {
    nodes, edges, party, loaded, dmKey, setRefresh,
    confirmNode, setConfirmNode, arrivedAt, setArrivedAt,
    halt, continueMarch, takeStance, stanceBusy,
    vessels, hasBoat, march, guides, pcs,
    pace, setPace, navSel, setNavSel, pcFamiliar, setPcFamiliar, pcHasMap, setPcHasMap,
    me, lead, canLead, hoverNode, setHoverNode,
    beat, options, setOptions, chosen, setChosen, entrance, setEntrance, entering,
    arrival, roadChoice, setRoadChoice,
    boatAction, dmAction, chooseOption, enterPlace, leadAction, setOut,
    routeMiles, routeBetween, byId,
  } = t
  return (
    <>
        {roadChoice && !confirmNode && (
          <div className="absolute inset-0 grid place-items-center bg-[#05030acc] p-3">
            <div className="rounded-lg border-2 border-[#f5c34d] bg-[#171024] px-6 py-5 w-full max-w-[52ch]">
              <div className="text-[#9a8fb0] text-xs tracking-widest">OUT OF {(arrival?.from ?? "the outpost").toUpperCase()}</div>
              <div className="text-[#f5c34d] text-base font-bold tracking-widest mt-2">{arrival?.name ?? "The cavern floor"}. Which way?</div>
              <div className="text-[#9a8fb0] text-xs mt-1">The roads the map knows from here. Pick one.</div>
              <div className="mt-4 grid gap-2">
                {roadChoice.map((r) => (
                  <button
                    key={r.node.id}
                    onClick={() => { setRoadChoice(null); setConfirmNode(r.node as NodeRow) }}
                    className="rounded border-2 border-[#c99a49] bg-[#2a1f10] px-4 py-2 text-left text-xs font-bold uppercase tracking-widest text-[#f5c34d] hover:bg-[#3a2a14]"
                  >
                    The road {r.heading}
                    <span className="block text-[10px] font-normal normal-case tracking-normal text-[#c9bcd8]">
                      {(r.node as NodeRow).name && (dmKey || (r.node as NodeRow).name_known !== false) ? (r.node as NodeRow).name : "A road into the dark"}
                    </span>
                  </button>
                ))}
                <button onClick={() => setRoadChoice(null)} className="rounded border-2 border-[#3a2c56] bg-[#221936] px-4 py-2 text-xs uppercase tracking-widest text-[#9a8fb0]">
                  Stay at the gates
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmNode && (() => {
          // The departure sheet. Sam (2026-11-12) on the pace and navigator questions: "We don't need this. You can
          // let us know how long we actually marched and why." So it only says how far and how long; the march
          // keeps the book's Normal pace, the leader finds the way, and the fatigue gauge keeps the day's ledger.
          const routeIds = party ? routeBetween(party.node_id, confirmNode.id) : []
          const miles = routeMiles(routeIds)
          const pv = routeIds.length >= 2 ? legPreview(march, miles, march.day_miles) : null
          const hoursFmt = (h: number) => `${Math.round(h * 10) / 10} h`
          return (
          <div className="absolute inset-0 grid place-items-center bg-[#05030acc] p-3">
            <div className="rounded-lg border-2 border-[#f5c34d] bg-[#171024] px-6 py-5 w-full max-w-[52ch] max-h-full overflow-y-auto">
              <div className="text-[#9a8fb0] text-xs tracking-widest">MALACHAR ASKS</div>
              <div className="text-[#f5c34d] text-base font-bold tracking-widest mt-2">
                Set out for {confirmNode.name ?? "this place"}?
              </div>
              <div className="text-[#9a8fb0] text-xs mt-1">
                {routeIds.length >= 2
                  ? `${Math.round(miles * 10) / 10} miles by road. They will walk every marker, stopping at each.`
                  : "They will walk every marker on the road, stopping at each."}
              </div>
              {party && routeIds.length < 2 && (
                <div className="text-[#e0a35c] text-xs mt-2">
                  {hasBoat
                    ? "No road or boat lane reaches it from here. They will be placed there, not walked."
                    : "No road reaches it on foot, and the party has no boat. They will be placed there, not walked."}
                </div>
              )}
              {pv && (
                <div className="mt-3 rounded border border-[#3a2c56] bg-[#221936] px-3 py-2 text-[11px] text-[#c9bcd8]">
                  About {hoursFmt(pv.hours)} of walking.{" "}
                  {pv.forced ? (
                    <span className="text-[#e08a8a]">That runs {hoursFmt(pv.endsAt - MARCH_HOURS_PER_DAY)} past today's {MARCH_HOURS_PER_DAY} hours: make camp on the way, or force the march.</span>
                  ) : (
                    <span>{hoursFmt(pv.left)} of today's {MARCH_HOURS_PER_DAY} left.</span>
                  )}
                  <div className="mt-1 text-[#9a8fb0]">Hours lost finding the way show on the fatigue gauge as they happen.</div>
                </div>
              )}

              <div className="flex gap-2 justify-center mt-4">
                <button
                  onClick={() => void setOut(confirmNode)}
                  className="text-xs px-4 py-2 rounded border-2 bg-[#f5c34d] border-[#f5c34d] text-[#120b1e] font-bold"
                >
                  SET OUT ⏎
                </button>
                <button
                  onClick={() => setConfirmNode(null)}
                  className="text-xs px-4 py-2 rounded border-2 bg-[#221936] border-[#3a2c56] text-[#9a8fb0]"
                >
                  NO — ESC
                </button>
              </div>
            </div>
          </div>
          )
        })()}

        {/* THE ENTRANCE. A great place the party has reached: the painted plate
            fills the map, the place names itself, and "Enter" steps off the
            overworld (the server validates that edge). Eight places are painted;
            everywhere else arrives as an ordinary stop. */}
        {entrance && !confirmNode && !halt && (
          <div className="absolute inset-0 z-20 grid place-items-end bg-[#05030a]">
            <img
              src={entrance.info.plate}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ animation: "aop-plate-in 1.2s cubic-bezier(.6,0,.2,1) both" }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #05030af2 0%, #05030a66 38%, transparent 70%)" }} />
            <div className="relative w-full px-6 pb-8 text-center">
              <div className="text-[11px] tracking-[.3em] text-[#9a8fb0]">THE PARTY ARRIVES AT</div>
              <div className="mt-1 font-serif text-3xl tracking-[.18em] text-[#f5c34d]" style={{ textShadow: "0 2px 18px #000" }}>
                {entrance.info.name.toUpperCase()}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {canLead && entrance.info.scene && (
                  <button
                    onClick={() => void enterPlace(entrance.node.node_key, entrance.info.scene, entrance.info.plate, entrance.info.name)}
                    disabled={entering}
                    className="rounded border-2 border-[#f5c34d] bg-[#f5c34d] px-5 py-2 text-xs font-bold tracking-[.2em] text-[#120b1e] disabled:opacity-60"
                  >
                    {entering ? "ENTERING…" : "ENTER →"}
                  </button>
                )}
                {canLead && !entrance.info.scene && (
                  <span className="rounded border border-[#3a2c56] bg-[#171024cc] px-4 py-2 text-[11px] text-[#9a8fb0]">
                    The gates stand open, but there is nothing built inside yet.
                  </span>
                )}
                <button
                  onClick={() => setEntrance(null)}
                  className="rounded border-2 border-[#3a2c56] bg-[#221936] px-4 py-2 text-xs tracking-[.2em] text-[#c9bcd8]"
                >
                  STAY ON THE MAP
                </button>
              </div>
            </div>
            <style>{`@keyframes aop-plate-in{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}`}</style>
          </div>
        )}

        {/* THE OPTIONS CARD (Sam: "a screen should pop up offering you options and
            their relative costs"). Every option here was authored on the node;
            a greyed one names what the party is missing. */}
        {options && !confirmNode && !halt && !entrance && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[#05030acc] p-3">
            <div className="w-full max-w-[52ch] rounded-lg border-2 border-[#f5c34d] bg-[#171024] px-6 py-5">
              <div className="text-[10px] uppercase tracking-[.22em] text-[#9a8fb0]">At {options.node.name ?? "this place"}</div>
              <div className="mt-1 font-serif text-lg text-[#f5c34d]">What do they do?</div>
              <div className="mt-4 grid gap-2">
                {options.list.map((o) => (
                  <button
                    key={o.key}
                    disabled={!o.available || !canLead}
                    onClick={() => void chooseOption(options.node.node_key, o.key)}
                    className={`rounded border px-3 py-2 text-left text-xs ${
                      o.available && canLead
                        ? "border-[#3a2c56] bg-[#221936] text-[#e4d8bf] hover:border-[#f5c34d]"
                        : "cursor-not-allowed border-[#2a2140] bg-[#1a1428] text-[#6f6486]"
                    }`}
                  >
                    <b className="tracking-wide">{o.label}</b>
                    {o.detail && <div className="mt-0.5 text-[11px] text-[#9a8fb0]">{o.detail}</div>}
                    <div className="mt-1 text-[11px] text-[#e0a35c]">{o.cost_line}</div>
                    {!o.available && <div className="mt-0.5 text-[11px] text-[#c96a6a]">The party has no {o.blocked_by.join(", ")}.</div>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setOptions(null)}
                className="mt-4 w-full rounded border border-[#3a2c56] bg-[#221936] py-2 text-xs tracking-[.2em] text-[#9a8fb0]"
              >
                WALK ON
              </button>
            </div>
          </div>
        )}

        {/* What the choice came to. */}
        {chosen && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[#05030acc] p-3">
            <div className={`w-full max-w-[52ch] rounded-lg border-2 ${chosen.success ? "border-[#5ec08a]" : "border-[#7a2b2b]"} bg-[#171024] px-6 py-5`}>
              <div className="text-[10px] uppercase tracking-[.22em] text-[#9a8fb0]">{chosen.success ? "It works" : "It does not"}</div>
              <div className="mt-1 font-serif text-lg text-[#f5c34d]">{chosen.label}</div>
              {chosen.roll && (
                <div className="mt-2 text-[11px] text-[#9a8fb0]">
                  <span className="text-[#f5c34d]">{chosen.roll.name}</span> · {chosen.roll.arithmetic}
                </div>
              )}
              {chosen.text && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[#c9bcd8]">{chosen.text}</p>}
              {chosen.revealed && <div className="mt-2 text-[12px] text-[#f5c34d]">The map grows: {chosen.revealed}.</div>}
              {chosen.line && (
                <div className="mt-3 border-t border-[#3a2c56] pt-3 font-serif text-[13px] italic text-[#e4d8bf]">
                  <span className="mr-2 not-italic text-[10px] tracking-[.2em] text-[#b44df5]">MALACHAR</span>
                  {chosen.line}
                </div>
              )}
              <button
                onClick={() => setChosen(null)}
                className="mt-4 w-full rounded border border-[#7a5c2b] bg-[#2a1f10] py-2 text-xs tracking-[.2em] text-[#f5c34d]"
              >
                ON WE GO
              </button>
            </div>
          </div>
        )}

        {arrivedAt && !confirmNode && !halt && (
          <div className="absolute left-1/2 -translate-x-1/2 top-3 rounded border-2 border-[#3a2c56] bg-[#171024ee] px-4 py-2 text-xs text-[#f5c34d] tracking-widest">
            ARRIVED: {(arrivedAt.name ?? "???").toUpperCase()}
          </div>
        )}

        {/* The arrival beat: the passive roll's chip, and Malachar's line when
            something happened. */}
        {beat && !confirmNode && (
          <div className="pointer-events-none absolute left-1/2 top-14 w-full max-w-[60ch] -translate-x-1/2 px-3">
            {beat.chip && (
              <div className={`mx-auto w-fit rounded-full border px-3 py-1 text-[11px] tracking-wide ${beat.noticed ? "border-[#f5c34d] bg-[#2a1f10ee] text-[#f5c34d]" : "border-[#3a2c56] bg-[#171024ee] text-[#9a8fb0]"}`}>
                👁 {beat.chip}
              </div>
            )}
            {beat.line && (
              <div className="mt-2 rounded border border-[#5c2b7a] bg-[#1a1024ee] px-4 py-2 text-center font-serif text-[14px] italic leading-snug text-[#e4d8bf]">
                <span className="mr-2 not-italic text-[10px] tracking-[.2em] text-[#b44df5]">MALACHAR</span>
                {beat.line}
              </div>
            )}
          </div>
        )}

        {/* The cost of a leg, priced before anyone clicks (Solasta's hover,
            kept to the roads): miles by road, hours at the day's pace, hours
            of the eight left, and the forced-march DC if it runs past them. */}
        {hoverNode && canLead && party && !confirmNode && !halt && party.node_id !== hoverNode.id && (() => {
          const ids = routeBetween(party.node_id, hoverNode.id)
          if (ids.length < 2) return null
          const miles = routeMiles(ids)
          const pv = legPreview(march, miles, march.day_miles)
          const hoursFmt = (h: number) => `${Math.round(h * 10) / 10} h`
          return (
            <div className="pointer-events-none absolute right-3 top-3 max-w-[30ch] rounded border-2 border-[#3a2c56] bg-[#171024ee] px-3 py-2 text-[11px] text-[#c9bcd8]">
              <div className="tracking-[.2em] text-[#f5c34d]">{(hoverNode.name ?? "???").toUpperCase()}</div>
              <div className="mt-1">
                {Math.round(miles * 10) / 10} mi by road · {hoursFmt(pv.hours)} at {march.pace} pace
              </div>
              <div className="text-[#9a8fb0]">{hoursFmt(pv.left)} of the day's {MARCH_HOURS_PER_DAY} left</div>
              {pv.forced ? (
                <div className="mt-1 text-[#e08a8a]">
                  Runs {hoursFmt(pv.endsAt - MARCH_HOURS_PER_DAY)} past eight — camp on the way, or force it: CON save DC {pv.dc}+ per hour or a level of exhaustion.
                </div>
              ) : (
                <div className="mt-1 text-[#9a8fb0]">Within today's march.</div>
              )}
              {!PACES[march.pace].canForage && <div className="text-[#9a8fb0]">Fast pace: no foraging.</div>}
            </div>
          )
        })()}

        {/* The day, Malachar's eyes only: players never see the day number or
            the hours (same rule as /api/game-clock). */}
        {dmKey && loaded && (
          <div className="absolute left-3 top-3 rounded border-2 border-[#3a2c56] bg-[#171024ee] px-3 py-2 text-[11px] text-[#c9bcd8]">
            <div className="tracking-[.2em] text-[#f5c34d]">
              DAY {march.days_marched + 1} · {march.pace.toUpperCase()} PACE
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="relative inline-block h-1.5 w-24 overflow-hidden rounded bg-[#2a2140]">
                <span className="absolute inset-y-0 left-0 bg-[#f5c34d]" style={{ width: `${Math.min(100, (march.hours_today / MARCH_HOURS_PER_DAY) * 100)}%` }} />
              </span>
              <span>{Math.round(march.hours_today * 10) / 10} / {MARCH_HOURS_PER_DAY} h on the road</span>
            </div>
            <div className="mt-1 text-[#9a8fb0]">
              {march.navigator ? `${march.navigator.name} leads${march.navigator.familiar ? "" : " (unfamiliar)"}` : "No navigator"}
              {march.lost_hours_total > 0 ? ` · ${Math.round(march.lost_hours_total * 10) / 10} h lost` : ""}
              {march.navigation_due ? " · check owed" : ""}
            </div>
          </div>
        )}

        {loaded && party && !confirmNode && !halt && <MarchGauge t={t} />}

        {/* The march has stopped. Nothing resumes it but the DM. */}
        {halt && (
          <div className="absolute inset-0 grid place-items-center bg-[#0a0612cc] p-4">
            <div className={`w-full max-w-md rounded-lg border-2 ${halt.kind === "camp" ? "border-[#7a5c2b]" : "border-[#7a2b2b]"} bg-[#1a1020] p-4 shadow-[0_0_40px_#000]`}>
              <div className={`text-[10px] uppercase tracking-[.22em] ${halt.kind === "camp" ? "text-[#e0a35c]" : "text-[#c96a6a]"}`}>
                {halt.kind === "encounter" ? "Encounter" : halt.kind === "challenge" ? "Challenge" : halt.kind === "cinematic" ? "Cinematic" : halt.kind === "camp" ? (march.hours_today >= MARCH_HOURS_PER_DAY ? "Nightfall — make camp" : "Camp — long rest") : halt.kind === "forced_march" ? "Forced march — the price" : "The party stops"}
              </div>
              <div className="mt-1 font-serif text-lg leading-snug text-[#f5c34d]">{halt.title}</div>
              {halt.meeting && (
                <div className={`mt-2 w-fit rounded-full border px-3 py-1 text-[11px] tracking-wide ${halt.meeting.first === "party" ? "border-[#f5c34d] text-[#f5c34d]" : "border-[#c96a6a] text-[#e6a3a3]"}`}>
                  {halt.meeting.chip}
                </div>
              )}
              {halt.body && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[#c9bcd8]">{halt.body}</p>}
              {/* THE ENCOUNTER BOX (lib/travel/stance.ts; Sam, 2026-11-12): how the book says they behave, the
                  choices the passive roll left open with their checks, then what the choice came to. */}
              {(halt.foes ?? []).filter((f) => f.line).map((f, k) => (
                <p key={k} className="mt-2 text-[12px] italic leading-relaxed text-[#b9acd6]">{f.line}</p>
              ))}
              {halt.stance && (
                <div className={`mt-3 rounded border px-3 py-2 ${halt.stance.outcome === "fight" || halt.stance.outcome === "spotted" ? "border-[#7a2b2b] bg-[#241016]" : "border-[#4f6b3a] bg-[#142014]"}`}>
                  <div className="text-[13px] leading-relaxed text-[#e4d8bf]">{halt.stance.text}</div>
                  {halt.stance.checks.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {halt.stance.checks.map((c, k) => (
                        <li key={k} className="text-[11px] text-[#9a8fb0]">
                          <span className={c.success ? "text-[#9fd08a]" : "text-[#e08a8a]"}>{c.success ? "✓" : "✗"}</span> {c.name}: Stealth {c.arithmetic}
                        </li>
                      ))}
                    </ul>
                  )}
                  {halt.stance.outcome === "fight" && <div className="mt-2 text-[11px] text-[#c9bcd8]">{halt.battle ? "Fight it on the battle map, then walk on." : "Run the fight at the table, then walk on."}</div>}
                  {halt.stance.outcome === "parley" && <div className="mt-2 text-[11px] text-[#c9bcd8]">Speak with them at the Parley, then walk on.</div>}
                </div>
              )}
              {(halt.stances ?? []).length > 0 && (
                <div className="mt-3 space-y-2 border-t border-[#3a2c56] pt-3">
                  <div className="text-[10px] uppercase tracking-[.22em] text-[#9a8fb0]">{canLead ? "What does the party do?" : "The leader is choosing"}</div>
                  {(halt.stances ?? []).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      disabled={!s.available || !canLead || stanceBusy}
                      onClick={() => void takeStance(s.key)}
                      className={`block w-full rounded border px-3 py-2 text-left ${s.available ? "border-[#7a5c2b] bg-[#221936] hover:border-[#f5c34d]" : "border-[#3a2c56] bg-[#17101f] opacity-70"} disabled:cursor-not-allowed`}
                    >
                      <div className={`text-[13px] ${s.available ? "text-[#f5c34d]" : "text-[#8a7f9c]"}`}>{s.label}</div>
                      <div className="text-[11px] leading-snug text-[#c9bcd8]">{s.detail}</div>
                      {s.check && <div className="mt-0.5 text-[10px] tracking-wide text-[#9a8fb0]">{s.check}</div>}
                      {s.blocked && <div className="mt-0.5 text-[10px] text-[#e0a35c]">{s.blocked}</div>}
                    </button>
                  ))}
                </div>
              )}
              {/* IF IT COMES TO A FIGHT (Sam: "If a fight ensues then we fade into a battle map that resembles the area we
                  are in"; "go", 2026-11-12). Offered once the encounter box has come to a fight (or where no box was
                  offered). The plate and the foes come from the dice (lib/travel/battle.ts); who is surprised is the
                  box's verdict when a choice was made, else the meeting's. When the data or the paint is not there
                  yet, the card says which, and the fight stays the table's to run. */}
              {halt.kind === "encounter" && (halt.stance ? halt.stance.outcome === "fight" : !(halt.stances ?? []).length) && (halt.battle ? (
                <StageLink
                  href={battleHref(halt.battle, halt.stance ? halt.stance.surprised : halt.battle.surprised)}
                  caption="Steel out. The road will still be there after."
                  className="mt-3 block rounded border border-[#7a2b2b] bg-[#2a1218] px-3 py-2 text-center text-[11px] tracking-[.2em] text-[#e6a3a3] hover:border-[#e6a3a3]"
                >
                  TO BATTLE: {halt.battle.count} {halt.battle.creature.toUpperCase()}{halt.battle.count === 1 ? "" : "S"} →
                </StageLink>
              ) : halt.noBattle ? (
                <div className="mt-3 text-center text-[11px] text-[#9a8fb0]">No battle map for this one yet. {halt.noBattle}</div>
              ) : null)}
              {halt.kind === "camp" && (
                <>
                  <StageLink
                    href="/camp"
                    caption="A fire, if you can call it one. Sit. Eat. Lie to each other about how brave you were."
                    className="mt-3 block rounded border border-[#3a2c56] bg-[#221936] px-3 py-2 text-center text-[11px] tracking-[.2em] text-[#e0a35c] hover:border-[#e0a35c]"
                  >
                    TO CAMP AT THE FIRE →
                  </StageLink>
                  {/* p.25: food and water can be gathered at a normal or slow pace, never fast.
                      The camp's Forage / Hunt tiles post their haul to the real pool and packs. */}
                  {PACES[march.pace].canForage ? (
                    <div className="mt-2 text-center text-[11px] text-[#9a8fb0]">
                      {march.pace === "slow" ? "Slow pace: improved foraging tonight." : "Normal pace: the party may forage and hunt at camp."}
                    </div>
                  ) : (
                    <div className="mt-2 text-center text-[11px] text-[#c96a6a]">Fast pace: no foraging today (OotA-Enc p.24).</div>
                  )}
                </>
              )}

              {halt.rolls.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-[#3a2c56] pt-3">
                  {halt.rolls.map((r, k) => (
                    <li key={k} className="text-[11px] text-[#9a8fb0]">
                      <span className="text-[#f5c34d]">d{r.die} = {r.roll}</span>
                      <span className="mx-2 text-[#5c4f72]">|</span>
                      {r.title}: <span className="text-[#e4d8bf]">{r.result}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Every number above is checkable. This campaign has been bitten
                  by invented tables before; the page number rides along. */}
              <div className="mt-3 text-[10px] italic text-[#6f6486]">{halt.source}</div>

              {/* An encounter with choices still open waits for the answer: no walking on past them unanswered. */}
              {!(halt.stances ?? []).length && (
              <button
                onClick={() => continueMarch(false)}
                className="mt-4 w-full rounded border border-[#7a5c2b] bg-[#2a1f10] py-2 text-xs tracking-[.2em] text-[#f5c34d] hover:bg-[#3a2b16]"
              >
                {halt.kind === "camp" ? "BREAK CAMP — WALK ON" : halt.kind === "forced_march" || halt.stance ? "WALK ON" : "CONTINUE THE MARCH"}
              </button>
              )}
              {halt.kind === "camp" && march.hours_today >= MARCH_HOURS_PER_DAY && (
                // Only at nightfall: a camp the party chose before the eight hours were up has nothing to force.
                // FORCED MARCH (SRD 5.1, Travel Pace). The day goes on past
                // eight; every whole hour past it, everyone saves CON vs
                // DC 10 + hours past eight or gains a level of exhaustion.
                <button
                  onClick={() => continueMarch(true)}
                  className="mt-2 w-full rounded border border-[#7a2b2b] bg-[#2a1216] py-2 text-xs tracking-[.2em] text-[#e08a8a] hover:bg-[#3a1c1c]"
                  title="SRD 5.1 Travel Pace: Forced March — CON save DC 10 + 1 per hour past eight, or a level of exhaustion"
                >
                  PUSH ON — FORCED MARCH (DC {10 + Math.max(1, Math.floor(march.hours_today + 1e-6 - MARCH_HOURS_PER_DAY) + 1)})
                </button>
              )}
            </div>
          </div>
        )}
    </>
  )
}

/**
 * THE FATIGUE GAUGE (Sam, 2026-11-12: "There should be some gauge like in Solasta 2 indicating fatigue and
 * whether we perform a forced march. Therefore we need a rest button that sends us the Camp.").
 * Eight segments for the day's eight hours (SRD / PHB ch.8 Travel Pace), red ones past them for a forced march,
 * the day's ledger underneath (how long they walked and why: walking, wandering lost, water), and REST, which
 * is the road marker's own long rest: it stops the march here and takes the table to the Camp Module.
 * Everyone sees it; only the party's leader (or the DM) can rest, the same hands that move the party.
 */
function MarchGauge({ t }: { t: Travel }) {
  const { march, party, nodes, canLead, rest } = t
  const f = fatigue(march.hours_today)
  const here = party ? nodes.find((n) => n.id === party.node_id) : null
  const canRest = canLead && !!here && isRoadMarker(here) && march.hours_today > 0
  const segs = Math.max(MARCH_HOURS_PER_DAY, Math.ceil(f.hours))
  const log = march.today_log ?? []
  const lost = log.reduce((a, e) => a + e.lost_h, 0)
  const walked = log.reduce((a, e) => a + e.walk_h, 0)
  const sailed = log.reduce((a, e) => a + e.sail_h, 0)
  const h = (x: number) => `${Math.round(x * 10) / 10} h`
  const tone = f.band === "forced" ? "#e05a5a" : f.band === "spent" ? "#e0a35c" : f.band === "weary" ? "#e8c46a" : "#9fd38a"
  return (
    <div className="absolute bottom-3 left-3 z-10 w-[min(34ch,calc(100%-1.5rem))] rounded-lg border-2 border-[#3a2c56] bg-[#120c1cee] px-3 py-2 text-[11px] text-[#c9bcd8] shadow-[0_0_24px_#000]">
      <div className="flex items-center justify-between">
        <span className="tracking-[.22em] text-[#f5c34d]">FATIGUE</span>
        <span style={{ color: tone }}>{f.band === "forced" ? "FORCED MARCH" : f.band === "spent" ? "SPENT" : f.band === "weary" ? "WEARY" : "FRESH"}</span>
      </div>
      <div className="mt-1.5 flex gap-[3px]" aria-label={`${h(f.hours)} of ${MARCH_HOURS_PER_DAY} on the road today`}>
        {Array.from({ length: segs }, (_, i) => {
          const fill = Math.max(0, Math.min(1, f.hours - i))
          const past = i >= MARCH_HOURS_PER_DAY
          const col = past ? "#e05a5a" : i >= 6 ? "#e0a35c" : "#9fd38a"
          return (
            <span key={i} className={`relative h-2.5 flex-1 overflow-hidden rounded-[2px] ${past ? "bg-[#3a1418]" : "bg-[#2a2140]"}`}>
              <span className="absolute inset-y-0 left-0" style={{ width: `${fill * 100}%`, background: col }} />
            </span>
          )
        })}
      </div>
      <div className="mt-1" style={{ color: tone }}>{f.label}</div>
      {f.band === "forced" && <div className="text-[#e08a8a]">Each hour past eight: CON save, DC {f.nextDc} next, or a level of exhaustion.</div>}
      {log.length > 0 && (
        <div className="mt-2 border-t border-[#3a2c56] pt-1.5">
          <div className="text-[#9a8fb0]">
            Today: {h(walked)} walking{lost > 0 ? `, ${h(lost)} lost` : ""}{sailed > 0 ? `, ${h(sailed)} on the water` : ""}
          </div>
          <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto pr-1">
            {log.slice(-6).map((e, k) => (
              <li key={k} className="leading-snug">
                <span className="text-[#e4d8bf]">{e.at}</span>
                <span className="text-[#9a8fb0]">
                  {" "}· {e.sail_h ? `${h(e.sail_h)} by boat` : `${h(e.walk_h)} walking`}
                  {e.forced ? " · forced" : ""}
                </span>
                {e.lost_h > 0 && (
                  <div className="text-[#e0a35c]">+{h(e.lost_h)} lost{e.why ? `: ${e.why}` : ""}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canRest && (
        <button
          onClick={rest}
          className="mt-2 w-full whitespace-nowrap rounded border border-[#7a5c2b] bg-[#2a1f10] py-1.5 text-[11px] tracking-[.14em] text-[#f5c34d] hover:bg-[#3a2b16]"
          title="Make camp here: a long rest at the Camp Module. Breaking camp starts a new day."
        >
          REST AT CAMP →
        </button>
      )}
    </div>
  )
}

export function TravelPanels({ t, embedded = false }: { t: Travel; embedded?: boolean }) {
  const {
    nodes, edges, party, loaded, dmKey, setRefresh,
    confirmNode, setConfirmNode, arrivedAt, setArrivedAt,
    halt, continueMarch,
    vessels, hasBoat, march, guides, pcs,
    pace, setPace, navSel, setNavSel, pcFamiliar, setPcFamiliar, pcHasMap, setPcHasMap,
    me, lead, canLead, hoverNode, setHoverNode,
    beat, options, setOptions, chosen, setChosen, entrance, setEntrance, entering,
    arrival, roadChoice, setRoadChoice,
    boatAction, dmAction, chooseOption, enterPlace, leadAction, setOut,
    routeMiles, routeBetween, byId,
  } = t
  return (
    <>
      {/* The party's boats. Without one, the Darklake lanes stay closed. */}
      {loaded && (dmKey || hasBoat) && (
        <div
          className={
            embedded
              ? "mt-2 flex flex-wrap items-center gap-2 rounded border border-[#2b4a52] bg-[#0f1a20ee] p-2 text-[11px]"
              : "mt-2 flex flex-wrap items-center gap-2 rounded-lg border-2 border-[#2b4a52] bg-[#0f1a20ee] px-4 py-2 text-xs"
          }
        >
          <span className="tracking-widest text-[#5cc8e0]">BOATS</span>
          {vessels.length === 0 && <span className="text-[#7f9aa3]">None. The Darklake is closed to them.</span>}
          {vessels.map((v) => (
            <span key={v.id} className="flex items-center gap-1 rounded border border-[#2b4a52] bg-[#14252d] px-2 py-1 text-[#cfe9ef]">
              {v.name || VESSELS[v.kind]?.label || v.kind} · {v.hp_current}/{v.hp_max} hp
              {dmKey && (
                <button
                  onClick={() => boatAction({ op: "lose", vessel_id: v.id })}
                  className="ml-1 rounded px-1 text-[#e08a8a] hover:bg-[#3a1c1c]"
                  title="Sunk, stolen or left behind"
                >
                  LOST
                </button>
              )}
            </span>
          ))}
          {vessels.length > 0 && <span className="text-[#7f9aa3]">· seats {seats(vessels)}</span>}
          {dmKey && (
            <span className="ml-auto flex flex-wrap gap-1">
              {(["keelboat", "coracle", "barrel"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => boatAction({ op: "acquire", kind: k })}
                  className="rounded border border-[#2b4a52] bg-[#14252d] px-2 py-1 text-[#5cc8e0] hover:border-[#5cc8e0]"
                  title={VESSELS[k].source}
                >
                  + {VESSELS[k].label.toUpperCase()}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {/* WHO LEADS (Sam, 2026-10-14): the players vote among themselves; more
          than half carries it; the DM may name the leader outright. Losing
          confidence is simply voting again. */}
      {loaded && lead && lead.roster.length > 0 && (
        <div
          className={
            embedded
              ? "mt-2 flex flex-wrap items-center gap-2 rounded border border-[#4a3c2b] bg-[#1a1410ee] p-2 text-[11px]"
              : "mt-2 flex flex-wrap items-center gap-2 rounded-lg border-2 border-[#4a3c2b] bg-[#1a1410ee] px-4 py-2 text-xs"
          }
        >
          <span className="tracking-widest text-[#e0a35c]">WHO LEADS</span>
          {!lead.available ? (
            <span className="text-[#9a8fb0]">The vote is not open yet{dmKey ? " (apply migration travel_march_leader)" : ""}.</span>
          ) : (
            <>
              <span className="text-[#e4d8bf]">
                {lead.leader ? `${lead.roster.find((c) => c.id === lead.leader)?.name ?? "?"} leads${lead.by_vote ? " (by vote)" : lead.by === "host" ? " (hosting the game)" : " (DM's choice)"}` : "No leader yet"}
                {lead.leader === me.characterId && me.characterId ? " — that's you" : ""}
              </span>
              <span className="text-[#9a8fb0]">· {lead.needed} of {lead.roster.length} votes carry it</span>
              {me.characterId && lead.roster.some((c) => c.id === me.characterId) && (
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  <span className="text-[#9a8fb0]">I follow:</span>
                  {lead.roster.map((c) => {
                    const mine = lead.votes[me.characterId!] === c.id
                    return (
                      <button
                        key={c.id}
                        onClick={() => void leadAction({ action: "vote", for: mine ? null : c.id })}
                        className={`rounded border px-2 py-1 ${mine ? "border-[#f5c34d] bg-[#2a1f10] text-[#f5c34d]" : "border-[#4a3c2b] bg-[#241a12] text-[#c9bcd8] hover:border-[#e0a35c]"}`}
                        title={mine ? "Withdraw my vote" : `Vote for ${c.name} to lead`}
                      >
                        {c.name}
                        {lead.counts[c.id] ? ` · ${lead.counts[c.id]}` : ""}
                      </button>
                    )
                  })}
                </span>
              )}
              {dmKey && (
                <select
                  value={lead.by_vote || lead.by === "host" || !lead.leader ? "" : lead.leader}
                  onChange={(e) => void leadAction({ action: "leader", character_id: e.target.value || null })}
                  className="ml-auto rounded border border-[#4a3c2b] bg-[#241a12] px-2 py-1 text-[#e4d8bf]"
                  title="The DM's override; blank leaves it to the host (or to the vote, at a table with no host)"
                >
                  <option value="">Let the host lead</option>
                  {lead.roster.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} leads{lead.counts[c.id] ? ` (${lead.counts[c.id]} votes)` : ""}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
