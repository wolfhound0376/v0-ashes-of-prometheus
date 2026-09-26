import VelkynvelveGame from "@/components/velkynvelve/velkynvelve-game"

export const metadata = {
  title: "Velkynvelve — Ashes of Prometheus",
  description: "Top-down sprite map of Velkynvelve.",
}

/** Nodes with sprite art built. ?node=<slug> picks one; anything else opens the tavern. */
const NODES = ["tavern", "slave-pen"] as const

export default async function VelkynvelvePage({
  searchParams,
}: {
  searchParams: Promise<{ node?: string }>
}) {
  const { node } = await searchParams
  const slug = NODES.find((n) => n === node) ?? "tavern"
  return <VelkynvelveGame key={slug} nodeSlug={slug} />
}
