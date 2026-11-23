// THE STRIKE CAM — when a blow gets a close-up, and which one. The rules, pure, in one copy.
//
// Sam, 2026-11-22: "when using special attacks / spells there is a fade out/in into a screen like above where melee is
// played out so attacks feel more special when they hit". He picked new, larger close-up poses over the map sprites
// enlarged ("B go"), judged three scenes on the Combat Effects Lab ("Looks great", "Looks good"), and on 2026-11-23 took
// the trigger and pacing list as proposed ("use your suggestions"). Design of record: the project doc
// claude/Strike_Cam_Pilot_2026-11-22.md.
//
// What it is: an overlay on the fight, never a second screen. The plate dims and blurs behind a letterbox band, the
// attacker and the target snap to one large held pose each, the blow lands, and the plate comes back.
//
// What this file decides, and nothing else:
//   - STRIKE_CAM.poses   which close-up poses EXIST. Poses are drawn on demand (Sam's ruling); a blow with no pose for
//                        the attacker's move, or no hit pose for the target, plays on the map as it always did.
//   - strikeCamScene()   whether a landed blow gets a close-up under the DM's setting, and which scene.
//   - strikeCamCut()     full or short: the full cut the first time a move is used in a fight, and at most one full cut
//                        a round.
//
// THIS IS PR 1 OF 3. It carries the engine, the DM's setting (off by default) and the three scenes Sam approved. The
// wider trigger list (killing blows, Sneak Attack, reactions, monster abilities on a hero) and weapon arts for the
// casters are the next two PRs; the "key" setting below already says which of the blows it is shown count.
//
// Plain JavaScript for the same reason as lib/gate-watch.mjs: build_walk.py pastes this file into the painted map at
// its STRIKE_CAM placeholder (minus `export`), so the map and lib/strike-cam.test.ts read the SAME rules. Every name
// here starts with STRIKE_CAM or strikeCam so the paste cannot collide with the page's own names.

export const STRIKE_CAM = {
  // the DM's setting. "off" is the default: nothing changes for a table until the DM turns it on.
  modes: ["off", "key", "all"],
  modeNames: { off: "Off", key: "Key moments", all: "Every hit that has one" },

  // ms. `lead` is added between the poses snapping in and the hit: the flight of a bolt, the charge of a spell.
  cuts: {
    full: { inMs: 150, snap: 150, hit: 250, stop: 95, hold: 1050, out: 230 },
    short: { inMs: 90, snap: 90, hit: 170, stop: 70, hold: 520, out: 140 },
  },
  lead: { melee: [0, 0], shot: [130, 90], spell: [330, 190] },

  // THE POSES THAT EXIST, by sprite slug. A point on a pose is a fraction of its trimmed width and height.
  //   strike poses: kind, the pose file, its scale, where the feet stand, `hand` (the pommel, the muzzle, the palm)
  //   weapon:       the pose shows that weapon, so it is only for that weapon (the pose follows the weapon in hand)
  //   wind:         an optional wind-up pose, shown only while a melee attacker lunges
  //   hit:          the pose of someone taking a blow; `mark` is where a shot or a spell lands on it
  poses: {
    freia: {
      "art:sap": { kind: "melee", src: "closeup-sap.png", scale: 2, feetX: 700, hand: [0.95, 0.6], weapon: /dagger/i,
        wind: { src: "closeup-sap-windup.png", scale: 1, feetX: 668 } },
      "art:hamstring": { kind: "shot", src: "closeup-crossbow.png", scale: 1.25, feetX: 420, hand: [0.99, 0.2], weapon: /hand crossbow/i, mark: [0.42, 0.74] },
    },
    kenta: {
      cast: { kind: "spell", src: "closeup-cast.png", scale: 1, feetX: 420, hand: [0.97, 0.25], mark: [0.45, 0.34] },
    },
    "drow-guard-male": { hit: { src: "closeup-hit.png", scale: 1.25 } },
  },
  // where the target stands, by the kind of scene
  targetFeetX: { melee: 1050, shot: 1130, spell: 1130 },

  // the spell sheets a spell scene draws with, from public/vfx: [file, columns, rows, frames]. A spell with no entry
  // here has no close-up yet.
  spellFx: {
    "Ray of Frost": { tint: "#bfe9ff", pop: "#bfe9ff", blood: false,
      charge: ["frostRayCharge.webp", 4, 1, 3], travel: ["frostRayTravel.webp", 4, 1, 4], impact: ["frostRayImpact.webp", 3, 3, 8] },
  },
};

/** the mode as stored, made safe: anything unknown is "off" */
export function strikeCamMode(v) {
  return STRIKE_CAM.modes.includes(v) ? v : "off";
}

/**
 * Does this landed blow get a close-up, and which?
 *   ev: { mode, att, tgt (sprite slugs), art (a weapon art's key), weapon (the attack's name), spell, spellLevel,
 *         crit, quick (Quick resolve is on) }
 * Returns null (it plays on the map) or { key, kind, att, tgt, pose, hit, fx }.
 *
 * "key" is Sam's list as far as PR 1 can see it: a weapon art, a levelled spell aimed at one creature, or a critical
 * hit. A cantrip or a plain attack is shown only when it crits. "all" shows every hit that has a scene, for looking at
 * the scenes. Nothing is shown in Quick resolve, and nothing without a pose on BOTH sides.
 */
export function strikeCamScene(ev) {
  const mode = strikeCamMode(ev && ev.mode);
  if (mode === "off" || !ev || ev.quick) return null;
  const mine = STRIKE_CAM.poses[ev.att], theirs = STRIKE_CAM.poses[ev.tgt];
  const hit = theirs && theirs.hit;
  if (!mine || !hit) return null;
  let key = null, pose = null, fx = null, special = false;
  if (ev.spell) {
    fx = STRIKE_CAM.spellFx[ev.spell] || null;
    pose = fx ? mine.cast : null;
    key = "spell:" + ev.spell;
    special = (ev.spellLevel || 0) > 0;
  } else if (ev.art) {
    pose = mine["art:" + ev.art] || null;
    key = "art:" + ev.art;
    special = true;
  }
  if (!pose) return null;
  if (pose.weapon && !pose.weapon.test(String(ev.weapon || ""))) return null;   // the pose shows another weapon
  if (mode === "key" && !special && !ev.crit) return null;
  return { key, kind: pose.kind, att: ev.att, tgt: ev.tgt, pose, hit, fx };
}

/**
 * Full or short. `mem` is the fight's own memory ({} at the start of a fight) and is updated here:
 * the full cut the first time a move is used in a fight, the short one after; and no more than one full cut a round.
 */
export function strikeCamCut(mem, who, key, round) {
  const id = who + "|" + key, seen = (mem.seen = mem.seen || {});
  const first = !seen[id];
  seen[id] = true;
  if (first && mem.fullRound !== round) { mem.fullRound = round; return "full"; }
  return "short";
}

/** the scene's own clock (ms) for a cut and a kind: when the poses snap in, the release, the hit, the hold, the out */
export function strikeCamClock(cut, kind) {
  const short = cut === "short", c = STRIKE_CAM.cuts[short ? "short" : "full"], lead = (STRIKE_CAM.lead[kind] || [0, 0])[short ? 1 : 0];
  const rel = c.snap + (kind === "shot" ? 70 : kind === "spell" ? lead - (short ? 90 : 130) : 0);
  return { inMs: c.inMs, snap: c.snap, rel, hit: c.hit + lead, stop: c.stop, hold: c.hold + lead, out: c.out };
}
