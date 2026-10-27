// WHO HEARS AN NPC (Sam, 2026-10-26, playtest: "If an NPC speaks to another player ONLY the bubble is seen by
// everyone else; we don't need to hear as well. It causes a lot of noise." / "DM screen can hear every NPC voice.")
//
// Every screen at the table gets every line of the shared feed. Until this rule each one also SPOKE every NPC
// line, so when Eldeth answered Lynkes, Gandalf's speakers and the DM's projector said it too, a beat apart.
//
// The rule:
//   - The DM screen hears every NPC voice.
//   - A player hears an NPC line aloud only when it is addressed to their own hero.
//   - Everyone still SEES the line (text / bubble). Only the audio is withheld.
//   - A line with no addressee (an NPC who opened the talk, a scene line, a DM direction) is heard by all, as
//     before — silence is never the default for a line nobody was singled out for.
//
// The addressee is the `recipient` the server stamps on each NPC row (app/api/chat/route.ts): the hero whose
// line the NPC is answering. Malachar's narration is not covered here and keeps playing everywhere.
//
// The Underwalk (public/velkynvelve-walk/index.html) is a static page and applies the same rule inline in
// hearLine(); keep the two in step.

export type VoiceAudience = {
  /** This screen is the DM's. */
  dm: boolean
  /** This screen's own hero name (characters.name), or null when unknown. */
  name: string | null
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Should this screen play an NPC line aloud? */
export function hearsNpcVoice(row: { recipient?: string | null }, me: VoiceAudience | null | undefined): boolean {
  const to = (row.recipient ?? "").trim()
  if (!to) return true            // nobody was singled out: everyone hears it, as before
  if (!me) return true            // a screen that does not know who it is keeps the old behaviour
  if (me.dm) return true          // the DM hears every NPC voice
  return same(to, me.name)
}
