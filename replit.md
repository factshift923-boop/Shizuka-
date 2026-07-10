# Shizuka

A zero-latency voice-companion assistant: a Node.js backend gateway that gives an AI persona ("Shizuka") multi-provider LLM routing and streaming text-to-speech, paired with a native Android client that listens continuously in the background and executes voice commands (opening apps, sending WhatsApp messages, or just chatting).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Shizuka backend env: `AI_PROVIDER` (`GEMINI` or `GROQ`, default `GEMINI`), `MODEL_NAME` (model id for the chosen primary provider), `OPENROUTER_MODEL` (fail-safe model id), and secrets `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`. Optional secret `SHIZUKA_API_KEY` gates `/api/chat` and `/api/tts` behind a shared key (strongly recommended before any public exposure, since both endpoints call billable upstream services).
- The Android client (`android-app/`) is a **standalone Gradle project outside the pnpm workspace** — it cannot be built, run, or previewed inside Replit (no Android SDK/emulator here). Open it in Android Studio. See `android-app/README.md` for setup, including pointing `Constants.BACKEND_BASE_URL` at your deployed backend.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Shizuka AI routing: `@google/genai` (Gemini), `groq-sdk` (Groq), OpenRouter via `fetch` (fail-safe)
- Shizuka TTS: `msedge-tts` (Microsoft Edge neural voices, streamed as raw MP3)
- Android client: Kotlin, AccessibilityService, SpeechRecognizer, OkHttp — standalone Gradle project, not part of the pnpm workspace

## Where things live

- `artifacts/api-server/src/lib/persona.ts` — Shizuka's system prompt and the strict intent-JSON parser/validator (source of truth for the `{action, target, message, reply}` contract).
- `artifacts/api-server/src/lib/aiRouter.ts` — provider routing: primary (Gemini/Groq per `AI_PROVIDER`) with automatic OpenRouter fail-safe, then a safe outage fallback intent.
- `artifacts/api-server/src/lib/tts.ts` — Edge-TTS voice selection (Hindi vs. English/Hinglish by script detection) and streaming synthesis.
- `artifacts/api-server/src/routes/chat.ts`, `src/routes/tts.ts` — `POST /api/chat` and `POST /api/tts`, both behind `src/middlewares/shizukaGuard.ts` (optional shared-key auth + per-IP rate limiting).
- `android-app/` — the native Android client (Kotlin/XML), a separate Gradle project. Core files: `MainActivity.kt` (settings dashboard), `ShizukaAccessibilityService.kt` (background voice engine), `VoiceProcessor.kt` (anti-stutter transcript cleanup), `AppLauncher.kt` / `WhatsAppLauncher.kt` (action execution), `ApiClient.kt` (backend calls).

## Architecture decisions

- The LLM persona and JSON contract live in one file (`persona.ts`) shared by every provider path, so Gemini/Groq/OpenRouter always produce identically-shaped, identically-toned output regardless of which one actually answered.
- `parseShizukaIntent` enforces action-dependent field invariants (e.g. `CHAT` must carry empty `target`/`message`, `WHATSAPP` must carry a non-empty `message`) and rejects unknown keys — this is a deliberately strict contract boundary between the LLM and the mobile client's action-execution logic.
- `/api/tts` streams raw MP3 bytes directly from `msedge-tts` to the HTTP response (no server-side buffering) to minimize time-to-first-audio-byte.
- The Android client pauses its `SpeechRecognizer` pipeline for the entire duration of TTS playback (see `isSpeaking` gating in `ShizukaAccessibilityService`) to prevent the mic from capturing Shizuka's own voice and looping it back as a new command.
- `/api/chat` and `/api/tts` sit behind `shizukaGuard` middleware (optional `SHIZUKA_API_KEY` header check + fixed-window per-IP rate limiting) because both call metered upstream AI/TTS providers and must not be left open to abuse.

## Product

- **Backend gateway**: a persona-driven chat endpoint that always replies as "Shizuka" (warm, playful, English/Hindi/Hinglish) and always returns a strict action JSON, plus a streaming text-to-speech endpoint with automatic Hindi/English voice selection.
- **Android client**: a settings dashboard for the three permissions the background engine needs (Accessibility Service, mic + battery-optimization exemption, display-over-other-apps), and a background service that listens continuously (or wakes on a hardware double-volume-press), cleans the transcript, calls the backend, speaks the reply, and executes the resulting action (open an app, or prefill a WhatsApp message) — with full teardown the instant the app is swiped from Recents.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The Android app is **not** buildable/runnable in this Replit workspace — there's no Android SDK or emulator here. It's a standalone Gradle project meant for Android Studio.
- `AI_PROVIDER`, `MODEL_NAME`, and `OPENROUTER_MODEL` are set with working defaults (`GEMINI` / `gemini-2.0-flash` / a free OpenRouter model), but the actual API keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`) have not been provided yet — until at least one is set, `/api/chat` always returns the safe outage-fallback reply.
- `SHIZUKA_API_KEY` is optional and unset by default (dev mode) — the server logs one warning and allows unauthenticated requests. Set it (and configure `Constants.API_KEY` in the Android client to match) before exposing the backend publicly.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `android-app/README.md` — setup instructions for the native Android client
