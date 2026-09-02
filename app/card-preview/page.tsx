"use client"

// DEV PREVIEW ONLY — the battlefield character card in every state that
// matters, at the size it actually renders on the board, so it can be held
// against the locked reference sheet without starting a fight to see it.
//
// Dummy values live HERE and nowhere else. The card itself never invents a
// number; everything it draws in production comes from live character state.

import type { ReactNode } from "react"
import { CharacterCard } from "@/components/tactical/character-card"

const W = 210 // the width the board actually passes

const KENTA = {
  id: "k", name: "Kenta", class: "Sorcerer", level: 1, ac: 10,
  hp_current: 8, hp_max: 8, dex_modifier: 0,
  portrait_image_url: "/characters/kenta/kenta-hero-hd.webp", face_image_url: null,
  xpFraction: 0.53, inspiration: 0,
  conditions: ["Poisoned", "Darkvision", "Blessed"],
}
const SAMSON = { ...KENTA, id: "s", name: "Samson", class: "Cleric", hp_current: 9, hp_max: 9, dex_modifier: 2, portrait_image_url: "/characters/samson/samson-hero-4k.webp", conditions: ["Blessed"] }
const FIFI = { ...KENTA, id: "f", name: "Fifi of Copperas Cove", class: "Rogue", hp_current: 2, hp_max: 8, dex_modifier: 3, portrait_image_url: "/characters/fifi/fifi-hero-4k.webp", conditions: ["Frightened"] }
const SCOTT = { ...KENTA, id: "c", name: "Scott", class: "Bard", hp_current: 9, hp_max: 9, dex_modifier: 2, portrait_image_url: "/characters/scott/scott-bard-hero-4k.webp", conditions: [] }

const DORMANT = { action: "dormant", bonus: "dormant", reaction: "dormant" } as const
const FULL = { remainingFt: 30, speedFt: 30 }

export default function CardPreview() {
  return (
    <div style={{ minHeight: "100vh", background: "#07070a", padding: 20, display: "flex", gap: 30, alignItems: "flex-start" }}>

      {/* THE REAL THING: four plates stacked exactly as the board stacks
          them, so the footprint is judged rather than assumed. */}
      <Case title={`Battlefield stack · ${W}px · Kenta is up`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Only the focused card carries a sheet bar, exactly as the board
              passes it — so this stack is the real height, not an optimistic one. */}
          <CharacterCard width={W} character={FIFI} isTurn={false} gems={DORMANT} movement={FULL} slots={null} />
          <CharacterCard width={W} character={KENTA} isTurn active gems={{ action: "lit", bonus: "lit", reaction: "lit" }} movement={FULL} slots={{ total: 4, used: 1 }} onExpand={() => {}} />
          <CharacterCard width={W} character={SAMSON} isTurn={false} gems={DORMANT} movement={FULL} slots={{ total: 2, used: 0 }} />
          <CharacterCard width={W} character={SCOTT} isTurn={false} gems={DORMANT} movement={FULL} slots={null} />
        </div>
      </Case>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Case title="Active · everything available">
          <CharacterCard width={W} character={KENTA} isTurn active
            gems={{ action: "lit", bonus: "lit", reaction: "lit" }}
            movement={FULL} slots={{ total: 4, used: 1 }} onExpand={() => {}} />
        </Case>

        <Case title="Active · action + bonus SPENT, 10 ft left, 3 of 4 slots gone">
          <CharacterCard width={W} character={{ ...KENTA, hp_current: 5 }} isTurn
            gems={{ action: "spent", bonus: "spent", reaction: "lit" }}
            movement={{ remainingFt: 10, speedFt: 30 }} slots={{ total: 4, used: 3 }} onExpand={() => {}} />
        </Case>

        <Case title="Inactive · no active orb, all dormant">
          <CharacterCard width={W} character={SAMSON} isTurn={false}
            gems={DORMANT} movement={FULL} slots={{ total: 2, used: 0 }} onExpand={() => {}} />
        </Case>
      </div>
    </div>
  )
}

function Case({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ color: "#8a7d63", font: "10px Georgia, serif", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 7 }}>
        {title}
      </div>
      {children}
    </div>
  )
}
