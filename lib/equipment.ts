// ============================================================================
// WEAPONS ON THE RIG — putting a real object in a character's hand.
//
// Every model in this cast came through Meshy's humanoid auto-rig, which means
// they all expose the SAME bone names: RightHand, LeftHand, Head, Spine02,
// Hips. That is the whole reason this file is short. A weapon parented to
// RightHand inherits every frame of the animation for free — it swings when
// the arm swings, with no per-clip code and no per-character work, and it
// keeps working for models that do not exist yet.
//
// THE APPROACH (see docs/weapons-on-the-rig.md): archetypes as the floor,
// bespoke models for named artifacts. Diablo's own bargain — base items share
// a silhouette and rarity is carried by colour, while uniques earn their own
// shape. Ten archetypes cover all nineteen hand-held items in the catalogue.
//
// WHY PROXY GEOMETRY EXISTS: the art does not, yet. Rather than block the
// system on a modelling session, an item with no model_url gets a generated
// stand-in — a real object of the right size and silhouette in the right
// hand. It proves the socket, the grip transform and the rarity tint today,
// and the day a GLB lands it is one column of data; this code does not change.
// ============================================================================

import * as THREE from "three"

/** The bones every rig in this project exposes, verified across all models. */
export const SOCKETS = {
  mainHand: "RightHand",
  offHand: "LeftHand",
  /** Where a weapon rests when it is not drawn. */
  sheathed: "Spine02",
  head: "Head",
} as const

export type Archetype =
  | "blade" | "dagger" | "mace" | "axe" | "spear"
  | "staff" | "wand" | "bow" | "crossbow" | "shield"
  /** Nothing in the hand. An unarmed strike is not a weapon you hold. */
  | "empty"

/**
 * Where the grip sits, per archetype.
 *
 * A model's origin is almost never its grip: a sword is modelled from the
 * hilt, a spear from its butt, a shield from its centre. These are the
 * defaults that make each archetype sit in a fist; an individual item can
 * override them through items.grip once it has real art.
 *
 * Scale is RELATIVE to the board, not the world: characters are normalised so
 * a six-foot figure is 1.2 units tall, which makes 1.0 here roughly a metre of
 * weapon. A model exported in real-world metres arrives comically wrong, and
 * this number is where that gets absorbed.
 */
export interface Grip {
  pos: [number, number, number]
  rot: [number, number, number]
  scale: number
}

const P = Math.PI
export const DEFAULT_GRIP: Record<Archetype, Grip> = {
  blade:    { pos: [0, 0.02, 0.01], rot: [P / 2, 0, 0], scale: 0.55 },
  dagger:   { pos: [0, 0.01, 0.01], rot: [P / 2, 0, 0], scale: 0.30 },
  mace:     { pos: [0, 0.02, 0.01], rot: [P / 2, 0, 0], scale: 0.45 },
  axe:      { pos: [0, 0.02, 0.01], rot: [P / 2, 0, 0], scale: 0.50 },
  spear:    { pos: [0, 0.06, 0.01], rot: [P / 2, 0, 0], scale: 0.80 },
  staff:    { pos: [0, 0.06, 0.01], rot: [P / 2, 0, 0], scale: 0.80 },
  wand:     { pos: [0, 0.01, 0.01], rot: [P / 2, 0, 0], scale: 0.22 },
  bow:      { pos: [0, 0.02, 0.02], rot: [0, P / 2, 0], scale: 0.60 },
  crossbow: { pos: [0, 0.01, 0.03], rot: [0, P / 2, 0], scale: 0.40 },
  shield:   { pos: [0.02, 0, 0.04], rot: [0, P / 2, 0], scale: 0.50 },
  empty:    { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 },
}

/**
 * Name → archetype. Falls back to "blade", which is wrong for nothing in
 * particular and invisible for nothing at all: an unmapped item still gets an
 * object in hand rather than nothing.
 */
export function archetypeFor(name: string, itemType?: string | null): Archetype {
  const n = name.toLowerCase()
  // Caught in testing: without this, "Unarmed Strike" fell through to the
  // blade default and put a sword in the fist of a man throwing a punch.
  // A body is not a prop. This began as unarmed/fist/claw and let a HOOK
  // through, so a hook horror — whose only action is "Hook" — would have been
  // handed a sword by the blade default at the bottom of this function. Every
  // natural attack in the Act-1 bestiary is named here.
  // Word boundaries on the short ones, or "Thorn Whip" reads as a horn and
  // "Claymore" is one letter away from being a gore.
  if (/unarmed|fist|punch|kick|claw|bite|slam|beak|talon|pincer|tentacle|spore|natural|\b(gore|sting|horn|tail|hooks?)\b/.test(n)) return "empty"
  if (/shield|buckler/.test(n)) return "shield"
  if (/crossbow/.test(n)) return "crossbow"
  if (/bow|sling/.test(n)) return "bow"
  if (/wand|rod|scepter|sceptre/.test(n)) return "wand"
  if (/staff|quarterstaff|stave/.test(n)) return "staff"
  if (/spear|pike|lance|halberd|glaive|trident/.test(n)) return "spear"
  if (/axe|hatchet/.test(n)) return "axe"
  if (/mace|hammer|maul|club|flail|scourge|iron bar/.test(n)) return "mace"
  // "shard": the obsidian shard on the pen floor is a dagger in the hand.
  if (/dagger|knife|dirk|shiv|flake|shard/.test(n)) return "dagger"
  if (/sword|blade|rapier|scimitar|falchion|katana|sabre|saber/.test(n)) return "blade"
  if (itemType === "armor") return "shield"
  return "blade"
}

