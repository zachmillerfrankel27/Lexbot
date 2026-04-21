import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Orville — Your AI Law Tutor',
  description: 'A conversational 3D AI law tutor — case analysis, real-world application, and exam prep, powered by Orbly.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="noise">{children}</body>
    </html>
  )
}
