import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Rate limiting (shared pattern with /api/chat) ─────────────────────────────
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 20)
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return false
  }
  if (entry.count >= RATE_LIMIT_MAX) return true
  entry.count++
  return false
}

const SYSTEM = `You are Lex, an elite AI law tutor. A student has just been greeted and asked what they want to work on. Based on their response, you must:

1. Determine the appropriate learning mode:
   - discussion: The student asks a substantive legal question, mentions a case, concept, or topic they want to understand or explore. This is the default — use it whenever the input doesn't clearly call for one of the others.
   - socratic: The student explicitly wants to be questioned, tested through dialogue, or guided to derive rules themselves (e.g. "quiz me", "ask me questions", "make me work for it").
   - examprep: The student wants a practice exam, fact pattern, timed exercise, or structured exam preparation.

2. Generate a natural, warm, spoken-aloud first response that directly addresses what the student said. If they asked a legal question, start answering it. If they named a topic, dive in. If they asked for Socratic or exam prep, acknowledge it and set the stage.

Rules for your response:
- Never use markdown, bullet points, headers, or asterisks — write for voice.
- Be concise but substantive: 1–3 sentences for simple inputs, up to a short paragraph for complex ones.
- Sound like a tutor who is genuinely engaged, not a menu system confirming a selection.
- Do not say things like "Great choice!" or "Switching to discussion mode."

Respond with valid JSON only — no extra text before or after:
{"mode":"discussion"|"socratic"|"examprep","response":"..."}`

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { transcript } = await req.json()
    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'transcript required' }, { status: 400 })
    }

    const result = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: 'user', content: transcript }],
    })

    const text = result.content[0].type === 'text' ? result.content[0].text.trim() : ''

    try {
      const parsed = JSON.parse(text)
      if (!parsed.mode || !parsed.response) throw new Error('bad shape')
      return NextResponse.json(parsed)
    } catch {
      // Claude didn't return clean JSON — treat as discussion and use the raw text
      return NextResponse.json({ mode: 'discussion', response: text })
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Classify error:', msg)
    return NextResponse.json({ error: `Classification failed: ${msg}` }, { status: 500 })
  }
}
