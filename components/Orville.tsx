'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Avatar } from './Avatar'
import { Walkthrough, shouldShowWalkthrough } from './Walkthrough'
import { ProfileModal, SessionEntry } from './ProfileModal'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'idle' | 'listening' | 'thinking' | 'speaking'
type Mode = 'discussion' | 'socratic' | 'examprep'
type AppPhase = 'awaiting_name' | 'awaiting_year' | 'awaiting_courses' | 'awaiting_mode' | 'active'
type ExamStep = 'topic' | 'factpattern' | 'issuespotting' | 'writtenanswer' | 'grading' | 'done'
type Message = { role: 'user' | 'assistant'; content: string }

// Words that should never be accepted as a user's name
const NON_NAMES = new Set(['i', 'a', 'an', 'the', 'my', 'is', 'am', 'are', 'its', 'it', 'there', 'name', 'what', 'hi', 'hey', 'hello', 'just', 'uh', 'um', 'orville', 'tutor', 'law', 'your', 'you', 'yours'])

// ─── Theme — edit this object to rebrand the entire interface ─────────────────

const THEME = {
  // Voice state colors
  status: {
    idle:      { text: 'text-gray-500',   ring: 'border-gray-800 opacity-0' },
    listening: { text: 'text-blue-400',   ring: 'ring-listening border-blue-500' },
    thinking:  { text: 'text-purple-400', ring: 'ring-thinking border-purple-500' },
    speaking:  { text: 'text-yellow-300', ring: 'ring-speaking border-yellow-400' },
  },
  // Brand accent — CTAs, selected state, download links
  accentBtn:      'border-yellow-600 text-yellow-400 hover:bg-yellow-900 hover:bg-opacity-30',
  accentSelected: 'border-yellow-500 bg-yellow-900 bg-opacity-20',
  accentDownload: 'text-yellow-600 hover:text-yellow-400',
  // Exam prep
  examStep:   'text-purple-500',
  submitBtn:  'bg-purple-900 border-purple-600 text-purple-200 hover:bg-purple-800',
  // Conversation
  transcript: 'text-blue-300',
  userMsg:    'bg-blue-950 text-blue-200 border-blue-800',
  // Fact pattern document panel — light background improves reading retention
  docPanel: {
    border:   'border-stone-200',
    bg:       'bg-amber-50',
    header:   'text-amber-700',
    download: 'text-amber-700 hover:text-amber-500',
    hint:     'text-amber-600',
    body:     'text-gray-800',
  },
}

// ─── Status label & color helpers ─────────────────────────────────────────────

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Click to speak',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
}

const STATUS_COLOR: Record<Status, string> = {
  idle:      THEME.status.idle.text,
  listening: THEME.status.listening.text,
  thinking:  THEME.status.thinking.text,
  speaking:  THEME.status.speaking.text,
}

const MODE_LABELS: Record<Mode, string> = {
  discussion: 'Discussion',
  socratic: 'Socratic',
  examprep: 'Exam Prep',
}

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  discussion: 'Free-flowing conversation — clarify, explore, and go deep on any topic.',
  socratic: 'Orville guides you with questions. Derive the rule yourself.',
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

