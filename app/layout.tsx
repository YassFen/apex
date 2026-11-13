import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Geist } from 'next/font/google'

// Self-hosted, preloaded font (no render-blocking request to Google Fonts).
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
import { themeBootScript } from '@/lib/utils/theme'

export const metadata: Metadata = {
  title: 'APEX – CrossFit Platform',
  description: 'El WOD de tu box, tus récords y el leaderboard en vivo.',
  manifest: '/manifest.json',
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'APEX' },
}

export const viewport: Viewport = {
  // Browser chrome color follows the device's light/dark preference.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#F3F3F6' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets data-theme/data-accent before React hydrates.
    <html lang="es" data-accent="lima" className={geist.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-bg text-t antialiased">
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
          }
        `}} />
      </body>
    </html>
  )
}
