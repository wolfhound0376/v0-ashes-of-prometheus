import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "The Lich | Dungeon Master Layer",
  description: "AI Dungeon Master interface for Ashes of Prometheus",
}

export default function DMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
