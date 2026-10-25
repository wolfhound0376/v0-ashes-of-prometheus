// Who a player's line is TO.
//
// Sam, 2026-10-25: a line typed into the dashboard goes to the NPC in the window, which is right nine
// times in ten and wrong when the player wants the DM: "what do I see?" asked of Eldeth gets Eldeth's
// opinion, not the room. So a line can be addressed. Three ways to say so, all meaning the same thing:
//
//   - the switch beside the send box ("To Eldeth" / "To the DM") — the default for every line;
//   - a shortcut in the text for one line, without touching the switch:
//       /dm what do I see?        → to the DM
//       (what do I see?)          → to the DM; brackets are the old tabletop sign for out of character
//       @Ront where is the key?   → to a different NPC in the room, this line only;
//   - nothing at all → whatever the switch says.
//
// The log shows who each line was to, so reading it back later a question to the DM is not mistaken
// for a line to Eldeth. That mark rides on the stored text itself, no new column: a line to the DM is
// kept in brackets, "(what do I see?)", and a line to another NPC keeps its "@Ront " prefix. The
// renderer peels those back off (addressTagFor). A plain line is a line to whoever was in the window,
// exactly as before.
//
// Pure. Tests in lib/address.test.ts.

import { namesFor } from "@/lib/addressed-npc"

export type Address = { to: "dm" } | { to: "npc"; name: string }

export interface ParsedLine {
  /** The line with the shortcut removed. Empty when the shortcut had nothing after it. */
  text: string
  /** Where the shortcut sent it; null when the text carried no shortcut (the switch decides). */
  address: Address | null
  shortcut: "slash" | "parens" | "at" | null
}

const SLASH = /^\/(dm|ooc|gm)\b[:,]?\s*/i
const AT = /^@([\p{L}][\p{L}'’-]*)[:,]?\s*/u

/** True when the whole line sits inside one pair of round brackets, "(…)", and not "(a) and (b)". */
export function isBracketed(s: string): boolean {
  const t = s.trim()
  if (t.length < 3 || t[0] !== "(" || t[t.length - 1] !== ")") return false
  let depth = 0
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") depth++
    else if (t[i] === ")") {
      depth--
      if (depth === 0 && i < t.length - 1) return false   // closed before the end: "(a) and (b)"
    }
  }
  return depth === 0
}

/** Read a typed line: where its shortcut sends it, and the line without the shortcut. */
export function parseAddress(raw: string): ParsedLine {
  const line = String(raw ?? "").trim()
  const slash = SLASH.exec(line)
  if (slash) return { text: line.slice(slash[0].length).trim(), address: { to: "dm" }, shortcut: "slash" }
  if (isBracketed(line)) return { text: line.slice(1, -1).trim(), address: { to: "dm" }, shortcut: "parens" }
  const at = AT.exec(line)
  if (at) return { text: line.slice(at[0].length).trim(), address: { to: "npc", name: at[1] }, shortcut: "at" }
  return { text: line, address: null, shortcut: null }
}

/** How the line is written into the log so the addressee survives a reload: brackets for the DM, @Name for an NPC. */
export function storedText(text: string, address: Address | null): string {
  const t = text.trim()
  if (!address) return t
  if (address.to === "dm") return isBracketed(t) ? t : `(${t})`
  return `@${address.name} ${t}`
}

export interface AddressTag {
  /** "the DM" or the NPC's name as written. */
  tag: string
  /** The line without its mark. */
  body: string
}

/** What a stored player line says about its addressee, for the log. Null for an ordinary line. */
export function addressTagFor(stored: string): AddressTag | null {
  const t = String(stored ?? "").trim()
  if (isBracketed(t)) return { tag: "the DM", body: t.slice(1, -1).trim() }
  const at = AT.exec(t)
  if (at) return { tag: at[1], body: t.slice(at[0].length).trim() }
  return null
}

/**
 * Resolve an @name against the NPCs on stage: full name, or any distinctive word of it ("Eldeth" for
 * "Eldeth Feldrun", "Feldrun" too). Null when nobody on stage answers to it.
 */
export function resolveAddressee(name: string, roster: ReadonlyArray<{ name: string; aliases?: string[] | null }>): string | null {
  const want = name.toLowerCase().replace(/[’']/g, "'").trim()
  if (!want) return null
  for (const npc of roster) {
    if (npc.name.toLowerCase().replace(/[’']/g, "'") === want) return npc.name
  }
  // The same vocabulary the chat route uses to hear a name in a sentence (lib/addressed-npc.ts): each
  // distinctive word of the name, never a role or a species, never "the".
  for (const npc of roster) {
    if (namesFor(npc).includes(want)) return npc.name
  }
  return null
}
