import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "World AI — Campaign Engine",
  description: "AI-powered campaign management for tabletop RPGs",
}

export default function WorldAILayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
