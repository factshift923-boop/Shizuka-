# Shizuka — Native Android Client

This directory is a standalone, standard **Android Studio / Gradle** project. It is
**not** part of the pnpm workspace and cannot be built, run, or previewed inside this
Replit environment — there is no Android SDK, emulator, or Gradle toolchain available
here. Open this folder directly in Android Studio (or run `./gradlew assembleDebug`
on a machine with the Android SDK installed) to build and install it on a device.

It talks to the Shizuka backend (the `api-server` artifact in this project) over
HTTPS. Before building, point the client at your deployed backend:

1. Deploy/publish the `api-server` artifact (or run it locally on a machine reachable
   from your phone) so you have a stable base URL such as
   `https://your-app.replit.app/api`.
2. Edit `app/src/main/java/com/shizuka/assistant/Constants.kt` and set
   `BACKEND_BASE_URL` to that URL (must end with `/api`, no trailing slash after that).
3. Build and install the APK from Android Studio.

## What's inside

- `MainActivity.kt` / `activity_main.xml` — the settings dashboard with three
  Material switches (Accessibility Service, Microphone & Background Permission,
  Display Over Other Apps), state persisted in `SharedPreferences`.
- `ShizukaAccessibilityService.kt` — the always-on background engine: manages the
  `SpeechRecognizer` pipeline, listens for a hardware double-volume-press wake
  hotkey, talks to the backend, and executes the returned action (`OPEN`,
  `WHATSAPP`, `CHAT`). Implements `onTaskRemoved` to tear everything down the
  instant the app is swiped away from Recents.
- `VoiceProcessor.kt` — the local anti-stutter transcript cleaner
  (collapses "open open chrome" → "open chrome").
- `AppLauncher.kt` — resolves a spoken app name to an installed package and
  launches it via `packageManager.getLaunchIntentForPackage`.
- `WhatsAppLauncher.kt` — builds and fires the `https://api.whatsapp.com/send`
  deep link with the prefilled message.
- `ApiClient.kt` — thin OkHttp wrapper for `POST /api/chat` and `POST /api/tts`.
- `Constants.kt` — shared constants (backend URL, notification channel, prefs keys).

## Required permissions

Declared in `AndroidManifest.xml`: `RECORD_AUDIO`, `INTERNET`,
`SYSTEM_ALERT_WINDOW`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`,
`FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `POST_NOTIFICATIONS`,
and `QUERY_ALL_PACKAGES` (needed so voice commands can resolve and launch any
installed app by spoken name, not just a hardcoded allowlist — if you plan to
publish to Google Play, replace this with an explicit `<queries>` allowlist of
the specific packages you support, since `QUERY_ALL_PACKAGES` requires a Play
Console declaration).
