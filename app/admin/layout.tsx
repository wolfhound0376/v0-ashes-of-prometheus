import type { Metadata } from 'next'
import { DmGate } from '@/components/admin/dm-gate'

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
    <DmGate><div className="min-h-screen bg-[#0a0908]">{children}</div></DmGate>
  )
}