export function Orville() {
  const [status, setStatus] = useState<Status>('idle')
  const [mode, setMode] = useState<Mode | null>(null)
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('orville-history')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [audioAmplitude, setAudioAmplitude] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [lastResponse, setLastResponse] = useState('')
  const [micError, setMicError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [hasGreeted, setHasGreeted] = useState(false)
  const [showWalkthrough, setShowWalkthrough] = useState(false)
  const [browserSupported, setBrowserSupported] = useState(true)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackNote, setFeedbackNote] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [userName, setUserName] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    try {
      const stored = localStorage.getItem('orville-username') ?? ''
      if (NON_NAMES.has(stored.toLowerCase())) {
        localStorage.removeItem('orville-username')
        return ''
      }
      return stored
    } catch { return '' }
  })
  const [appPhase, setAppPhase] = useState<AppPhase>('active')

  // Show walkthrough on first visit (deferred so localStorage is available)
  useEffect(() => {
    if (shouldShowWalkthrough()) setShowWalkthrough(true)
  }, [])

  // Detect browser voice support after mount (SSR-safe)
  useEffect(() => {
    setBrowserSupported(
      'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
    )
  }, [])

  // Exam Prep state
  const [examStep, setExamStep] = useState<ExamStep>('topic')
  const [factPattern, setFactPattern] = useState('')
  const [writtenAnswer, setWrittenAnswer] = useState('')
  const [notes, setNotes] = useState('')
  const [notesFileName, setNotesFileName] = useState('')
  const [showWrittenInput, setShowWrittenInput] = useState(false)
  const [showIsDoneButton, setShowIsDoneButton] = useState(false)
  const [showFactPanel, setShowFactPanel] = useState(false)
  const [userLevel, setUserLevel] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('orville-level') ?? ''
  })
  const [showNotesPrompt, setShowNotesPrompt] = useState(false)
  const [userYear, setUserYear] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('orville-year') ?? ''
  })
  const [userCourses, setUserCourses] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('orville-courses')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [showProfile, setShowProfile] = useState(false)
  const [sessions, setSessions] = useState<SessionEntry[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('orville-sessions')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const statusRef = useRef<Status>('idle')
  const modeRef = useRef<Mode | null>(null)
  const appPhaseRef = useRef<AppPhase>('active')
  const examStepRef = useRef<ExamStep>('topic')
  const notesRef = useRef<string>('')
  const lastExamTopicRef = useRef('')
  const pendingTopicRef = useRef('')
  const showNotesPromptRef = useRef(false)
  const handleExamTopicVoiceRef = useRef<(topic: string) => Promise<void>>(() => Promise.resolve())
  const startListeningRef = useRef<() => void>(() => {})
  const handleModeDetectionRef = useRef<(transcript: string) => void>(() => {})
  const handleUserMessageRef = useRef<(text: string, overrideMode?: Mode) => Promise<void>>(() => Promise.resolve())
  const isSpeakingRef = useRef(false)
  const speakLockRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const messagesRef = useRef<Message[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const notesInputRef = useRef<HTMLInputElement>(null)
  const writtenAnswerRef = useRef<HTMLTextAreaElement>(null)
  const awaitingReadRef = useRef(false)
  const awaitingStartRef = useRef(false)
  const factPatternRef = useRef('')
  const sessionStartRef = useRef<{ mode: Mode; start: number; topic?: string } | null>(null)
  const userYearRef = useRef(userYear)
  const userCoursesRef = useRef<string[]>(userCourses)
  const listenStartTimeRef = useRef(0)

  // Keep refs in sync
  useEffect(() => { statusRef.current = status }, [status])
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { appPhaseRef.current = appPhase }, [appPhase])
  useEffect(() => { examStepRef.current = examStep }, [examStep])
  useEffect(() => { notesRef.current = notes }, [notes])
  useEffect(() => { factPatternRef.current = factPattern }, [factPattern])
  useEffect(() => { userYearRef.current = userYear }, [userYear])
  useEffect(() => { userCoursesRef.current = userCourses }, [userCourses])

  // Persist chat history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('orville-history', JSON.stringify(messages))
    } catch {
      // storage quota exceeded or unavailable — ignore
    }
  }, [messages])

  // Persist sessions to localStorage
  useEffect(() => {
    try { localStorage.setItem('orville-sessions', JSON.stringify(sessions)) } catch {}
  }, [sessions])

  // Save session on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!sessionStartRef.current) return
      const { mode: sMode, start, topic } = sessionStartRef.current
      const duration = Math.round((Date.now() - start) / 1000)
      if (duration < 10) return
      const entry: SessionEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: new Date().toISOString(),
        mode: sMode,
        durationSeconds: duration,
        examTopic: topic,
      }
      try {
        const saved = localStorage.getItem('orville-sessions')
        const existing: SessionEntry[] = saved ? JSON.parse(saved) : []
        localStorage.setItem('orville-sessions', JSON.stringify([...existing, entry].slice(-50)))
      } catch {}
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // Auto-scroll chat history
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── TTS + lip sync ─────────────────────────────────────────────────────────

  const speak = useCallback(async (text: string) => {
    // Prevent concurrent speak calls (causes multi-voice echo)
    if (speakLockRef.current) return
    speakLockRef.current = true

    // Stop any active recognition before speaking to prevent echo
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* already stopped */ }
      recognitionRef.current = null
    }

    setStatus('speaking')
    setLastResponse(text)
    isSpeakingRef.current = true

    // try/finally ensures the lock is ALWAYS released and status is ALWAYS
    // reset — even if an unexpected error occurs mid-speech. Without this,
    // a thrown error (e.g. AudioContext.resume() rejection) would leave
    // speakLockRef=true forever and strand the user on "thinking/speaking".
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const audioCtx = audioCtxRef.current
      if (audioCtx.state === 'suspended') await audioCtx.resume()

      // Try ElevenLabs — await until audio fully ends before resolving
      let elevenlabsOk = false
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
            // Safety net: if onended never fires (known Chrome Web Audio edge case),
            // resolve after the audio duration + a 3s buffer so speak() never hangs.
            const safetyMs = Math.ceil(audioBuffer.duration * 1000) + 3000
            const safetyTimer = setTimeout(() => {
              isSpeakingRef.current = false
              audioSourceRef.current = null
              setAudioAmplitude(0)
              resolve()
            }, safetyMs)
            source.onended = () => {
              clearTimeout(safetyTimer)
              isSpeakingRef.current = false
              audioSourceRef.current = null
              setAudioAmplitude(0)
              resolve()
            }
            audioSourceRef.current = source
            source.start()
            animate()
          })
          elevenlabsOk = true
        } else {
          const errText = await res.text()
          console.warn('ElevenLabs TTS error:', res.status, errText)
        }
      } catch (err) {
        console.warn('ElevenLabs TTS failed, falling back to browser speech:', err)
      }

      if (!elevenlabsOk) {
        // Fallback: browser speechSynthesis — await until speech fully ends
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'en-US'
        utterance.rate = 0.88
        utterance.pitch = 0.82
        utterance.volume = 1

        let lipInterval: ReturnType<typeof setInterval> | undefined
        utterance.onstart = () => {
          lipInterval = setInterval(() => {
            setAudioAmplitude(0.05 + Math.random() * 0.2)
          }, 80)
        }

        await new Promise<void>((resolve) => {
          // Chrome has a known bug where onend never fires — use a timeout as a fallback
          const fallback = setTimeout(() => {
            clearInterval(lipInterval)
            isSpeakingRef.current = false
            setAudioAmplitude(0)
            resolve()
          }, Math.max(3000, text.length * 65))

          const done = () => {
            clearTimeout(fallback)
            clearInterval(lipInterval)
            isSpeakingRef.current = false
            setAudioAmplitude(0)
            resolve()
          }
          utterance.onend = done
          utterance.onerror = done
          window.speechSynthesis.speak(utterance)
        })
      }

      // Echo-clearing pause — still in 'speaking' state visually
      await new Promise((r) => setTimeout(r, 1200))
    } finally {
      // Always release the lock and reset status, even if an error occurred
      isSpeakingRef.current = false
      setAudioAmplitude(0)
      setStatus('idle')
      speakLockRef.current = false
    }
  }, [])

  // ── Send message to Claude ─────────────────────────────────────────────────

  const handleUserMessage = useCallback(
    async (text: string, overrideMode?: Mode) => {
      if (!text.trim()) return

      // Update ref immediately (not just via setStatus) so onend can check
      // synchronously and not restart recognition while the API is in flight.
      statusRef.current = 'thinking'
      setStatus('thinking')
      setLiveTranscript('')

      const newMessages: Message[] = [
        ...messagesRef.current,
        { role: 'user', content: text },
      ]
      setMessages(newMessages)

      const activeMode = overrideMode ?? modeRef.current ?? 'discussion'

      const chatController = new AbortController()
      const chatTimeout = setTimeout(() => chatController.abort(), 20000)
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages, mode: activeMode, notes: notesRef.current, level: userLevel, courses: userCoursesRef.current }),
          signal: chatController.signal,
        })
        clearTimeout(chatTimeout)

        const data = await res.json()
        if (!res.ok) {
          if (data.error === 'daily_limit_reached') {
            await speak("You've reached your daily message limit. Come back tomorrow to keep studying.")
            setStatus('idle')
            return
          }
          console.error('Chat API error:', res.status, data.error || data)
        }
        if (data.message) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.message },
          ])
          await speak(data.message)
          // Auto-restart listening for free-flowing conversation,
          // unless exam prep is in a text-input or terminal step.
          const step = examStepRef.current
          const inTextStep = step === 'writtenanswer' || step === 'grading' || step === 'done'
          if (modeRef.current !== 'examprep' || !inTextStep) {
            startListeningRef.current()
          }
        } else {
          setStatus('idle')
          startListeningRef.current()
        }
      } catch (err) {
        console.error('Chat error:', err)
        setStatus('idle')
        startListeningRef.current()
      }
    },
    [speak]
  )

  // Keep handleUserMessageRef in sync so it can be called from mode detection
  // without creating circular dependency issues.
  useEffect(() => { handleUserMessageRef.current = handleUserMessage }, [handleUserMessage])

  const handleFeedbackSubmit = useCallback(async () => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastResponse,
          note: feedbackNote,
          mode,
          timestamp: new Date().toISOString(),
        }),
      })
    } catch { /* log failure silently — feedback is best-effort */ }
    setFeedbackSent(true)
    setTimeout(() => {
      setShowFeedback(false)
      setFeedbackNote('')
      setFeedbackSent(false)
    }, 2000)
  }, [lastResponse, feedbackNote, mode])

  // ── Voice recognition ──────────────────────────────────────────────────────

  const handleVoiceResult = useCallback(
    (transcript: string) => {
      // ── Initialization phases ──────────────────────────────────────────────
      if (appPhaseRef.current === 'awaiting_name') {
        // Ignore transcripts that arrive within 1.5s of the mic opening — TTS echo
        if (Date.now() - listenStartTimeRef.current < 1500) {
          startListeningRef.current()
          return
        }
        // Ignore very short results — likely ambient noise
        if (transcript.trim().length < 2) {
          startListeningRef.current()
          return
        }
        // Extract name from common intro patterns ("I'm Zach", "my name is Zach", etc.)
        // Falls back to the last word of the transcript, then "there".
        const nameMatch = transcript.match(
          /\b(?:i'?m|i\s+am|name(?:'s|\s+is)?|call\s+me)\s+([a-zA-Z]+)/i
        )
        const raw = nameMatch?.[1] ?? transcript.trim().split(/\s+/).pop() ?? ''
        const candidate = raw.toLowerCase()
        const name = (raw && !NON_NAMES.has(candidate))
          ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
          : 'there'
        setUserName(name)
        try { localStorage.setItem('orville-username', name) } catch { /* ignore */ }
        setAppPhase('awaiting_year')
        appPhaseRef.current = 'awaiting_year'
        speak(
          `Nice to meet you, ${name}! I want to make sure I teach at the right level. What year of law school are you in? 1L, 2L, 3L, or LLM?`
        ).then(() => startListeningRef.current()).catch(() => startListeningRef.current())
        return
      }

      if (appPhaseRef.current === 'awaiting_year') {
        const t = transcript.toLowerCase()
        let year = 'Other'
        if (/\b(1l|first.year|1st.year|one.l)\b/.test(t)) year = '1L'
        else if (/\b(2l|second.year|2nd.year|two.l)\b/.test(t)) year = '2L'
        else if (/\b(3l|third.year|3rd.year|three.l)\b/.test(t)) year = '3L'
        else if (/\b(llm|l\.l\.m|masters?)\b/.test(t)) year = 'LLM'
        setUserYear(year)
        setUserLevel(year)
        try { localStorage.setItem('orville-year', year) } catch { /* ignore */ }
        try { localStorage.setItem('orville-level', year) } catch { /* ignore */ }
        setAppPhase('awaiting_courses')
        appPhaseRef.current = 'awaiting_courses'
        speak(`Got it. What subjects are you taking this semester? Just name them.`)
          .then(() => startListeningRef.current())
          .catch(() => startListeningRef.current())
        return
      }

      if (appPhaseRef.current === 'awaiting_courses') {
        const rawCourses = transcript
          .split(/,|\band\b/i)
          .map(s => s.trim())
          .filter(s => s.length > 2)
          .map(s =>
            s.split(' ')
              .filter(w => w.length > 0)
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ')
          )
          .filter(s => s.trim().length > 0)
        setUserCourses(rawCourses)
        try { localStorage.setItem('orville-courses', JSON.stringify(rawCourses)) } catch { /* ignore */ }
        setAppPhase('awaiting_mode')
        appPhaseRef.current = 'awaiting_mode'
        speak(
          `Got it. If you want to update your courses later, you can do that in your profile. Now, what do you want to work on? We can discuss a topic, work through it Socratically, or run an exam prep session.`
        ).then(() => startListeningRef.current()).catch(() => startListeningRef.current())
        return
      }

      if (appPhaseRef.current === 'awaiting_mode') {
        handleModeDetectionRef.current(transcript)
        return
      }

      // Handle notes-upload decision if prompt is showing
      if (showNotesPromptRef.current) {
        const t = transcript.toLowerCase()
        if (/\b(no|nah|nope|skip|pass|go|just go|proceed|continue|without|forget it|never mind|just do it|just tell me|just give me|go ahead|that's fine)\b/.test(t)) {
          setShowNotesPrompt(false)
          showNotesPromptRef.current = false
          handleExamTopicVoiceRef.current(pendingTopicRef.current)
        }
        // "yes/upload" → user must use the button (browser security requires user gesture for file input)
        return
      }

      // Handle read-aloud decision after fact pattern streams in
      if (awaitingReadRef.current) {
        awaitingReadRef.current = false
        const t = transcript.toLowerCase()
        const wantsRead = /\b(yes|yeah|sure|please|go ahead|read it|read|yep|ok|okay|yea)\b/.test(t)
        const askTalkOrWrite = () => {
          speak('Want to talk through the facts first, or go straight to writing your answer?')
            .then(() => {
              awaitingStartRef.current = true
              startListeningRef.current()
            })
        }
        if (wantsRead) {
          speak(factPatternRef.current).then(askTalkOrWrite)
        } else {
          askTalkOrWrite()
        }
        return
      }

      // Handle talk-or-write decision
      if (awaitingStartRef.current) {
        awaitingStartRef.current = false
        const t = transcript.toLowerCase()
        setExamStep('issuespotting')
        examStepRef.current = 'issuespotting'
        setShowIsDoneButton(true)
        if (/\b(talk|discuss|go over|walk|verbal|voice|speak|facts|sure|yes|yeah|yep)\b/.test(t)) {
          speak("Let's go. Talk me through what issues you're seeing.")
            .then(() => startListeningRef.current())
        } else {
          setExamStep('writtenanswer')
          examStepRef.current = 'writtenanswer'
          setShowIsDoneButton(false)
          setShowWrittenInput(true)
          speak("Take your time — write your full IRAC answer below.")
        }
        return
      }

      // ── Normal conversation ────────────────────────────────────────────────
      if (modeRef.current === 'examprep') {
        const step = examStepRef.current
        if (step === 'topic') {
          if (!notesRef.current.trim()) {
            pendingTopicRef.current = transcript
            setShowNotesPrompt(true)
            showNotesPromptRef.current = true
            speak("Before I start thinking of one, do you want to upload your notes or outline so I can tailor the question to your class?")
              .then(() => startListeningRef.current())
              .catch(() => startListeningRef.current())
          } else {
            handleExamTopicVoiceRef.current(transcript)
          }
          return
        }
        // Detect "give me another fact pattern" at any post-topic step
        if (
          step !== 'writtenanswer' && step !== 'grading' &&
          /\b(go again|give me a new|new fact pattern|another fact pattern|different fact pattern|another hypo|another question|try another|start over|reset)\b/i.test(transcript)
        ) {
          const recap = lastExamTopicRef.current
            ? `, or keep it in the same area as the last one on ${lastExamTopicRef.current}`
            : ''
          speak(`Sure. Before I do, is there a specific angle you want me to focus on${recap}?`)
            .then(() => {
              setExamStep('topic')
              setShowFactPanel(false)
              setShowIsDoneButton(false)
              startListeningRef.current()
            })
          return
        }
        if (step === 'issuespotting') {
          handleUserMessage(transcript, 'examprep')
          return
        }
      }
      handleUserMessage(transcript)
    },
    [handleUserMessage]
  )

  const startListening = useCallback(() => {
    if (statusRef.current !== 'idle') {
      if (statusRef.current === 'speaking') {
        // Stop browser TTS
        window.speechSynthesis.cancel()
        // Stop ElevenLabs Web Audio if playing
        try { audioSourceRef.current?.stop() } catch { /* already stopped */ }
        audioSourceRef.current = null
        isSpeakingRef.current = false
        speakLockRef.current = false
        setAudioAmplitude(0)
        setStatus('idle')
        // Fall through to start recognition so the user's click is honoured
      } else {
        return
      }
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
      setMicError('')
    }

    // handledByResult — set when a final transcript was delivered to handleVoiceResult
    // errorHandled   — set when onerror already scheduled a restart or showed an error,
    //                  so onend doesn't also try to restart (preventing double-restart)
    let handledByResult = false
    let errorHandled = false

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setLiveTranscript(transcript)
      if (event.results[event.results.length - 1].isFinal) {
        handledByResult = true
        handleVoiceResult(transcript)
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        // Bail out if speak() has already taken over — restarting now would
        // open the mic while TTS audio is still playing, causing echo.
        if (recognitionRef.current !== recognition) return
        errorHandled = true
        setStatus('idle')
        setLiveTranscript('')
        setTimeout(() => startListeningRef.current(), 200)
        return
      }
      // Microphone access denied — show a visible hint so the user isn't
      // left wondering why nothing happened.
      if (event.error === 'not-allowed') {
        errorHandled = true
        setMicError('Microphone access is required. Allow it in your browser, then click the avatar to try again.')
        setStatus('idle')
        setLiveTranscript('')
        return
      }
      // Same guard as no-speech: if this instance was already superseded
      // (e.g. the defensive stop in startListening fired an 'aborted' error
      // on the old instance after the new one started), don't clobber the
      // new recognition's 'listening' status.
      if (recognitionRef.current !== recognition) return
      errorHandled = true
      if (event.error !== 'aborted') console.warn('Speech recognition error:', event.error)
      setStatus('idle')
      setLiveTranscript('')
    }

    recognition.onend = () => {
      const isActive = recognitionRef.current === recognition
      // Always clear the ref — speak() shouldn't try to stop an already-ended instance
      if (isActive) recognitionRef.current = null
      // If result or error already handled state, do nothing
      if (handledByResult || errorHandled) return
      // If superseded by a newer recognition instance, do nothing
      if (!isActive) return
      // Don't restart while the API is processing or TTS is playing —
      // handleUserMessage / speak() will restart listening when ready.
      if (statusRef.current === 'thinking' || statusRef.current === 'speaking') return
      // Chrome sometimes closes the session early without a no-speech error.
      // Auto-restart so the user doesn't have to tap again.
      statusRef.current = 'idle'
      setStatus('idle')
      setTimeout(() => startListeningRef.current(), 150)
    }

    // Stop any leftover recognition before starting a fresh instance
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    try {
      listenStartTimeRef.current = Date.now()
      recognition.start()
      recognitionRef.current = recognition
    } catch (err) {
      // Synchronous throw — mic already denied or unavailable
      console.warn('SpeechRecognition.start() threw:', err)
      setMicError('Microphone access is required. Allow it in your browser, then click the avatar to try again.')
      setStatus('idle')
    }
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
    setShowFactPanel(false)
    setShowNotesPrompt(false)
    showNotesPromptRef.current = false
    pendingTopicRef.current = ''
    awaitingReadRef.current = false
    awaitingStartRef.current = false

    // Save previous session before starting a new one
    if (sessionStartRef.current) {
      const { mode: prevMode, start, topic } = sessionStartRef.current
      const duration = Math.round((Date.now() - start) / 1000)
      if (duration >= 10) {
        const entry: SessionEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          date: new Date().toISOString(),
          mode: prevMode,
          durationSeconds: duration,
          examTopic: topic,
        }
        setSessions(prev => [...prev, entry].slice(-50))
      }
    }
    sessionStartRef.current = { mode: selectedMode, start: Date.now() }
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'session_start', mode: selectedMode, level: userYearRef.current }),
    }).catch(() => {})

    const defaultGreetings: Record<Mode, string> = {
      discussion: "Discussion mode. What case or concept do you want to dig into?",
      socratic: "Socratic mode. I won't give you answers — I'll ask questions until you find them yourself. What topic are we working on?",
      examprep: "Give me a topic or area of law and I'll generate a fact pattern for you.",
    }

    const greeting = customGreeting ?? defaultGreetings[selectedMode]
    speak(greeting)
      .then(() => startListeningRef.current())
      .catch(() => startListeningRef.current())
  }, [speak])

  // ── Mode detection (local keyword matching — no API call) ─────────────────

  const handleModeDetection = useCallback((transcript: string) => {
    const t = transcript.toLowerCase()

    // "IRAC this/the [topic]" is a one-off breakdown request, not a structured exam session
    const iracVerb = /\birac\s+(this|the|a|an|my|\w)/i.test(transcript)

    let detectedMode: Mode = 'discussion'
    if (!iracVerb && /\b(quiz|test me|ask me|question me|socratic|work through|challenge me|make me work)\b/.test(t)) {
      detectedMode = 'socratic'
    } else if (!iracVerb && /\b(exam|practice exam|fact pattern|essay|hypo|hypothetical|prep|timed)\b/.test(t)) {
      detectedMode = 'examprep'
    }

    // Exam prep has a structured setup flow (level question → topic → notes prompt →
    // fact pattern panel). Routing the raw transcript through handleUserMessage skips
    // all of that, so we hand off to selectMode instead.
    if (detectedMode === 'examprep') {
      selectMode('examprep')
      return
    }

    setMode(detectedMode)
    modeRef.current = detectedMode
    setShowModeSelector(false)
    setAppPhase('active')
    appPhaseRef.current = 'active'
    setMessages([])
    sessionStartRef.current = { mode: detectedMode, start: Date.now() }
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'session_start', mode: detectedMode, level: userYearRef.current }),
    }).catch(() => {})
    handleUserMessageRef.current(transcript, detectedMode)
  }, [selectMode])

  useEffect(() => { handleModeDetectionRef.current = handleModeDetection }, [handleModeDetection])

  // ── Exam Prep flow ─────────────────────────────────────────────────────────

  const handleExamTopicVoice = useCallback(
    async (topic: string) => {
      lastExamTopicRef.current = topic
      if (sessionStartRef.current) sessionStartRef.current.topic = topic
      setExamStep('factpattern')
      examStepRef.current = 'factpattern'
      setLiveTranscript('')

      await speak('Sure, give me just a couple of seconds to put one together.')
      setLastResponse('')
      setStatus('thinking')

      const newMessages: Message[] = [
        ...messagesRef.current,
        { role: 'user', content: `Generate an exam fact pattern on: ${topic}` },
      ]
      setMessages(newMessages)

      const examController = new AbortController()
      const examTimeout = setTimeout(() => examController.abort(), 45000)
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: newMessages, mode: 'examprep', notes: notesRef.current, level: userLevel, courses: userCoursesRef.current, stream: true }),
          signal: examController.signal,
        })
        clearTimeout(examTimeout)

        if (!res.ok) {
          try {
            const data = await res.json()
            if (data.error === 'daily_limit_reached') {
              await speak("You've reached your daily message limit. Come back tomorrow to keep studying.")
              setStatus('idle')
              return
            }
          } catch {}
          setStatus('idle')
          startListeningRef.current()
          return
        }
        if (!res.body) {
          setStatus('idle')
          startListeningRef.current()
          return
        }

        setFactPattern('')
        setShowFactPanel(true)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          fullText += chunk
          setFactPattern(fullText)
          factPatternRef.current = fullText
        }

        setMessages((prev) => [...prev, { role: 'assistant', content: fullText }])
        setStatus('idle')

        await speak("Your fact pattern is ready. Should I read it to you?")
        awaitingReadRef.current = true
        startListeningRef.current()
      } catch (err) {
        clearTimeout(examTimeout)
        console.error('Exam prep error:', err)
        setStatus('idle')
        startListeningRef.current()
      }
    },
    [speak, userLevel]
  )

  // Keep handleExamTopicVoiceRef in sync so callbacks can call the latest version
  useEffect(() => { handleExamTopicVoiceRef.current = handleExamTopicVoice }, [handleExamTopicVoice])

  // Auto-proceed after notes are uploaded while the notes prompt is showing
  useEffect(() => {
    if (showNotesPromptRef.current && notes.trim()) {
      setShowNotesPrompt(false)
      showNotesPromptRef.current = false
      handleExamTopicVoiceRef.current(pendingTopicRef.current)
    }
  }, [notes])

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
      className={`relative w-full h-screen overflow-hidden select-none flex ${showFactPanel ? 'flex-row' : 'flex-col'}`}
      style={{
        background:
          'radial-gradient(ellipse at 50% 40%, #0d0a1e 0%, #040210 55%, #000000 100%)',
      }}
    >
      {/* ── Left column: avatar + UI (full width when no panel, flex-1 when panel shows) ── */}
      <div className={`flex flex-col relative ${showFactPanel ? 'flex-1' : 'w-full flex-1'}`}>

        {/* Title + mode indicator */}
        <div className="absolute top-6 left-0 right-0 flex flex-col items-center z-30 pointer-events-none">
          <h1
            className="font-sans text-2xl uppercase font-light text-gray-400"
            style={{ letterSpacing: '0.35em' }}
          >
            ORVILLE
          </h1>
          <p className="text-xs tracking-widest text-gray-700 uppercase mt-1">
            {mode ? MODE_LABELS[mode] : 'Your Personal AI Law Tutor'}
          </p>
        </div>

        {/* Profile button */}
        {hasGreeted && (
          <button
            className="absolute top-6 left-6 z-30 text-xs text-gray-600 hover:text-gray-400 tracking-widest uppercase transition-colors duration-200 pointer-events-auto"
            onClick={() => setShowProfile(true)}
          >
            Profile
          </button>
        )}

        {/* Mode selector button */}
        {hasGreeted && (
          <button
            className="absolute top-6 right-6 z-30 text-xs text-gray-600 hover:text-gray-400 tracking-widest uppercase transition-colors duration-200 pointer-events-auto"
            onClick={() => setShowModeSelector(true)}
          >
            {mode ? '⟳ Mode' : 'Select Mode'}
          </button>
        )}

        {/* CSS ambient glow — fades to transparent with no hard edge */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 60% 50% at 50% 48%, rgba(80,30,200,0.52) 0%, rgba(40,10,140,0.18) 45%, transparent 72%)',
          }}
        />

        {/* 3D Canvas — absolute so it covers the full column */}
        <div className="absolute inset-0 z-0">
          <Canvas
            camera={{ position: [0, 0, 5], fov: 30 }}
            gl={{ antialias: true, alpha: true }}
            style={{ background: 'transparent', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
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
                      speak("Hi there — I'm Orville, your law tutor. What's your name?").then(() => startListeningRef.current()).catch(() => startListeningRef.current())
                    } else {
                      setAppPhase('awaiting_mode')
                      appPhaseRef.current = 'awaiting_mode'
                      const returningGreetings = [
                        `Hey ${userName}, what's on your mind?`,
                        `Welcome back, ${userName}. What do you want to work on?`,
                        `Hey ${userName}! What can I help you with?`,
                        `What's going on, ${userName}?`,
                      ]
                      const greeting = returningGreetings[Math.floor(Math.random() * returningGreetings.length)]
                      speak(greeting).then(() => startListeningRef.current()).catch(() => startListeningRef.current())
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

        {/* Spacer — pushes bottom UI down; canvas is absolute so it needs this */}
        <div className="flex-1" aria-hidden />

      {/* Bottom UI */}
      <div className="relative pb-4 flex flex-col items-center gap-3 z-10 w-full px-4">

        {/* Exam Prep step indicator */}
        {mode === 'examprep' && (
          <p className={`text-xs tracking-widest uppercase ${THEME.examStep}`}>
            {EXAM_STEP_LABELS[examStep]}
          </p>
        )}

        {/* Mic error — shown when browser blocks microphone access */}
        {micError && (
          <p className="text-red-400 text-xs text-center max-w-sm fade-up leading-relaxed">
            {micError}
          </p>
        )}

        {/* Status label */}
        {!micError && (
          <p
            className={`text-sm tracking-[0.2em] uppercase font-light transition-colors duration-500 ${STATUS_COLOR[status]}`}
          >
            {mode === 'examprep' && examStep === 'writtenanswer'
              ? 'Type your answer below'
              : status === 'idle' && hasGreeted
              ? ''
              : STATUS_LABEL[status]}
          </p>
        )}

        {/* Live transcript */}
        {status === 'listening' && liveTranscript && (
          <p className={`text-sm text-center max-w-lg opacity-80 fade-up italic ${THEME.transcript}`}>
            "{liveTranscript}"
          </p>
        )}

        {/* Last response text — hidden when fact panel is visible */}
        {(status === 'speaking' || (status === 'idle' && lastResponse))
          && examStep !== 'writtenanswer'
          && !showFactPanel && (
          <p className="text-gray-400 text-sm text-center max-w-xl leading-relaxed fade-up px-4">
            {lastResponse}
          </p>
        )}

        {/* "I'm Done" button (issue spotting) */}
        {showIsDoneButton && (
          <button
            onClick={handleIsDone}
            className={`pointer-events-auto px-6 py-2 text-xs uppercase tracking-widest border rounded-lg transition-all duration-200 fade-up ${THEME.accentBtn}`}
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
              className={`self-end px-6 py-2 text-xs uppercase tracking-widest border rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${THEME.submitBtn}`}
            >
              Submit for Grading →
            </button>
          </div>
        )}

        {/* Notes prompt — Upload / Skip buttons (shown after user gives topic with no notes loaded) */}
        {showNotesPrompt && (
          <div className="flex items-center gap-3 fade-up pointer-events-auto">
            <button
              onClick={() => notesInputRef.current?.click()}
              className={`px-5 py-2 text-xs uppercase tracking-widest border rounded-lg transition-all duration-200 ${THEME.accentBtn}`}
            >
              Upload Notes
            </button>
            <button
              onClick={() => {
                setShowNotesPrompt(false)
                showNotesPromptRef.current = false
                handleExamTopicVoiceRef.current(pendingTopicRef.current)
              }}
              className="px-4 py-2 text-xs uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
            >
              Skip →
            </button>
          </div>
        )}

        {/* Notes upload (hidden file input + subtle button while in topic/factpattern steps) */}
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
                localStorage.removeItem('orville-history')
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

        {/* Conversation history panel — inside left column */}
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
                    className={`max-w-[80%] text-xs leading-relaxed px-3 py-2 rounded-lg border ${
                      msg.role === 'user'
                        ? THEME.userMsg
                        : 'bg-gray-950 text-gray-300 border-gray-800'
                    }`}
                  >
                    <span className="block text-[10px] uppercase tracking-widest opacity-50 mb-1">
                      {msg.role === 'user' ? 'You' : 'Orville'}
                    </span>
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}
      </div>{/* end left column */}

      {/* ── Right column: fact pattern panel (full screen height) ── */}
      {showFactPanel && (
        <div className={`w-[42%] max-w-[520px] min-w-[260px] flex flex-col border-l ${THEME.docPanel.border} ${THEME.docPanel.bg} pointer-events-auto`}>
          {/* Header */}
          <div className={`flex items-center justify-between px-5 py-3 border-b ${THEME.docPanel.border}`}>
            <span className={`font-sans text-[10px] uppercase tracking-[0.3em] font-light ${THEME.docPanel.header}`}>
              Fact Pattern
            </span>
            <div className="flex items-center gap-4">
              {factPattern && (
                <button
                  onClick={downloadFactPattern}
                  className={`text-[10px] uppercase tracking-widest transition-colors ${THEME.docPanel.download}`}
                >
                  ↓ Download
                </button>
              )}
              <button
                onClick={() => {
                  setShowFactPanel(false)
                  awaitingReadRef.current = false
                  awaitingStartRef.current = false
                }}
                className={`text-[10px] uppercase tracking-widest transition-colors ${THEME.docPanel.download}`}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {factPattern ? (
              factPattern.split('\n\n').filter(Boolean).map((para, i) => (
                <p key={i} className={`text-base leading-relaxed mb-5 last:mb-0 ${THEME.docPanel.body}`}>
                  {para.trim()}
                </p>
              ))
            ) : (
              <p className={`text-sm animate-pulse ${THEME.docPanel.hint}`}>Generating…</p>
            )}
          </div>

          {/* Footer hint */}
          {examStep === 'issuespotting' && (
            <div className={`px-5 py-3 border-t ${THEME.docPanel.border}`}>
              <p className={`text-[10px] uppercase tracking-widest ${THEME.docPanel.hint}`}>
                Spot the issues — talk through them out loud
              </p>
            </div>
          )}
        </div>
      )}

      {/* Mode selector modal — absolute over entire container (both columns) */}
      {showModeSelector && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        >
          <div className="flex flex-col items-center gap-6 px-8 py-10 max-w-md w-full">
            <h2 className="font-sans text-lg tracking-[0.3em] uppercase text-gray-400 font-light">
              Choose Mode
            </h2>

            {(['discussion', 'socratic', 'examprep'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => selectMode(m)}
                className={`w-full text-left px-5 py-4 rounded-lg border transition-all duration-200 ${
                  mode === m
                    ? THEME.accentSelected
                    : 'border-gray-800 hover:border-gray-600 bg-gray-950 hover:bg-gray-900'
                }`}
              >
                <span className="font-sans block text-sm text-gray-200 mb-1">
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

      {/* Profile modal */}
      {showProfile && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          userName={userName}
          userYear={userYear}
          userCourses={userCourses}
          sessions={sessions}
          onSave={({ name, year, courses }) => {
            if (name) {
              setUserName(name)
              try { localStorage.setItem('orville-username', name) } catch {}
            }
            setUserYear(year)
            setUserLevel(year)
            try { localStorage.setItem('orville-year', year) } catch {}
            try { localStorage.setItem('orville-level', year) } catch {}
            setUserCourses(courses)
            try { localStorage.setItem('orville-courses', JSON.stringify(courses)) } catch {}
          }}
        />
      )}

      {/* Feedback button — bottom-left, always visible after greeting */}
      {hasGreeted && !showFeedback && (
        <button
          className="absolute bottom-6 left-6 z-20 text-xs text-gray-800 hover:text-gray-600 tracking-widest uppercase transition-colors pointer-events-auto"
          onClick={() => setShowFeedback(true)}
        >
          Feedback
        </button>
      )}

      {/* Feedback overlay */}
      {showFeedback && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto"
          style={{ background: 'rgba(0,0,0,0.88)' }}
        >
          <div className="flex flex-col gap-5 px-8 py-8 max-w-sm w-full">
            {feedbackSent ? (
              <p className="text-green-400 text-sm text-center tracking-widest">
                Thanks — received.
              </p>
            ) : (
              <>
                <h3 className="font-sans text-xs tracking-[0.3em] uppercase text-gray-500">
                  Send Feedback
                </h3>
                {lastResponse && (
                  <div className="bg-gray-950 border border-gray-800 rounded p-3 max-h-24 overflow-y-auto">
                    <span className="block text-[10px] text-gray-700 uppercase tracking-widest mb-1">Last response</span>
                    <span className="text-xs text-gray-500 leading-relaxed">{lastResponse}</span>
                  </div>
                )}
                <textarea
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  placeholder="What went wrong, or what could be better?"
                  className="bg-gray-950 border border-gray-700 rounded p-3 text-xs text-gray-300 leading-relaxed resize-none h-24 focus:outline-none focus:border-purple-600 transition-colors"
                />
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setShowFeedback(false)}
                    className="text-xs text-gray-700 hover:text-gray-500 uppercase tracking-widest transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFeedbackSubmit}
                    className="px-5 py-2 text-xs uppercase tracking-widest border border-gray-700 text-gray-400 hover:border-gray-400 hover:text-gray-200 rounded transition-colors"
                  >
                    Send →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Browser warning — shown when Web Speech API is unavailable (Firefox, Safari) */}
      {!browserSupported && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-96 pointer-events-auto">
          <div className="flex flex-col items-center gap-6 px-8 py-10 max-w-sm text-center">
            <h2 className="font-sans text-xl uppercase font-light text-gray-200 tracking-[0.2em]">
              Chrome Required
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Orville is a voice-first tutor and requires Chrome for microphone support.
              Open this page in Chrome on desktop or Android to get started.
            </p>
            <p className="text-xs text-gray-700 tracking-widest uppercase">
              Safari and Firefox do not support voice input.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
