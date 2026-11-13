// ============================================================================
// IN A CONVERSATION, ONLY THE ONE YOU ARE TALKING TO SPEAKS.
// ============================================================================
//
// Sam, 2026-11-13: "we probably don't need the lich's narration when talking unless we are talking to the DM or
// performing some check and need a result."
//
// A talk turn (the player sat down with an NPC: `talkWith`) used to come back as Malachar's prose wrapped round
// the NPC's quotes — "Her jaw tightens." / "That is enough." / "She looks away." — every line of it logged and
// read aloud in the lich's voice between the NPC's own. In a conversation that is noise: the player asked Eldeth,
// and wants Eldeth.
//
// So in a talk turn the narration is dropped and only the NPC's spoken lines are kept, EXCEPT when the narration
// is carrying something the table needs:
//   - the line was put to the DM (that is not a talk turn at all: `talkWith` is null then, see the route);
//   - a check: the player reported a roll, or Malachar is calling for one — the call and the result are his;
//   - something happened: a tag that changes the world rode on the reply (a wound, an item changing hands, a
//     condition, someone leaving, time passing, a film). That keep is Claude's reading of "need a result", not
//     Sam's words: dropping "He presses the wire into your hand" while the wire appears in the bag would leave
//     the player guessing what just happened.
//
// And never when dropping it would leave nothing: a reply with no attributed NPC line keeps its prose whole.
//
// Pure, so it can be tested without the route (lib/talk-narration.test.ts).

/** Tags that mean the world changed this turn. Bookkeeping tags (who is on stage, how they feel, whose quote it is) are not here. */
const EVENT_TAG = /\[(DAMAGE|HEAL|ITEM_ADD|ITEM_AWARD|ITEM_REMOVE|CONDITION_ADD|CONDITION_REMOVE|NPC_DAMAGE|NPC_LEAVE|NPC_MOVE|UPDATE_LOCATION|TIME|STORY_ADVANCE|CINEMATIC|QUEST|JOURNAL)\b/i

/** The player's message is a roll being reported (the dice line, or the committed result's marker). */
export function reportsRoll(message: string): boolean {
  return /\[ROLL_RESULT:/i.test(message) || /\[Dice Roll\]/i.test(message) || message.trimStart().startsWith("🎲")
}

export type TalkTurn = {
  /** Who the player is in conversation with; null when there is no conversation or the line is to the DM. */
  talkWith: string | null
  /** What the player sent (empty for a stage direction). */
  message: string
  /** Malachar's reply before any tag was stripped. */
  rawReply: string
  /** True when the reply asks the player for a roll. */
  asksForRoll: boolean
}

/** True when this turn's narration should be dropped, leaving only what the NPC said. */
export function dropsNarration(turn: TalkTurn): boolean {
  if (!turn.talkWith) return false
  if (turn.asksForRoll || reportsRoll(turn.message)) return false
  if (EVENT_TAG.test(turn.rawReply)) return false
  return true
}

/**
 * The rows a talk turn keeps: the NPC lines only, when the narration is to be dropped and there is at least one
 * NPC line to keep. Otherwise the rows come back untouched.
 */
export function withoutNarration<T extends { speaker_type: string }>(entries: T[], turn: TalkTurn): T[] {
  if (!dropsNarration(turn)) return entries
  const spoken = entries.filter((entry) => entry.speaker_type === "npc")
  return spoken.length ? spoken : entries
}
