import VelkynvelveGame from "@/components/velkynvelve/velkynvelve-game"

export const metadata = {
  title: "Velkynvelve — Ashes of Prometheus",
  description: "Top-down sprite map of Velkynvelve.",
}

export default function VelkynvelvePage() {
  return <VelkynvelveGame nodeSlug="tavern" />
}
