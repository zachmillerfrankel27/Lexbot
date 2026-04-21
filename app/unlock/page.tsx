'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function UnlockForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })

    if (res.ok) {
      window.location.href = next
    } else {
      setError('Invalid invite code. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 w-full max-w-xs">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Enter invite code"
        autoFocus
        className="w-full bg-transparent border border-gray-700 rounded px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-400 tracking-widest uppercase text-center"
      />
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <button
        type="submit"
        disabled={loading || !code.trim()}
        className="w-full py-3 text-xs tracking-widest uppercase text-gray-400 border border-gray-700 rounded hover:border-gray-400 hover:text-gray-200 transition-colors disabled:opacity-30"
      >
        {loading ? 'Checking…' : 'Enter'}
      </button>
    </form>
  )
}

export default function UnlockPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-black gap-8 px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-light tracking-widest text-gray-200 uppercase">Orville</h1>
        <p className="text-xs text-gray-600 tracking-widest uppercase">Beta Access</p>
      </div>
      <Suspense>
        <UnlockForm />
      </Suspense>
      <p className="text-xs text-gray-700 text-center max-w-xs">
        Orville is currently invite-only. Enter your access code to continue.
      </p>
    </main>
  )
}
