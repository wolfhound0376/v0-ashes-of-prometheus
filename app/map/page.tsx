import UnderdarkMap from "@/components/map/underdark-map"

export const metadata = {
  title: "The Underdark — Ashes of Prometheus",
  description: "Live travel map of the party's journey through the Underdark.",
}

export default function MapPage() {
  return <UnderdarkMap />
}
