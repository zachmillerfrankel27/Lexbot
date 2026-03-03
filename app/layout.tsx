import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lex — Your AI Law Tutor',
  description: 'A conversational 3D AI tutor for law school — case analysis, real-world application, exam strategy.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="noise">{children}</body>
    </html>
  )
}
