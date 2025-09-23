# Transcript Styler – Project Summary

## Overview
Transcript Styler 0.4.1 beta pairs a Chrome MV3 extension with a FastAPI helper to capture YouTube captions, restyle them with LLMs, add TTS playback, and export clean transcripts. The beta focuses on reliability, sentence-level syncing, and a polished overlay experience while we prepare for Chrome Web Store packaging.

## Repository Structure
- manifest.json — MV3 manifest (name, version 0.4.1, icons, permissions).
- background.js — service worker handling transcript fetches, LLM/TTS calls, storage, and abort logic.
- content.js — injected overlay that manages UI state, sentence parsing, exports, and subtitle injection.
- overlay.css — theming for the overlay and injected subtitles.
- yt-transcript-local/ — FastAPI helper (main.py, requirements.txt, index.html, start_server.bat).
- INSTALL.md — beta installation and helper setup guide.
- README.md — product overview and quick start.
- agents.md — automation workflow notes.
- package.json / package-lock.json — tooling metadata (eslint, prettier).
- .eslintrc.json, .prettierrc, .gitignore — project configuration.

## Extension Highlights
- Sentence-aware transcript rendering with dual original/restyled display and furigana support.
- Prompt presets, single-call batching, and provider overrides for OpenAI, Anthropic, and compatible LLM endpoints.
- Multi-provider TTS pipeline (OpenAI, Azure Speech, Kokoro, browser voices) with optional auto playback and guard pauses.
- Exporters for TXT, SRT, VTT, and JSON that always include both text variants plus timing metadata.
- Dockable overlay with persistent positioning, transcript search, active sentence highlighting, and quick seek controls.

## Helper Highlights
- Endpoint /api/tracks fetches caption metadata for the current video.
- Endpoint /api/transcript returns timestamped segments; the helper handles ASR fallbacks and duration normalization.
- Start scripts provision a virtual environment automatically on Windows; macOS/Linux commands are listed in INSTALL.md.

## Beta Status
- Focus areas: sentence parsing accuracy, dual subtitle display, provider resiliency, and documentation cleanup.
- Known tasks: polish onboarding copy, expand automated tests, and prep packaging scripts for Chrome Web Store review.
- Telemetry: none — API keys stay in memory, preferences live in chrome.storage.

## Development Reminders
- npm install for tooling, npx prettier --write background.js content.js for formatting, npm run lint before committing.
- Reload the extension after changes; MV3 service workers do not hot-reload.
- Keep the helper running during manual testing to avoid YouTube rate limits.

## License
MIT — see LICENSE for details.
