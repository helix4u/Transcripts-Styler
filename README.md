# Transcript Styler

Bring YouTube captions into an AI-first transcript hub. Transcript Styler pairs a Chrome extension with a lightweight FastAPI helper so you can capture, restyle, narrate, and export transcripts without leaving the watch page.

> **Beta 0.4.1** — stable for everyday use, still polishing onboarding and provider coverage. Expect quick iteration.

## Quick Start (Chrome)
1. Clone or download this repository.
2. Open chrome://extensions, enable Developer mode, choose Load unpacked, and point to the repo root.
3. Start the local helper by running yt-transcript-local/start_server.bat on Windows or the shell recipe in yt-transcript-local/README.txt.
4. Load a captioned YouTube video, open the overlay, and click Detect + List followed by Fetch.

See INSTALL.md for screenshots, provider setup tips, and fallback guidance.

## What You Can Do
- Capture caption tracks through the bundled helper to dodge YouTube quota hiccups.
- Restyle transcripts with OpenAI, Anthropic, or any OpenAI-compatible endpoint using presets or custom prompts.
- Narrate with OpenAI, Azure Speech, Kokoro, or on-device browser voices, including auto-playback synced to video and a configurable rate multiplier (Kokoro defaults to http://localhost:8880/v1/audio/speech with voice af_sky+af+af_nicole).
- Ask the transcript questions and receive styled answers you can play back with the same TTS stack.
- Export synchronized transcripts to TXT, SRT, VTT, or JSON while keeping the original wording.
- Overlay original and restyled subtitles directly on the player with furigana support and draggable or dockable controls.

## Companion Helper (yt-transcript-local)
The helper exposes /api/ping, /api/tracks, and /api/transcript on http://127.0.0.1:17653. Keep it running during transcript tests. The included web UI (yt-transcript-local/index.html) confirms connectivity and subtitle availability.

## Product Walkthrough
- Overlay header — use Detect + List to capture the active video, populate caption choices, and then fetch transcripts. Toggle debug logging or park the UI inside the native transcript panel.
- Transcript workspace — search, click-to-seek, and review original or restyled sentences with persistent preferences.
- Restyle and TTS panels — configure prompt presets, batching, and provider keys; Kokoro FastAPI defaults are pre-filled, and you can queue auto-TTS with a two-decimal rate multiplier for the currently selected sentence.
- Transcript Q&A — type a question about the loaded captions, reuse your styling preferences, and optionally trigger read-aloud on the generated answer.
- Exports — download transcript bundles on demand. Each export reflects the latest restyling state.

## Documentation Map
- INSTALL.md — install and configuration guide.
- PROJECT_SUMMARY.md — architectural and feature overview.
- agents.md — automation workflow and environment notes for contributors.
- yt-transcript-local/README.txt — helper instructions.

## Development Loop
- npm install
- npx prettier --write background.js content.js
- npm run lint

Reload the extension from chrome://extensions after code changes. Overlay logs appear as [TS-UI], service worker logs as [TS-BG] under chrome://extensions/?errors=<extension-id>.

## Troubleshooting Highlights
- Transcript fetch fails? Confirm the helper is running (check /api/ping) and captions exist in the YouTube transcript panel.
- No overlay? Refresh the watch page and verify the extension is enabled.
- Provider errors? Double-check keys, base URLs, and concurrency; try single-request mode while debugging.
- TTS silent? Browser voices need a user gesture and may fail with Unicode when ASCII-only is enabled.

## License
MIT — see LICENSE.
