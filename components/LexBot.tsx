'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Avatar } from './Avatar'
import { Walkthrough, shouldShowWalkthrough } from './Walkthrough'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'listening' | 'thinking' | 'speaking'
type Mode = 'discussion' | 'socratic' | 'examprep'
type AppPhase = 'awaiting_name' | 'awaiting_mode' | 'active'
type ExamStep = 'topic' | 'factpattern' | 'issuespotting' | 'writtenanswer' | 'grading' | 'done'
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

const MODE_LABELS: Record<Mode, string> = {
  discussion: 'Discussion',
  socratic: 'Socratic',
  examprep: 'Exam Prep',
}

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  discussion: 'Free-flowing conversation — clarify, explore, and go deep on any topic.',
  socratic: 'Lex guides you with questions. Derive the rule yourself.',
  examprep: 'Fact pattern → issue spotting → written answer → graded feedback.',
}

const EXAM_STEP_LABELS: Record<ExamStep, string> = {
  topic: 'Choose a topic',
  factpattern: 'Read the fact pattern',
  issuespotting: 'Spot the issues',
  writtenanswer: 'Write your answer',
  grading: 'Getting feedback...',
  done: 'Review complete',
}

// ─── Web Speech API type shim ────────────────────────────────────────────────

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start(): void
  stop(): void
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LexBot() {
  const [status, setStatus] = useState<Status>('idle')
  const [mode, setMode] = useState<Mode | null>(null)
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('lexbot-history')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [audioAmplitude, setAudioAmplitude] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [hasGreeted, setHasGreeted] = useState(false)
  const [showWalkthrough, setShowWalkthrough] = useState(false)
  const [userName, setUserName] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    try { return localStorage.getItem('lexbot-username') ?? '' } catch { return '' }
  })
  const [appPhase, setAppPhase] = useState<AppPhase>('active')

  // Show walkthrough on first visit (deferred so localStorage is available)
  useEffect(() => {
    if (shouldShowWalkthrough()) setShowWalkthrough(true)
  }, [])

  // Exam Prep state
  const [examStep, setExamStep] = useState<ExamStep>('topic')
  const [factPattern, setFactPattern] = useState('')
  const [writtenAnswer, setWrittenAnswer] = useState('')
  const [notes, setNotes] = useState('')
  const [notesFileName, setNotesFileName] = useState('')
  const [showWrittenInput, setShowWrittenInput] = useState(false)
  const [showIsDoneButton, setShowIsDoneButton] = useState(false)

  const statusRef = useRef<Status>('idle')
  const modeRef = useRef<Mode | null>(null)
  const appPhaseRef = useRef<AppPhase>('active')
  const startListeningRef = useRef<() => void>(() => {})
  const handleModeDetectionRef = useRef<(transcript: string) => void>(() => {})
  const isSpeakingRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const messagesRef = useRef<Message[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const notesInputRef = useRef<HTMLInputElement>(null)
  const writtenAnswerRef = useRef<HTMLTextAreaElement>(null)

  // Keep refs in sync
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { appPhaseRef.current = appPhase }, [appPhase])

  // Persist chat history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('lexbot-history', JSON.stringify(messages))
    } catch {
      // storage quota exceeded or unavailable — ignore
    }
  }, [messages])

  // Auto-scroll chat history
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── TTS + lip sync ─────────────────────────────────────────────────────────

  const speak = useCallback(async (text: string) => {
    setStatus('speaking')
    setLastResponse(text)
    isSpeakingRef.current = true

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const audioCtx = audioCtxRef.current
    if (audioCtx.state === 'suspended') await audioCtx.resume()

    // Try ElevenLabs — await until audio fully ends before resolving
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

        await new Promise<void>((resolve) => {
          source.onended = () => {
            isSpeakingRef.current = false
            setAudioAmplitude(0)
            setStatus('idle')
            resolve()
          }
          source.start()
          animate()
        })
        return
      } else {
        const errText = await res.text()
        console.warn('ElevenLabs TTS error:', res.status, errText)
      }
    } catch (err) {
      console.warn('ElevenLabs TTS failed, falling back to browser speech:', err)
    }

    // Fallback: browser speechSynthesis — await until speech fully ends
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 0.88
    utterance.pitch = 0.82
    utterance.volume = 1

    let lipInterval: ReturnType<typeof setInterval>
    utterance.onstart = () => {
      lipInterval = setInterval(() => {
        setAudioAmplitude(0.05 + Math.random() * 0.2)
      }, 80)
    }

    await new Promise<void>((resolve) => {
      utterance.onend = () => {
        clearInterval(lipInterval)
        isSpeakingRef.current = false
        setAudioAmplitude(0)
        setStatus('idle')
        resolve()
      }
      utterance.onerror = () => {
        clearInterval(lipInterval)
        isSpeakingRef.current = false
        setAudioAmplitude(0)
        setStatus('idle')
        resolve()
      }
      window.speechSynthesis.speak(utterance)
    })
  }, [])

  // ── Send message to Claude ─────────────────────────────────────────────────

  const handleUserMessage = useCallback(
    async (text: string, overrideMode?: Mode) => {
      if (!text.trim()) return

      setStatus('thinking')
      setLiveTranscript('')

      const newMessages: Message[] = [
        ...messagesRef.current,
        { role: 'user', content: text },
      ]
      setMessages(newMessages)

      const activeMode = overrideMode ?? modeRef.current ?? 'discussion'

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages, mode: activeMode, notes }),
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
    [speak, notes]
  )

  // ── Voice recognition ──────────────────────────────────────────────────────

  const handleVoiceResult: (transcript: string) => void = useCallback(
    (transcript: string) => {
      // ── Initialization phases ──────────────────────────────────────────────
      if (appPhaseRef.current === 'awaiting_name') {
        const raw = transcript.trim().split(/\s+/)[0] ?? 'Counselor'
        const name = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
        setUserName(name)
        try { localStorage.setItem('lexbot-username', name) } catch { /* ignore */ }
        setAppPhase('awaiting_mode')
        appPhaseRef.current = 'awaiting_mode'
        speak(
          `Hi ${name}! What do you want to work on today? We can simply talk a topic out, work through something Socratically, or run an exam prep session.`
        ).then(() => startListeningRef.current())
        return
      }

      if (appPhaseRef.current === 'awaiting_mode') {
        handleModeDetectionRef.current(transcript)
        return
      }

      // ── Normal conversation ────────────────────────────────────────────────
      if (modeRef.current === 'examprep') {
        const step = examStep
        if (step === 'topic') {
          handleExamTopicVoice(transcript)
          return
        }
        if (step === 'issuespotting') {
          handleUserMessage(transcript, 'examprep')
          return
        }
      }
      handleUserMessage(transcript)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [examStep, handleUserMessage]
  )

  const startListening = useCallback(() => {
    if (statusRef.current !== 'idle') {
      if (statusRef.current === 'speaking') {
        window.speechSynthesis.cancel()
        isSpeakingRef.current = false
        setAudioAmplitude(0)
        setStatus('idle')
      }
      return
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input requires Google Chrome.')
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
        handleVoiceResult(transcript)
      }
    }

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') console.warn('Speech recognition error:', event.error)
      setStatus('idle')
      setLiveTranscript('')
    }

    recognition.onend = () => {
      if (statusRef.current === 'listening') setStatus('idle')
    }

    recognition.start()
    recognitionRef.current = recognition
  }, [handleVoiceResult])

  // Keep startListeningRef in sync so handleVoiceResult can call it without a circular dep
  useEffect(() => { startListeningRef.current = startListening }, [startListening])

  // ── Mode selection ─────────────────────────────────────────────────────────

  const selectMode = useCallback((selectedMode: Mode, customGreeting?: string) => {
    setMode(selectedMode)
    setShowModeSelector(false)
    setAppPhase('active')
    appPhaseRef.current = 'active'
    setMessages([])
    setLastResponse('')
    setExamStep('topic')
    setFactPattern('')
    setWrittenAnswer('')
    setShowWrittenInput(false)
    setShowIsDoneButton(false)

    const defaultGreetings: Record<Mode, string> = {
      discussion: "Discussion mode. What case or concept do you want to dig into?",
      socratic: "Socratic mode. I won't give you answers — I'll ask questions until you find them yourself. What topic are we working on?",
      examprep: "Exam prep mode. Give me a topic or a specific area of law and I'll generate a fact pattern for you.",
    }

    const greeting = customGreeting ?? defaultGreetings[selectedMode]

    speak(greeting).then(() => {
      if (selectedMode !== 'examprep') startListening()
    })
  }, [speak, startListening])

  // ── AI-powered mode detection ──────────────────────────────────────────────

  const handleModeDetection = useCallback(async (transcript: string) => {
    setStatus('thinking')
    try {
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      if (!res.ok) throw new Error('classify failed')
      const { mode: detectedMode, response: firstResponse } = await res.json()
      selectMode(detectedMode as Mode, firstResponse)
    } catch {
      // Network/API failure — fall back gracefully
      speak("I had trouble with that. Could you say it again?")
        .then(() => startListeningRef.current())
      setStatus('idle')
    }
  }, [selectMode, speak])

  useEffect(() => { handleModeDetectionRef.current = handleModeDetection }, [handleModeDetection])

  // ── Exam Prep flow ─────────────────────────────────────────────────────────

  const handleExamTopicVoice = useCallback(
    async (topic: string) => {
      setExamStep('factpattern')
      setStatus('thinking')
      setLiveTranscript('')

      const newMessages: Message[] = [
        ...messagesRef.current,
        { role: 'user', content: `Generate an exam fact pattern on: ${topic}` },
      ]
      setMessages(newMessages)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages, mode: 'examprep', notes }),
        })
        const data = await res.json()
        if (data.message) {
          setFactPattern(data.message)
          setMessages((prev) => [...prev, { role: 'assistant', content: data.message }])
          await speak(data.message)
          setExamStep('issuespotting')
          setShowIsDoneButton(true)
        } else {
          setStatus('idle')
        }
      } catch (err) {
        console.error('Exam prep error:', err)
        setStatus('idle')
      }
    },
    [speak, notes]
  )

  const handleIsDone = useCallback(() => {
    setShowIsDoneButton(false)
    setExamStep('writtenanswer')
    setShowWrittenInput(true)
    speak("Got it. Now write out your full answer — use IRAC structure. Take your time and type it below when you're ready.")
  }, [speak])

  const handleSubmitWrittenAnswer = useCallback(async () => {
    if (!writtenAnswer.trim()) return
    setShowWrittenInput(false)
    setExamStep('grading')
    await handleUserMessage(`Here is my written answer: ${writtenAnswer}`, 'examprep')
    setExamStep('done')
    setWrittenAnswer('')
  }, [writtenAnswer, handleUserMessage])

  // ── Notes file upload ──────────────────────────────────────────────────────

  const handleNotesUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNotesFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      setNotes(text.slice(0, 8000))
    }
    reader.readAsText(file)
  }, [])

  // ── Download fact pattern ──────────────────────────────────────────────────

  const downloadFactPattern = useCallback(() => {
    if (!factPattern) return
    const blob = new Blob([factPattern], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fact-pattern.txt'
    a.click()
    URL.revokeObjectURL(url)
  }, [factPattern])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative w-full h-screen flex flex-col items-center overflow-hidden select-none"
      style={{
        background:
          'radial-gradient(ellipse at 50% 40%, #0d0a1e 0%, #040210 55%, #000000 100%)',
      }}
    >
      <div className="scanline" />

      {/* Title + mode indicator */}
      <div className="absolute top-6 left-0 right-0 flex flex-col items-center z-10 pointer-events-none">
        <h1
          className="text-2xl tracking-[0.3em] uppercase font-light text-gray-400"
          style={{ fontFamily: "'Cinzel', Georgia, serif", letterSpacing: '0.35em' }}
        >
          L E X
        </h1>
        <p className="text-xs tracking-widest text-gray-700 uppercase mt-1">
          {mode ? MODE_LABELS[mode] : 'AI Law Tutor'}
        </p>
      </div>

      {/* Mode selector button (top right) */}
      {hasGreeted && (
        <button
          className="absolute top-6 right-6 z-20 text-xs text-gray-600 hover:text-gray-400 tracking-widest uppercase transition-colors duration-200 pointer-events-auto"
          onClick={() => setShowModeSelector(true)}
        >
          {mode ? '⟳ Mode' : 'Select Mode'}
        </button>
      )}

      {/* 3D Canvas */}
      <div className="w-full flex-1 relative">
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
              onClick={() => {
                if (!hasGreeted) {
                  setHasGreeted(true)
                  if (!userName) {
                    setAppPhase('awaiting_name')
                    appPhaseRef.current = 'awaiting_name'
                    speak("Hi there — I'm Lex, your law tutor. What's your name?").then(() => startListeningRef.current())
                  } else {
                    setAppPhase('awaiting_mode')
                    appPhaseRef.current = 'awaiting_mode'
                    speak(
                      `Hi ${userName}, what do you want to work on today? We can simply talk a topic out, work through something Socratically, or run an exam prep session.`
                    ).then(() => startListeningRef.current())
                  }
                  return
                }
                if (mode === 'examprep' && examStep === 'writtenanswer') return
                startListening()
              }}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Bottom UI */}
      <div className="pb-4 flex flex-col items-center gap-3 z-10 w-full px-4">

        {/* Exam Prep step indicator */}
        {mode === 'examprep' && (
          <p className="text-xs tracking-widest text-purple-500 uppercase">
            {EXAM_STEP_LABELS[examStep]}
          </p>
        )}

        {/* Status label */}
        <p
          className={`text-sm tracking-[0.2em] uppercase font-light transition-colors duration-500 ${STATUS_COLOR[status]}`}
        >
          {mode === 'examprep' && examStep === 'writtenanswer' ? 'Type your answer below' : STATUS_LABEL[status]}
        </p>

        {/* Live transcript */}
        {status === 'listening' && liveTranscript && (
          <p className="text-blue-300 text-sm text-center max-w-lg opacity-80 fade-up italic">
            "{liveTranscript}"
          </p>
        )}

        {/* Last response text */}
        {(status === 'speaking' || (status === 'idle' && lastResponse)) && examStep !== 'writtenanswer' && (
          <p className="text-gray-400 text-sm text-center max-w-xl leading-relaxed fade-up px-4">
            {lastResponse}
          </p>
        )}

        {/* Fact pattern display + download */}
        {mode === 'examprep' && factPattern && examStep !== 'topic' && (
          <div className="w-full max-w-2xl bg-gray-950 border border-gray-800 rounded-lg p-4 text-xs text-gray-300 leading-relaxed max-h-48 overflow-y-auto fade-up">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] uppercase tracking-widest text-gray-600">Fact Pattern</span>
              <button
                onClick={downloadFactPattern}
                className="text-[10px] uppercase tracking-widest text-yellow-600 hover:text-yellow-400 transition-colors pointer-events-auto"
              >
                ↓ Download
              </button>
            </div>
            {factPattern}
          </div>
        )}

        {/* "I'm Done" button (issue spotting) */}
        {showIsDoneButton && (
          <button
            onClick={handleIsDone}
            className="pointer-events-auto px-6 py-2 text-xs uppercase tracking-widest border border-yellow-600 text-yellow-400 hover:bg-yellow-900 hover:bg-opacity-30 rounded-lg transition-all duration-200 fade-up"
          >
            I'm Done Spotting Issues →
          </button>
        )}

        {/* Written answer input */}
        {showWrittenInput && (
          <div className="w-full max-w-2xl flex flex-col gap-2 fade-up pointer-events-auto">
            <textarea
              ref={writtenAnswerRef}
              value={writtenAnswer}
              onChange={(e) => setWrittenAnswer(e.target.value)}
              placeholder="Write your full IRAC answer here..."
              className="w-full h-40 bg-gray-950 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 leading-relaxed resize-none focus:outline-none focus:border-purple-600 transition-colors"
            />
            <button
              onClick={handleSubmitWrittenAnswer}
              disabled={!writtenAnswer.trim()}
              className="self-end px-6 py-2 text-xs uppercase tracking-widest bg-purple-900 border border-purple-600 text-purple-200 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all duration-200"
            >
              Submit for Grading →
            </button>
          </div>
        )}

        {/* Notes upload */}
        {mode === 'examprep' && (examStep === 'topic' || examStep === 'factpattern') && (
          <div className="flex items-center gap-2 pointer-events-auto">
            <input
              ref={notesInputRef}
              type="file"
              accept=".txt,.pdf,.md"
              className="hidden"
              onChange={handleNotesUpload}
            />
            <button
              onClick={() => notesInputRef.current?.click()}
              className="text-xs text-gray-600 hover:text-gray-400 tracking-widest uppercase transition-colors duration-200"
            >
              {notesFileName ? `✓ ${notesFileName}` : '+ Upload notes/outline'}
            </button>
            {notesFileName && (
              <button
                onClick={() => { setNotes(''); setNotesFileName('') }}
                className="text-xs text-gray-700 hover:text-red-500 transition-colors"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Conversation history toggle */}
        {messages.length > 0 && (
          <div className="pointer-events-auto flex items-center gap-3 mt-1">
            <button
              className="text-xs text-gray-700 hover:text-gray-500 tracking-widest uppercase transition-colors duration-200"
              onClick={() => setShowHistory((h) => !h)}
            >
              {showHistory ? '▲ Hide transcript' : '▼ Show transcript'}
            </button>
            <button
              className="text-xs text-gray-700 hover:text-red-500 tracking-widest uppercase transition-colors duration-200"
              onClick={() => {
                setMessages([])
                localStorage.removeItem('lexbot-history')
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Conversation history panel */}
      {showHistory && messages.length > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0 h-64 z-20 flex flex-col pointer-events-auto"
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

      {/* Mode selector modal */}
      {showModeSelector && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        >
          <div className="flex flex-col items-center gap-6 px-8 py-10 max-w-md w-full">
            <h2
              className="text-lg tracking-[0.3em] uppercase text-gray-400 font-light"
              style={{ fontFamily: "'Cinzel', Georgia, serif" }}
            >
              Choose Mode
            </h2>

            {(['discussion', 'socratic', 'examprep'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => selectMode(m)}
                className={`w-full text-left px-5 py-4 rounded-lg border transition-all duration-200 ${
                  mode === m
                    ? 'border-yellow-500 bg-yellow-900 bg-opacity-20'
                    : 'border-gray-800 hover:border-gray-600 bg-gray-950 hover:bg-gray-900'
                }`}
              >
                <span
                  className="block text-sm text-gray-200 mb-1"
                  style={{ fontFamily: "'Cinzel', Georgia, serif" }}
                >
                  {MODE_LABELS[m]}
                </span>
                <span className="block text-xs text-gray-500 leading-relaxed">
                  {MODE_DESCRIPTIONS[m]}
                </span>
              </button>
            ))}

            {mode && (
              <button
                onClick={() => setShowModeSelector(false)}
                className="text-xs text-gray-700 hover:text-gray-500 tracking-widest uppercase transition-colors mt-2"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Initial hint */}
      {!hasGreeted && status === 'idle' && !showWalkthrough && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none z-10">
          <p className="text-gray-700 text-xs tracking-widest uppercase animate-pulse">
            Click the face to begin
          </p>
        </div>
      )}

      {/* First-time walkthrough */}
      {showWalkthrough && (
        <Walkthrough onDone={() => setShowWalkthrough(false)} />
      )}
    </div>
  )
}
