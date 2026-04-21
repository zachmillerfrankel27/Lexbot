# Orville — Product Specification
**Company:** Orbly  
**Product:** Orville, powered by Orbly  
**Version:** 0.1 (Beta)  
**Last updated:** April 2026

---

## 1. Vision

Orville is your personal law tutor — available anytime, for quick questions, Socratic review, and structured exam prep. Unlike static outlines or passive video lectures, Orville has a real conversation with you: it pushes back, asks questions, and adapts to where you are in your understanding.

The closest analogies are Quimbee (structured content) and LexisNexis (research depth), but Orville occupies a different position: it is a dynamic, voice-first AI tutor that meets students in the moment they're confused, not after they've already sat down to study.

---

## 2. Target Users

**Primary:** Law students — 1L through 3L, LLM candidates, and bar preppers  
**Secondary (B2B):** Law school academic support offices, study groups, student organizations

**Not the user:**
- Practicing lawyers (different product, different needs)
- Law professors (different relationship to the material)
- Non-law students or general public

---

## 3. Core Product

### 3.1 Interface

Orville presents as a voice-first AI tutor with a 3D plasma orb avatar. The student speaks; Orville listens, thinks, and responds in natural spoken language. All responses are formatted for speech — no bullet points, no headers, no markdown.

The orb responds visually to state: idle, listening, thinking, and speaking each produce distinct animation and color behavior.

### 3.2 Modes

**Discussion**
Free-flowing conversation. The student asks about a case, concept, or doctrine and Orville engages in dialogue — 2–3 sentence responses, ending with a follow-up question when natural. Does not give lectures or overviews unprompted; asks narrowing questions if a topic is too broad.

**Socratic**
Orville does not give answers. It asks one focused question at a time and guides the student to derive the rule themselves. Fast-paced, short exchanges. If the student disengages or asks to just be told the answer, Orville redirects collaboratively rather than refusing.

**Exam Prep**
Structured 4-step session:
1. Student names a topic → Orville generates a fact pattern (2–4 paragraphs, multiple embedded issues)
2. Student spots issues out loud → Orville gives verbal feedback
3. Student writes a full IRAC answer in the text input
4. Orville grades the answer: what was strong, what was thin, what was missing, letter grade with rationale

Orville can calibrate fact pattern complexity to the student's year (1L, 2L, 3L, Bar Prep) and tailor content to uploaded notes or outlines.

### 3.3 Subject Coverage

Orville covers the full law school curriculum:

- **1L core:** Contracts, Torts, Property, Civil Procedure, Constitutional Law, Criminal Law & Procedure
- **Upper division:** Evidence, Corporations, Administrative Law, Federal Income Tax, Securities Regulation, Trusts & Estates, Family Law, Conflict of Laws, and other standard JD offerings
- **Bar prep subjects:** All MBE and MEE subjects

Orville does not refuse topics on the basis of being niche or upper-division. It only declines when it cannot provide genuinely reliable information — and when it does, it explains specifically why (e.g., jurisdiction-specific rules it cannot confirm without knowing the controlling state).

### 3.4 Supported Prompt Types

Beyond the structured modes, Orville handles natural ad hoc requests including:
- "Explain [concept] like I'm five"
- "IRAC this fact pattern for me" (routed to Discussion, not Exam Prep flow)
- "What did [case name] actually hold?"
- "What's the easiest way to remember [rule]?"
- Case briefs (offered contextually after sufficient case discussion)
- Study schedules (personalized to exam dates and weak areas, or structured topic-order suggestions)

---

## 4. Technical Architecture

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 App Router |
| AI model | Claude Sonnet (Anthropic) |
| Voice input | Web Speech API (Chrome) |
| Voice output | ElevenLabs TTS (premium); browser SpeechSynthesis (free tier fallback) |
| 3D avatar | React Three Fiber, Three.js, GLSL custom shaders |
| Post-processing | @react-three/postprocessing (Bloom) |
| Auth | Invite-code gate → httpOnly cookie (90-day session) |
| Persistence | localStorage (chat history, username, user level) |
| Hosting | Vercel |

### 4.1 Access Control

Beta access is invite-code gated. Each beta user receives a unique code. Codes are validated server-side and stored in an httpOnly cookie on redemption. No full account system is required for beta; accounts will be introduced at the paid tier launch.

### 4.2 Rate Limiting

Current: per-IP, per-minute cap (in-process).  
Planned: per-user daily message cap enforced server-side, tiered by plan.

---

## 5. Pricing

Pricing is designed to be competitive with Quimbee ($119/year) on the annual plan while reflecting Orville's higher per-interaction infrastructure cost (AI inference + TTS).

| Tier | Monthly | Annual | Messages | Voice | Features |
|------|---------|--------|----------|-------|----------|
| **Free** | $0 | $0 | 5/month | Browser TTS | All modes, no ElevenLabs |
| **Student** | $15.99 | $119 | Unlimited | ElevenLabs | All modes |
| **Pro** | $24.99 | $179 | Unlimited | ElevenLabs | All modes + briefs + study schedules |
| **Institution** | — | ~$6/seat | Unlimited | ElevenLabs | Pro features + admin dashboard + usage reporting |

**Free tier rationale:** Acquisition and demo. Low enough to be a real taste, not a real study tool. Browser TTS keeps infrastructure cost near zero at this tier.

**Institution rationale:** Targets law school academic support offices and student organizations. Pricing to be confirmed based on pilot conversations.

---

## 6. Beta Plan

### 6.1 Scope
- **Users:** 10–50, recruited through founder's network
- **Access:** Unique invite codes per user, manually distributed
- **Duration:** TBD; until product is stable and pricing infrastructure is in place

### 6.2 Beta Readiness Checklist

| Item | Status |
|------|--------|
| Discussion, Socratic, Exam Prep modes | ✅ Built |
| Voice input + ElevenLabs TTS | ✅ Built |
| 3D orb avatar | ✅ Built |
| Invite-code gate | ✅ Built |
| Chat history (localStorage) | ✅ Built |
| Notes/outline upload | ✅ Built |
| First-time walkthrough | ✅ Built |
| In-app feedback / report button | ⬜ Not built |
| Per-user daily message cap | ⬜ Not built |
| Mobile (Chrome) | ✅ Works |
| Safari / Firefox | ⚠️ Voice input unsupported (user shown message) |

### 6.3 Feedback
Beta users will have access to an in-app report button (low-friction, one click) that captures the last message exchange and a freeform note.

---

## 7. Roadmap

### Beta (Now)
- Stabilize all three modes
- In-app feedback button
- Per-user message cap

### V1 (Paid launch)
- Account system (email/password or OAuth)
- Subscription billing (Stripe)
- Case brief generation (offered contextually after case discussion)
- Study schedule builder (personalized to exam dates + weak areas, or topic-order suggestion)
- AI disclaimer surfaced to users

### Post-V1
- Institution dashboard (admin, usage reporting, seat management)
- Syllabus upload (professor-specific content tailoring)
- Flashcard generation
- Offline / low-connectivity mode
- iOS / Android app (if demand justifies)

---

## 8. Out of Scope

The following are explicitly not planned and should not be designed for:
- Legal research for practicing lawyers
- Document drafting or contract review
- Jurisdiction-specific legal advice
- Professor-facing tools
- Non-law academic subjects
