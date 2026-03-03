'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Avatar } from './Avatar'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'listening' | 'thinking' | 'speaking'
type Message = { role: 'user' | 'assistant'; content: string }

// ─── Status label & color helpers ─────────────────────────────────────────────

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Click to speak',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
}

const STATUS_COLOR: Record<Status, string> = {
  idle: 'text-gray-500',
  listening: 'text-blue-400',
  thinking: 'text-purple-400',
  speaking: 'text-yellow-300',
}

const RING_CLASS: Record<Status, string> = {
  idle: 'border-gray-800 opacity-0',
  listening: 'ring-listening border-blue-500',
  thinking: 'ring-thinking border-purple-500',
  speaking: 'ring-speaking border-yellow-400',
}

// ─── Web Speech API type shim (not in lib.dom by default) ───────────────────

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LexBot() {
  const [status, setStatus] = useState<Status>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [audioAmplitude, setAudioAmplitude] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [hasGreeted, setHasGreeted] = useState(false)

  const statusRef = useRef<Status>('idle')
  const isSpeakingRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const recognitionRef = useRef<InstanceType<typeof SpeechRecognition> | null>(null)
  const messagesRef = useRef<Message[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Keep refs in sync
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Auto-scroll chat history
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── TTS + lip sync ─────────────────────────────────────────────────────────

  const speak = useCallback(async (text: string) => {
    setStatus('speaking')
    setLastResponse(text)
    isSpeakingRef.current = true

    // Ensure AudioContext exists (must be created from user gesture — already done by click)
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const audioCtx = audioCtxRef.current
    if (audioCtx.state === 'suspended') await audioCtx.resume()

    // ── Try ElevenLabs ──
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer()
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const source = audioCtx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(analyser)
        analyser.connect(audioCtx.destination)

        // Drive lip sync from amplitude
        const animate = () => {
          if (!isSpeakingRef.current) return
          analyser.getByteTimeDomainData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128 - 1
            sum += v * v
          }
          setAudioAmplitude(Math.sqrt(sum / dataArray.length))
          requestAnimationFrame(animate)
        }

        source.start()
        animate()

        source.onended = () => {
          isSpeakingRef.current = false
          setAudioAmplitude(0)
          setStatus('idle')
        }
        return // done — ElevenLabs succeeded
      }
    } catch (err) {
      console.warn('ElevenLabs TTS failed, falling back to browser speech:', err)
    }

    // ── Fallback: browser speechSynthesis ──
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 0.88
    utterance.pitch = 0.82
    utterance.volume = 1

    // Simulate lip sync with a timer since we can't tap into browser audio
    let lipInterval: ReturnType<typeof setInterval>
    utterance.onstart = () => {
      lipInterval = setInterval(() => {
        setAudioAmplitude(0.05 + Math.random() * 0.2)
      }, 80)
    }
    utterance.onend = () => {
      clearInterval(lipInterval)
      isSpeakingRef.current = false
      setAudioAmplitude(0)
      setStatus('idle')
    }
    utterance.onerror = () => {
      clearInterval(lipInterval)
      isSpeakingRef.current = false
      setAudioAmplitude(0)
      setStatus('idle')
    }
    window.speechSynthesis.speak(utterance)
  }, [])

  // ── Send message to Claude ─────────────────────────────────────────────────

  const handleUserMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return

      setStatus('thinking')
      setLiveTranscript('')

      const newMessages: Message[] = [
        ...messagesRef.current,
        { role: 'user', content: text },
      ]
      setMessages(newMessages)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages }),
        })

        const data = await res.json()
        if (data.message) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.message },
          ])
          await speak(data.message)
        } else {
          setStatus('idle')
        }
      } catch (err) {
        console.error('Chat error:', err)
        setStatus('idle')
      }
    },
    [speak]
  )

  // ── Start voice recognition ────────────────────────────────────────────────

  const startListening = useCallback(() => {
    // Only activate from idle
    if (statusRef.current !== 'idle') {
      // If speaking, cancel and go back to idle so user can speak again
      if (statusRef.current === 'speaking') {
        window.speechSynthesis.cancel()
        isSpeakingRef.current = false
        setAudioAmplitude(0)
        setStatus('idle')
      }
      return
    }

    // Bootstrap AudioContext on this user gesture
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert(
        'Voice input requires Google Chrome or another browser that supports the Web Speech API.\n\nPlease open this site in Chrome.'
      )
      return
    }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setStatus('listening')
      setLiveTranscript('')
    }

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setLiveTranscript(transcript)

      if (event.results[event.results.length - 1].isFinal) {
        handleUserMessage(transcript)
      }
    }

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error)
      }
      setStatus('idle')
      setLiveTranscript('')
    }

    recognition.onend = () => {
      if (statusRef.current === 'listening') setStatus('idle')
    }

    recognition.start()
    recognitionRef.current = recognition
  }, [handleUserMessage])

  // ── First greeting ─────────────────────────────────────────────────────────
  // Triggered the first time the user clicks the avatar

  const handleAvatarClick = useCallback(() => {
    if (!hasGreeted && statusRef.current === 'idle') {
      setHasGreeted(true)
      const greeting =
        "Good to meet you, counselor. I'm Lex, your law tutor. Tell me what case or concept you'd like to dig into — or ask me to help you prep for class or an exam. What's on your docket?"
      speak(greeting).then(() => {
        // After greeting finishes, auto-start listening
        // Small delay to let status settle
        setTimeout(() => {
          if (statusRef.current === 'idle') startListening()
        }, 300)
      })
      return
    }
    startListening()
  }, [hasGreeted, speak, startListening])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative w-full h-screen flex flex-col items-center overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(ellipse at 50% 40%, #0d0a1e 0%, #040210 55%, #000000 100%)',
      }}
    >
      {/* Scanning line — cinematic effect */}
      <div className="scanline" />

      {/* Title */}
      <div className="absolute top-6 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
        <h1
          className="text-2xl tracking-[0.3em] uppercase font-light text-gray-400"
          style={{ fontFamily: "'Cinzel', Georgia, serif", letterSpacing: '0.35em' }}
        >
          L E X
        </h1>
        <p className="text-xs tracking-widest text-gray-700 uppercase mt-1">
          AI Law Tutor
        </p>
      </div>

      {/* 3D Canvas */}
      <div className="w-full flex-1 relative">
        {/* Status ring — decorative circle behind the face */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div
            className={`w-72 h-72 rounded-full border transition-all duration-700 ${RING_CLASS[status]}`}
          />
        </div>

        <Canvas
          camera={{ position: [0, 0, 5], fov: 30 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <Suspense fallback={null}>
            <Avatar
              isSpeaking={status === 'speaking'}
              isListening={status === 'listening'}
              isThinking={status === 'thinking'}
              audioAmplitude={audioAmplitude}
              onClick={handleAvatarClick}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Status label */}
      <div className="pb-4 flex flex-col items-center gap-3 z-10 w-full px-4">
        <p
          className={`text-sm tracking-[0.2em] uppercase font-light transition-colors duration-500 ${STATUS_COLOR[status]}`}
        >
          {STATUS_LABEL[status]}
        </p>

        {/* Live transcript while listening */}
        {status === 'listening' && liveTranscript && (
          <p className="text-blue-300 text-sm text-center max-w-lg opacity-80 fade-up italic">
            "{liveTranscript}"
          </p>
        )}

        {/* Last response text while/after speaking */}
        {(status === 'speaking' || (status === 'idle' && lastResponse)) && (
          <p className="text-gray-400 text-sm text-center max-w-xl leading-relaxed fade-up px-4">
            {lastResponse}
          </p>
        )}

        {/* Toggle conversation history */}
        {messages.length > 0 && (
          <button
            className="text-xs text-gray-700 hover:text-gray-500 tracking-widest uppercase transition-colors duration-200 mt-1"
            onClick={() => setShowHistory((h) => !h)}
          >
            {showHistory ? '▲ Hide transcript' : '▼ Show transcript'}
          </button>
        )}
      </div>

      {/* Conversation history panel */}
      {showHistory && messages.length > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0 h-64 z-20 flex flex-col"
          style={{ background: 'linear-gradient(to top, #000000ee, #000000bb, transparent)' }}
        >
          <div className="flex-1 overflow-y-auto chat-history px-6 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] text-xs leading-relaxed px-3 py-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-950 text-blue-200 border border-blue-800'
                      : 'bg-gray-950 text-gray-300 border border-gray-800'
                  }`}
                >
                  <span className="block text-[10px] uppercase tracking-widest opacity-50 mb-1">
                    {msg.role === 'user' ? 'You' : 'Lex'}
                  </span>
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Bottom hint */}
      {!hasGreeted && status === 'idle' && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none z-10">
          <p className="text-gray-700 text-xs tracking-widest uppercase animate-pulse">
            Click the face to begin
          </p>
        </div>
      )}
    </div>
  )
}
