# LifePlan Realtime Voice Demo (Next.js)

This is a **demo** single-page Next.js app that:

- Connects the browser microphone to the **OpenAI Realtime API over WebRTC**
- Shows **live transcripts** of what the user says
- Runs an **extraction step** on each user utterance to fill out a "LifePlan" questionnaire
- Keeps state so you can **stop + resume** later (keyed by a `userId`)
- Displays the **finished LifePlan** as a simple table

> ⚠️ Note: This is a demo. The server uses a simple file-based store in `./data/`.
> In production you’d likely use a real DB + auth + encryption + auditing.

---

## Prereqs

- Node.js (recommended: **20.9+**)
- An OpenAI API key

---

## 1) Get an OpenAI API key

Create an API key in your OpenAI dashboard (keep it secret).

---

## 2) Configure environment variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set:

- `OPENAI_API_KEY=...`

You can also tweak models + voice.

---

## 3) Install and run

```bash
npm install
npm run dev
```

Then open: http://localhost:3000

---

## Notes on security

- **Do not** put your OpenAI API key in the browser or in any `NEXT_PUBLIC_...` env var.
- This demo keeps the key server-side only (Next.js Route Handlers).

---

## Files you’ll care about

- `app/page.tsx` — the single-page demo UI + WebRTC client
- `app/api/webrtc/connect/route.ts` — server route that creates the Realtime call (`/v1/realtime/calls`)
- `app/api/extract/route.ts` — server route that extracts structured answers into the LifePlan
- `app/api/state/route.ts` — returns the current state + next-question instructions
- `lib/lifeplan/questions.ts` — mock question “dataframe”
- `lib/lifeplan/instructions.ts` — instructions builder for the voice guide
- `lib/lifeplan/store.ts` — JSON file persistence

---

## Troubleshooting

- If you see no audio output:
  - Make sure your browser tab has audio permissions.
  - Ensure your system output device is correct.
- If Realtime connect fails:
  - Confirm `OPENAI_API_KEY` is set.
  - Confirm the realtime model name in `.env.local` exists for your account.