/**
 * Rarity colour, Diablo's convention. The shape is shared; the glow is not,
 * which is what lets ten models carry a hundred and forty-six items without a
 * player ever mistaking a common for a legendary.
 */
export const RARITY_TINT: Record<string, number | null> = {
  common: null,
  uncommon: 0x4fbf6a,
  rare: 0x4a86d8,
  very_rare: 0xa45fd0,
  "very rare": 0xa45fd0,
  legendary: 0xd99a2b,
  artifact: 0xd99a2b,
}

const STEEL = 0xb9c2cc
const WOOD = 0x5a4632
const LEATHER = 0x3c2f22

/**
 * A stand-in object of the right size and silhouette.
 *
 * Deliberately simple: this is scaffolding that proves the socket works and
 * gives every character something in hand today. It is not trying to look like
 * art, and it should be obvious which items still want a real model.
 */
export function proxyGeometry(archetype: Archetype): THREE.Group {
  const g = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.35, roughness: 0.45 })
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, metalness: 0.05, roughness: 0.9 })
  const grip = new THREE.MeshStandardMaterial({ color: LEATHER, metalness: 0.05, roughness: 0.95 })

  const add = (mesh: THREE.Mesh, y: number) => { mesh.position.y = y; g.add(mesh); return mesh }
  // Everything is built along +Y from the grip, so the grip transform is the
  // only thing that has to know anything about hands.
  switch (archetype) {
    case "dagger":
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), grip), 0.05)
      add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.03), steel), 0.11)
      add(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.28, 4), steel), 0.26)
      break
    case "mace":
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.34, 8), grip), 0.17)
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), steel), 0.4)
      break
    case "axe":
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.42, 8), wood), 0.21)
      add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.02), steel), 0.44)
      break
    case "spear":
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 1.1, 8), wood), 0.55)
      add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), steel), 1.2)
      break
    case "staff":
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.25, 8), wood), 0.62)
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), steel), 1.3)
      break
    case "wand":
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.3, 8), wood), 0.15)
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.032, 0), steel), 0.32)
      break
    case "bow": {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.016, 6, 20, Math.PI * 1.15), wood)
      arc.rotation.z = Math.PI / 2
      g.add(arc)
      break
    }
    case "crossbow":
      add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.04), wood), 0.14)
      add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.025, 0.025), steel), 0.26)
      break
    case "shield": {
      const s = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 16), steel), 0)
      s.rotation.x = Math.PI / 2
      break
    }
    case "empty":
      return g
    case "blade":
    default:
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), grip), 0.07)
      add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.035), steel), 0.15)
      add(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.62, 0.018), steel), 0.47)
      break
  }
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) { m.castShadow = true; m.userData.proxy = true }
  })
  return g
}

/** Wash a weapon in its rarity colour. Commons keep their own materials. */
export function applyRarity(obj: THREE.Object3D, rarity: string | null | undefined) {
  const tint = RARITY_TINT[(rarity ?? "common").toLowerCase()]
  if (!tint) return
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || Array.isArray(m.material)) return
    const mat = m.material as THREE.MeshStandardMaterial
    if (!mat) return
    // Clone first: archetype proxies share materials between characters, and
    // tinting in place would turn every sword on the board legendary.
    const cloned = mat.clone()
    cloned.emissive = new THREE.Color(tint)
    cloned.emissiveIntensity = 0.5
    cloned.color = new THREE.Color(tint).lerp(new THREE.Color(STEEL), 0.55)
    m.material = cloned
  })
}

export interface EquipRequest {
  name: string
  itemType?: string | null
  rarity?: string | null
  grip?: Partial<Grip> | null
  slot: "main_hand" | "off_hand"
}

/**
 * Put something in a hand.
 *
 * Returns the object added, or null when the rig has no such bone — which is
 * the honest answer for an ooze. Anything already in that hand is removed
 * first, so equipping is idempotent and swapping a weapon never leaves the
 * old one behind.
 */
export function equipOnRig(
  root: THREE.Object3D,
  req: EquipRequest,
  loaded?: THREE.Object3D | null,
): THREE.Object3D | null {
  const boneName = req.slot === "off_hand" ? SOCKETS.offHand : SOCKETS.mainHand
  const bone = root.getObjectByName(boneName)
  if (!bone) return null

  unequipSlot(root, req.slot)

  const archetype = archetypeFor(req.name, req.itemType)
  // An empty hand is a real answer, and the slot has already been cleared.
  if (archetype === "empty" && !loaded) return null
  const obj = loaded ?? proxyGeometry(archetype)
  const base = DEFAULT_GRIP[archetype]
  obj.position.fromArray((req.grip?.pos as [number, number, number]) ?? base.pos)
  obj.rotation.fromArray((req.grip?.rot as [number, number, number]) ?? base.rot)
  obj.scale.setScalar(req.grip?.scale ?? base.scale)
  applyRarity(obj, req.rarity)

  obj.userData.equipSlot = req.slot
  obj.userData.equipName = req.name
  bone.add(obj)
  return obj
}

/** Take whatever is in that hand back off, and free it. */
export function unequipSlot(root: THREE.Object3D, slot: "main_hand" | "off_hand") {
  const boneName = slot === "off_hand" ? SOCKETS.offHand : SOCKETS.mainHand
  const bone = root.getObjectByName(boneName)
  if (!bone) return
  for (const child of [...bone.children]) {
    if (child.userData.equipSlot !== slot) continue
    bone.remove(child)
    child.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | THREE.Material[]
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose?.()
    })
  }
}
