# AGENTS.md

## Commands

```
npm run dev      # Start dev server on port 3000, binds 0.0.0.0
npm run build    # Production build via Vite
npm run lint     # Typecheck only (tsc --noEmit) — no ESLint, no Prettier
```

There is no test framework, no CI, and no pre-commit hooks.

## Environment

- `.env.local` holds `GEMINI_API_KEY`. It is gitignored but an example is at `.env.example`.
- The key is injected as `process.env.GEMINI_API_KEY` (not `VITE_`-prefixed) via `vite.config.ts` `define`. Do not rename this.
- `DISABLE_HMR=true` disables HMR (used in AI Studio to prevent flickering during agent edits). Keep this check in `vite.config.ts`.
- `APP_URL` is injected by AI Studio at runtime for Cloud Run deployments. Do not hardcode a base URL.

## Architecture

Single-package Vite + React 19 + TypeScript app. No monorepo. No backend server — Firebase handles auth and data, Gemini Live API handles the AI voice pipeline.

**Entry point:** `index.html` → `src/main.tsx` → `src/App.tsx`

**`src/App.tsx`** (~1560 lines) is the monolithic main component. It contains ALL logic: auth flow, Firestore reads/writes, Gemini Live session management, audio pipeline, tool call handling, settings panel, camera feed, and transcript display. Edit with extreme care — there are no extracted hooks or services.

**Key source files:**
| File | Purpose |
|---|---|
| `src/App.tsx` | Entire application component |
| `src/firebase.ts` | Firebase init + `handleFirestoreError()` helper |
| `src/lib/audio.ts` | `AudioStreamer` (TTS playback) and `AudioRecorder` (mic capture) |
| `src/components/KaraokeTranscript.tsx` | Animated word-by-word transcript |
| `src/index.css` | Single `@import "tailwindcss";` line (Tailwind v4) |
| `vite.config.ts` | Path alias `@` → `.`, Tailwind v4 plugin, env injection |

## Firebase + Firestore

- Config lives in `firebase-applet-config.json` (not `.env`).
- Firestore blueprint: `firebase-blueprint.json` defines `User` and `Message` schemas.
- **Messages are immutable** — `allow update, delete: if false` in `firestore.rules`. Never attempt to edit or delete messages.
- Every Firestore operation must use `handleFirestoreError()` from `src/firebase.ts` for structured error logging (includes auth context).
- Security invariants in `security_spec.md` must be preserved: user data isolation, timestamp validation (`== request.time`), role constrained to `user`/`model`, field validation by whitelist, length limits (`personaName` ≤ 50, `customPrompt` ≤ 2000, `message.text` ≤ 5000, document ID ≤ 128 chars matching `^[a-zA-Z0-9_\-]+$`).

## Gemini Live API

- SDK: `@google/genai` (`^1.29.0`), model: `gemini-3.1-flash-live-preview`.
- Audio modalities are used for real-time voice; tool calls (`toolCall` in `onmessage` callback) drive Google Services integration (Gmail, Calendar, Tasks, YouTube, Drive).
- The voice personality prompt (`VOICE_PERSONALITY_PROMPT`) is a ~130-line constant in `App.tsx`. Do not alter it casually — it defines the entire agent persona.

## UI / Styling

- Tailwind CSS v4 via `@tailwindcss/vite` plugin — uses `@import "tailwindcss"` syntax, no `tailwind.config.*`.
- Animation library: `motion` (formerly framer-motion), imported as `motion/react`.
- Icons: `lucide-react`.
- Markdown rendering: `react-markdown` for chat messages.
- Dark theme: `#050505` background, amber/warm peach (`#d0a78b`) accent.

## Reference UI

`public/reference-ui.html` contains the canonical landing page design with the orb animation, blob drift keyframes, peach glow, transcription area, and bottom nav. Use this as the design source of truth for UI changes.

## File to ignore

`temp.txt` is scrap data (Gemini SDK type definitions). Do not reference, import, or modify it.
