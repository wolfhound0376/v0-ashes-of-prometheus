import type { Metadata } from 'next'
import { Cinzel, Cinzel_Decorative, Crimson_Text, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SupabaseStatus } from '@/components/supabase-status'
import { BuildWatch } from '@/components/build-watch'
import ThemeAudio from '@/components/theme-audio'
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
      <body className={`${cinzel.variable} ${cinzelDecorative.variable} ${crimsonText.variable} font-sans antialiased`}>
        {children}
        <ThemeAudio />
        <SupabaseStatus />
        <BuildWatch />
        <Analytics />
      </body>
    </html>
  )
}
