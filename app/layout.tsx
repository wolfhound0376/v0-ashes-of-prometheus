import type { Metadata } from 'next'
import { Cinzel, Cinzel_Decorative, Crimson_Text, Geist_Mono, IM_Fell_English, UnifrakturMaguntia } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SupabaseStatus } from '@/components/supabase-status'
import { BuildWatch } from '@/components/build-watch'
import ThemeAudio from '@/components/theme-audio'
import { UiClickSound } from '@/components/ui-click-sound'

import './globals.css'

const cinzel = Cinzel({ 
  subsets: ["latin"],
  variable: '--font-serif',
  display: 'swap',
});

// The ornate face, for titles meant to feel struck rather than typed —
// spell names on the hover panels, chiefly. Cinzel is already the body
// serif; Decorative is its carved cousin, and using it everywhere would be
// unreadable, so it stays scoped to headings.
const cinzelDecorative = Cinzel_Decorative({
  subsets: ["latin"],
  weight: ['400', '700'],
  variable: '--font-display',
  display: 'swap',
});

const crimsonText = Crimson_Text({ 
  subsets: ["latin"],
  weight: ['400', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// THE JOURNAL'S OWN TWO FACES (Sam, 2026-09-29: "olde english ... as if it
// were done with a quill and ink").
//
// Blackletter for the section names and headings only. A whole page of
// blackletter is close to unreadable at UI sizes — the letterforms were cut
// for a scribe's hand at manuscript scale, and the players read this book
// every session — so it does the job real blackletter did: headings, initials
// and titles.
const unifraktur = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: ['400'],
  variable: '--font-blackletter',
  display: 'swap',
});

// IM Fell English is the body hand. It is not a modern face dressed up: it is
// digitised from the actual 17th-century type John Fell brought to Oxford,
// cut and inked by hand, so it carries the ink spread and the slightly
// uneven baseline of metal pressed into rag paper. That is what makes it read
// as written rather than typed, while staying legible at 14px.
const imFell = IM_Fell_English({
  subsets: ["latin"],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-quill',
  display: 'swap',
});

const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'D&D 5e Player Dashboard',
  description: 'A dark fantasy Dungeons & Dragons 5e player dashboard',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-[#0a0908]">
      <body className={`${cinzel.variable} ${cinzelDecorative.variable} ${crimsonText.variable} ${unifraktur.variable} ${imFell.variable} font-sans antialiased`}>
        {children}
        <ThemeAudio />
        <UiClickSound />

        <SupabaseStatus />
        <BuildWatch />
        <Analytics />
      </body>
    </html>
  )
}
