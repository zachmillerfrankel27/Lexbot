'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const Scene = dynamic(() => import('./Scene'), { ssr: false })

type HeadState = 'idle' | 'listening' | 'thinking' | 'speaking'

export default function PreviewPage() {
  const [headState, setHeadState] = useState<HeadState>('idle')
  const [amplitude, setAmplitude] = useState(0)
  const animFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)

  // Animate fake audio amplitude when speaking
  useEffect(() => {
    if (headState === 'speaking') {
      startTimeRef.current = performance.now()
      const tick = () => {
        const t = (performance.now() - startTimeRef.current) / 1000
        // Simulate natural speech amplitude envelope
        const amp =
          0.35 +
          Math.sin(t * 7.3) * 0.2 +
          Math.sin(t * 3.1) * 0.15 +
          Math.sin(t * 13.7) * 0.08
        setAmplitude(Math.max(0, Math.min(1, amp)))
        animFrameRef.current = requestAnimationFrame(tick)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    } else {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
      setAmplitude(0)
    }
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [headState])

  const STATES: { id: HeadState; label: string }[] = [
    { id: 'idle',      label: 'Idle'      },
    { id: 'listening', label: 'Listening' },
    { id: 'thinking',  label: 'Thinking'  },
    { id: 'speaking',  label: 'Speaking'  },
  ]

  return (
    <div
      className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#000' }}
    >
      {/* 3D scene */}
      <div className="absolute inset-0">
        <Scene
          isSpeaking={headState === 'speaking'}
          isListening={headState === 'listening'}
          isThinking={headState === 'thinking'}
          audioAmplitude={amplitude}
        />
      </div>

      {/* State label */}
      <div className="absolute top-8 left-0 right-0 flex justify-center pointer-events-none">
        <p
          className="text-[10px] tracking-[0.4em] uppercase"
          style={{ color: '#555', fontFamily: "'Cinzel', Georgia, serif" }}
        >
          Wireframe Preview — {headState}
        </p>
      </div>

      {/* Controls */}
      <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-3 px-6">
        {STATES.map(({ id, label }) => {
          const active = headState === id
          return (
            <button
              key={id}
              onClick={() => setHeadState(id)}
              className="px-5 py-2 text-[10px] tracking-[0.25em] uppercase rounded transition-all duration-200"
              style={{
                border: active ? '1px solid #f5c842' : '1px solid #333',
                color: active ? '#f5c842' : '#555',
                background: 'transparent',
                fontFamily: "'Cinzel', Georgia, serif",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Back link */}
      <div className="absolute top-8 left-8">
        <Link
          href="/"
          className="text-[10px] tracking-[0.3em] uppercase transition-colors duration-200"
          style={{ color: '#444', fontFamily: "'Cinzel', Georgia, serif" }}
        >
          ← Back
        </Link>
      </div>
    </div>
  )
}
