"use client"

import { AbilityScoreCard, StatShield } from "@/components/dashboard/v4-dashboard"
import { CharacterSpriteVignette } from "@/components/dashboard/character-sprite-vignette"

const sample = [
  { key: "str", score: 11, mod: 0 },
  { key: "dex", score: 15, mod: 2 },
  { key: "con", score: 13, mod: 1 },
  { key: "int", score: 12, mod: 1 },
  { key: "wis", score: 16, mod: 3 },
  { key: "cha", score: 11, mod: 0 },
]

export default function AbilityPreviewPage() {
  return (
    <main className="flex min-h-screen flex-col gap-10 bg-[#0a0908] p-8">
      <section className="flex flex-col gap-3">
        <h1 className="font-serif text-sm uppercase tracking-[.2em] text-[#ecd08f]">Dashboard rail</h1>
        <div className="grid w-full max-w-[720px] grid-cols-3 gap-2 md:grid-cols-6">
          {sample.map((ability) => <AbilityScoreCard key={ability.key} ability={ability} large />)}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-sm uppercase tracking-[.2em] text-[#ecd08f]">Card</h2>
        <div className="grid w-full max-w-[720px] grid-cols-3 gap-2 md:grid-cols-6">
          {sample.map((ability) => <AbilityScoreCard key={ability.key} ability={ability} />)}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-sm uppercase tracking-[.2em] text-[#ecd08f]">Character sheet</h2>
        <div className="grid w-full max-w-[900px] grid-cols-3 gap-3 md:grid-cols-6">
          {sample.map((ability) => <AbilityScoreCard key={ability.key} ability={ability} sheet />)}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-sm uppercase tracking-[.2em] text-[#ecd08f]">Stat shields (right column)</h2>
        <div className="grid w-[310px] grid-cols-3 gap-2">
          <StatShield kind="ac" label="AC" value="10" onClick={() => {}} />
          <StatShield kind="proficiency" label="Proficiency" value="+2" onClick={() => {}} />
          <StatShield kind="speed" label="Speed" value="30 ft." onClick={() => {}} />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-sm uppercase tracking-[.2em] text-[#ecd08f]">Character sprite (right column)</h2>
        <div className="flex h-[220px] w-[310px] flex-col">
          <CharacterSpriteVignette characterId="preview" name="Samson" />
        </div>
      </section>
    </main>
  )
}
