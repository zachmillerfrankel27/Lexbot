# LexBot — Setup Guide

## What you need

| Thing | Where to get it | Cost |
|---|---|---|
| Node.js (v18+) | https://nodejs.org → click "LTS" | Free |
| Git | https://git-scm.com | Free |
| Anthropic API key | https://console.anthropic.com/settings/keys | Pay-as-you-go |
| ElevenLabs API key | https://elevenlabs.io → Profile → API Key | Free tier: 10K chars/month |
| GitHub account | https://github.com | Free |
| Vercel account | https://vercel.com (sign in with GitHub) | Free |

---

## Step 1 — Install Node.js

Download from https://nodejs.org and run the installer (choose the LTS version).

To verify it worked, open a terminal and run:
```
node --version
```
You should see something like `v20.x.x`.

---

## Step 2 — Download the 3D face model

The talking head uses a photorealistic face scan from Three.js (open-source, MIT license).
Run this in the `lexbot` project folder:

**Mac / Linux:**
```bash
curl -L -o public/face.glb \
  "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/facecap.glb"
```

**Windows (PowerShell):**
```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/facecap.glb" -OutFile "public\face.glb"
```

Verify: you should see a file at `public/face.glb` (roughly 3-5 MB).

---

## Step 3 — Install dependencies

In the `lexbot` folder:
```bash
npm install
```

---

## Step 4 — Set up environment variables for local testing (optional)

Copy the example file:
```bash
cp .env.local.example .env.local
```

Then open `.env.local` and fill in your keys:
```
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB
```

To run locally:
```bash
npm run dev
```
Then open http://localhost:3000 in **Google Chrome**.

---

## Step 5 — Push to GitHub

1. Create a new repo at https://github.com/new (call it `lexbot`, set to private)
2. In the `lexbot` folder:
```bash
git init
git add .
git commit -m "Initial LexBot build"
git remote add origin https://github.com/YOUR_USERNAME/lexbot.git
git push -u origin main
```

---

## Step 6 — Deploy on Vercel

1. Go to https://vercel.com and sign in with GitHub
2. Click **"Add New Project"** → import your `lexbot` repo
3. On the configuration screen, click **"Environment Variables"** and add:
   - `ANTHROPIC_API_KEY` → your Anthropic key
   - `ELEVENLABS_API_KEY` → your ElevenLabs key
   - `ELEVENLABS_VOICE_ID` → `pNInz6obpgDQGcFmaJgB` (or your preferred voice)
4. Click **Deploy**

Vercel will give you a URL like `https://lexbot-xyz.vercel.app`.

> **Important:** Use **Google Chrome** to access the site — Web Speech API (voice input)
> is only fully supported in Chrome.

---

## How to use it

1. Open the site in Chrome
2. **Click the face** — Lex will greet you and the microphone will activate
3. Ask anything:
   - *"Can we talk about Palsgraf v. Long Island Railroad?"*
   - *"Help me understand proximate cause for my exam tomorrow"*
   - *"What's the best way to answer a Socratic question about Erie Railroad?"*
   - *"What are professors typically looking for when testing on promissory estoppel?"*
4. Click the face again to interrupt and ask another question
5. Toggle the transcript at the bottom to review what was said

---

## Adjusting the voice

Change `ELEVENLABS_VOICE_ID` in Vercel Environment Variables.
Browse voices and get their IDs at: https://elevenlabs.io/voice-library

Popular options:
- Adam (default, deep male): `pNInz6obpgDQGcFmaJgB`
- Daniel (authoritative male): `onwK4e9ZLuTAKqWW03F9`
- Rachel (female, warm): `21m00Tcm4TlvDq8ikWAM`
- Josh (friendly male): `TxGEqnHWrfWFTfGW9XjX`

---

## If something looks off with the face size

In `components/Avatar.tsx`, find this line:
```typescript
const targetH = visibleHeight * 0.65
```
Increase the number (e.g. `0.8`) to make the face larger, decrease it to make it smaller.
