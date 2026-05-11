import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'D&D Dashboard Admin',
  description: 'Content management for the D&D Player Dashboard',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#0a0908]">
      {children}
    </div>
  )
}
