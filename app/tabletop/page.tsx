import type { Metadata } from "next"
import { TabletopClient } from "@/components/tabletop/tabletop-client"

export const metadata: Metadata = {
  title: "Tabletop",
  description: "3D virtual tabletop for Ashes of Prometheus",
}

export default function TabletopPage() {
  return <TabletopClient />
}
