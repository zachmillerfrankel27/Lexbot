'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'orville-onboarded'

const STEPS = [
  {
    label: 'Welcome',
    title: 'Meet Orville',
    body: 'Your AI law tutor. Voice-first, Socratic, and built for the way law school actually works — case analysis, exam prep, and the kind of deep thinking your professors expect.',
  },
  {
    label: 'How it works',
    title: 'Click to Speak',
    body: "Tap Orville to activate your microphone. Speak naturally — just like office hours. Orville listens, thinks, then responds out loud. You can also read the transcript at any time.",
  },
  {
    label: 'Modes',
    title: 'Three Ways to Learn',
    modes: [
      {
        name: 'Discussion',
        desc: 'Free-flowing conversation. Clarify doctrine, explore policy, go deep on any case or concept.',
      },
      {
        name: 'Socratic',
        desc: "Orville leads with questions. You derive the rule yourself — just like getting cold-called in class.",
      },
      {
        name: 'Exam Prep',
        desc: 'Orville generates a fact pattern, you spot issues and write your IRAC answer, then Orville grades it.',
      },
    ],
    footer: 'Switch modes anytime from the bottom of the screen.',
  },
  {
    label: 'Privacy',
    title: 'Before You Begin',
    body: 'Your conversations are sent to Anthropic\'s Claude AI to generate responses, and to ElevenLabs to produce Orville\'s voice. Conversation history is stored only in your browser. Nothing is sold or shared with third parties.',
    footer: 'By continuing you agree to our Privacy Policy.',
  },
]

interface WalkthroughProps {
  onDone: () => void
}

export function Walkthrough({ onDone }: WalkthroughProps) {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  function finish() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    onDone()
  }

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto transition-opacity duration-500"
      style={{
        background: 'rgba(0,0,0,0.92)',
        opacity: visible ? 1 : 0,
      }}
    >
      <div className="flex flex-col items-center gap-8 px-8 py-10 max-w-md w-full">

        {/* Step indicators */}
        <div className="flex gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="h-px w-8 transition-all duration-300"
              style={{ background: i === step ? '#f5c842' : '#333' }}
            />
          ))}
        </div>

        {/* Step label */}
        <p className="text-[10px] tracking-[0.3em] uppercase text-gray-600">
          {current.label}
        </p>

        {/* Title */}
        <h2
          className="text-2xl tracking-[0.2em] uppercase text-gray-200 font-light text-center"
          style={{ fontFamily: "'Cinzel', Georgia, serif" }}
        >
          {current.title}
        </h2>

        {/* Body or mode cards */}
        {'modes' in current ? (
          <div className="flex flex-col gap-3 w-full">
            {current.modes!.map((m) => (
              <div
                key={m.name}
                className="px-5 py-4 rounded-lg border border-gray-800 bg-gray-950"
              >
                <span
                  className="block text-sm text-gray-200 mb-1"
                  style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                >
                  {m.name}
                </span>
                <span className="block text-xs text-gray-500 leading-relaxed">
                  {m.desc}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 leading-relaxed text-center">
            {current.body}
          </p>
        )}

        {/* Footer note */}
        {'footer' in current && current.footer && (
          <p className="text-xs text-gray-700 text-center">
            {current.footer}{' '}
            {isLast && (
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors"
              >
                Read it here.
              </a>
            )}
          </p>
        )}

        {/* Navigation */}
        <div className="flex items-center gap-6 mt-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-xs text-gray-700 hover:text-gray-400 tracking-widest uppercase transition-colors"
            >
              ← Back
            </button>
          )}

          {isLast ? (
            <button
              onClick={finish}
              className="px-8 py-3 text-xs tracking-widest uppercase border border-yellow-700 text-yellow-500 hover:border-yellow-500 hover:text-yellow-300 rounded transition-colors duration-200"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              Let's Begin
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="px-8 py-3 text-xs tracking-widest uppercase border border-gray-700 text-gray-400 hover:border-gray-400 hover:text-gray-200 rounded transition-colors duration-200"
            >
              Next →
            </button>
          )}

          {step === 0 && (
            <button
              onClick={finish}
              className="text-xs text-gray-800 hover:text-gray-600 tracking-widest uppercase transition-colors"
            >
              Skip
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

/** Returns true if this is the user's first visit (no onboarded flag in localStorage). */
export function shouldShowWalkthrough(): boolean {
  if (typeof window === 'undefined') return false
  try { return !localStorage.getItem(STORAGE_KEY) } catch { return false }
}
