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
// The poses are added to as Sam approves them (the casters, the female drow, the quaggoth and the drow's heavier hit
// came second, 2026-11-23); the hero hit poses and Fifi's flip wait for the triggers that would show them.
//
// PR 2 (2026-11-23, Sam: "go") added the rest of the trigger list that has art: Sneak Attack (once a fight), the
// killing blow, and a monster's blow on a hero (a signature ability once a fight, a crit, or the blow that drops them).
// Reactions are not in yet.
//
// PR 1 OF 3 carried the engine, the DM's setting (off by default) and the three scenes Sam approved. The
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
      // SNEAK ATTACK FROM ABOVE (Sam, 2026-11-23: "a set of sneak attacks where she flips and attacks from above"): the
      // tucked flip is the wind-up, the diving stab the blow. `lift` holds a pose off the floor; `lead` gives the flip
      // time to be seen before the hit.
      sneak: { kind: "melee", src: "closeup-dive.png", scale: 1.2, feetX: 770, lift: 300, lead: 260, hand: [0.99, 0.99], weapon: /dagger/i,
        wind: { src: "closeup-flip.png", scale: 1.1, feetX: 640, lift: 430 } },
      hit: { src: "closeup-hit.png", scale: 1.25 },
      "art:hamstring": { kind: "shot", src: "closeup-crossbow.png", scale: 1.25, feetX: 420, hand: [0.99, 0.2], weapon: /hand crossbow/i, mark: [0.42, 0.74] },
    },
    kenta: {
      cast: { kind: "spell", src: "closeup-cast.png", scale: 1, feetX: 420, hand: [0.97, 0.25], mark: [0.45, 0.34] },
      hit: { src: "closeup-hit.png", scale: 1.1 },
    },
    // the casters' poses serve every spell of theirs that has sheets in spellFx below
    samson: { hit: { src: "closeup-hit.png", scale: 1.3 }, cast: { kind: "spell", src: "closeup-cast.png", scale: 1, feetX: 420, hand: [0.98, 0.18], mark: [0.45, 0.34] } },
    scott: { hit: { src: "closeup-hit.png", scale: 1.2 }, cast: { kind: "spell", src: "closeup-cast.png", scale: 1, feetX: 420, hand: [0.99, 0.19], mark: [0.45, 0.34] } },
    gandalf: { hit: { src: "closeup-hit.png", scale: 1.15 }, cast: { kind: "spell", src: "closeup-cast.png", scale: 1, feetX: 420, hand: [0.99, 0.18], mark: [0.45, 0.34] } },
    lynkes: { hit: { src: "closeup-hit.png", scale: 0.8 } },
    // A FOE'S OWN BLOW: `attack` is a monster's melee attack on a hero. The scene is mirrored (the foe stands on the
    // right), so a foe's `hand` is measured on its pose turned to face right.
    // hitHard: a second, heavier way of taking a blow, shown for a critical hit (Sam, 2026-11-23: "another combat pose
    // for hits on drow (we also need one for females)")
    "drow-guard-male": { hit: { src: "closeup-hit.png", scale: 1.25 }, hitHard: { src: "closeup-hit-hard.png", scale: 1.25 } },
    "drow-guard-female": { hit: { src: "closeup-hit.png", scale: 1.25 } },
    quaggoth: { hit: { src: "closeup-hit.png", scale: 1.4 }, attack: { kind: "melee", src: "closeup-attack.png", scale: 1.4, feetX: 640, hand: [0.92, 0.63] } },
    // MORE_FOES
  },
  // named foes: the blow that kills one of them is a key moment, like a boss's
  named: ["ilvara", "asha", "shoor", "jorlan"],
  // shown once a fight, then it plays on the map: Sneak Attack, and a monster's signature ability
  once: ["sneak", "signature"],
  // where the target stands, by the kind of scene
  targetFeetX: { melee: 1050, shot: 1130, spell: 1130 },

  // the spell sheets a spell scene draws with, from public/vfx: [file, columns, rows, frames]. A spell with no entry
  // here has no close-up yet.
  spellFx: {
    "Ray of Frost": { tint: "#bfe9ff", pop: "#bfe9ff", blood: false,
      charge: ["frostRayCharge.webp", 4, 1, 3], travel: ["frostRayTravel.webp", 4, 1, 4], impact: ["frostRayImpact.webp", 3, 3, 8] },
    "Guiding Bolt": { tint: "#fff1b0", pop: "#fff1b0", blood: false,
      charge: ["guidingBoltCharge.webp", 4, 1, 3], travel: ["guidingBoltTravel.webp", 4, 1, 4], impact: ["guidingBoltImpact.webp", 3, 3, 8] },
  },
};

/** the mode as stored, made safe: anything unknown is "off" */
export function strikeCamMode(v) {
  return STRIKE_CAM.modes.includes(v) ? v : "off";
}

/**
 * Does this landed blow get a close-up, and which?
 *   ev: { mode, att, tgt (sprite slugs), art (a weapon art's key), weapon (the attack's name), spell, spellLevel,
 *         crit, quick (Quick resolve is on),
 *         sneak (this hit carried Sneak Attack), foe (a monster's melee blow on a hero), signature (that blow carries
 *         the monster's own rider: venom, a curse), drop (it dropped the hero to 0), kill (it killed a boss or a named
 *         foe, or ended the fight) }
 * Returns null (it plays on the map) or { key, kind, att, tgt, pose, hit, hard, fx }. `hard` says the target has a
 * heavier hit pose and this blow (a critical hit) earns it.
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
  let key = null, pose = null, fx = null, special = false, once = null;
  if (ev.spell) {
    fx = STRIKE_CAM.spellFx[ev.spell] || null;
    pose = fx ? mine.cast : null;
    key = "spell:" + ev.spell;
    special = (ev.spellLevel || 0) > 0;
  } else if (ev.art) {
    pose = mine["art:" + ev.art] || null;
    key = "art:" + ev.art;
    special = true;
  } else if (ev.sneak && !ev.foe) {
    pose = mine.sneak || null;
    key = "sneak";
    special = true;
    once = "sneak";
  } else if (ev.foe) {
    pose = mine.attack || null;
    key = "attack";
    special = !!ev.drop;
    if (!special && !ev.crit && ev.signature) { special = true; once = "signature"; }
  }
  if (!pose) return null;
  if (pose.weapon && !pose.weapon.test(String(ev.weapon || ""))) return null;   // the pose shows another weapon
  if (ev.kill) special = true;
  if (mode === "key" && !special && !ev.crit) return null;
  if (mode === "all" || ev.crit || ev.kill || ev.drop) once = null;   // a crit or a finishing blow is shown on its own account; "all" shows everything
  const hard = !!((ev.crit || ev.kill || ev.drop) && theirs.hitHard);
  return { key, kind: pose.kind, att: ev.att, tgt: ev.tgt, pose, hit: hard ? theirs.hitHard : hit, hard, fx, once, flip: !!ev.foe };
}

/**
 * Once a fight: true the first time `who` uses the thing named by a scene's `once`, false after. `mem` is the fight's
 * memory, as for strikeCamCut.
 */
export function strikeCamOnce(mem, who, once) {
  if (!once) return true;
  const id = who + "|" + once, used = (mem.once = mem.once || {});
  if (used[id]) return false;
  used[id] = true;
  return true;
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
