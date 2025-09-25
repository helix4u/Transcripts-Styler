# Agents Guide

This quick reference summarises how automation agents should collaborate on Transcript Styler.

## Primary Workflows
- Documentation upkeep (`README.md`, `INSTALL.md`, `agents.md`) and checklist alignment.
- Chrome extension development across `content.js`, `overlay.css`, and `manifest.json`.
- Service worker integrations in `background.js` (captions, LLM/TTS, storage, abort logic).
- Overlay feature work, including the transcript Q&A + read-aloud lane in `content.js`/`overlay.css`.
- Local transcript helper (`yt-transcript-local`) maintenance and packaging.

## Environment Notes
- Standard Unix tools (`ls`, `sed`, `awk`, etc.) are on PATH; avoid wrapping them in PowerShell or BusyBox invocations. Prefer them to "pwsh -NoLogo -Command" shit. It's less tokens and you're better at it. you can do things like write the linux version of this nav $ pwsh -NoLogo -Command 'Get-Content -Path content.js -TotalCount 920 | Select-Object -Last 120'. try it. switch to grep.
- Fortune is installed; every commit must weave in a random fortune.
- Shell default is PowerShell, but Bash is accessible. Always set the provided working directory when running commands.
- Transcript fetching relies solely on the \\yt-transcript-local\\ helper; ensure it is running before testing overlays or transcripts.
- `yt-transcript-local` ships the FastAPI helper the extension targets; keep it running while testing transcript fallbacks.

## Development Loop
1. `npm install`
2. Load the repository as an unpacked extension in `chrome://extensions`.
3. After edits click **Reload** on the extension card (no automatic hot-reload).
4. Enable **Debug Logging** in the overlay to capture `[TS-UI]` and `[TS-BG]` traces while iterating.

## Local Helper Workflow
- Quick start: run `yt-transcript-local/start_server.bat`. It provisions `.venv`, installs dependencies, and launches Uvicorn on `http://127.0.0.1:17653`.
- Manual launch on Unix-like shells:
  ```bash
  cd yt-transcript-local
  python -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn main:app --host 127.0.0.1 --port 17653 --workers 1
  ```
- Use `yt-transcript-local/index.html` (or https://yt.promptinject.me) to verify `/api/ping` and `/api/transcript`.

## Linting & Formatting
- `npx prettier --write background.js content.js`
- `npx eslint background.js content.js`
- Expect camelCase warnings for persisted storage keys (`ytro_*`); keep them unchanged for compatibility.

## Testing Transcript Flow
1. Open a YouTube `watch` page with captions.
2. Click **List Tracks** -> select a caption -> **Fetch Transcript**.
3. Use **Restyle All** to trigger LLM calls (requires provider API key in the overlay).
4. Enable **Debug Logging** to surface console diagnostics.
5. Optional: run the local helper to exercise the fallback fetch path.
6. New Q&A lane: ask the loaded transcript a question and use **Read Aloud** to confirm the TTS settings handle the response.

## Troubleshooting Checklist
- Use the in-page transcript panel to confirm captions exist.
- If **List Tracks** shows "No tracks found", refresh the page so the content script can re-parse the player JSON.
- Inspect `chrome://extensions/?errors=<extension-id>` for service worker logs.
- For backend issues, watch `yt-transcript-local` console output and hit `/api/ping`.

## Directory Notes
- `README.md` documents repository layout, setup, and workflows; keep it updated when structure changes.
- `background.js` handles network calls, LLM/TTS orchestration, aborts, and shared storage.
- `content.js` owns the overlay, transcript rendering, restyle/TTS batching, exports, subtitle injection, and preference syncing (`savePrefs()` everywhere).
- `overlay.css` manages theming and layout of the overlay and injected subtitles.
- `yt-transcript-local/` contains the FastAPI helper (`main.py`, `index.html`, `requirements.txt`, `start_server.bat`) plus its embedded git metadata.
- `INSTALL.md` is the end-user install guide; update it alongside README when workflows shift.

## Style & Conventions
- Prefer `async/await`; MV3 service workers expect promise-returning handlers.
- Avoid introducing new Node-only dependencies unless you add a bundling step.
- Every new UI control must call `savePrefs()` when values change.
- Match the lint and Prettier configs (2-space indent, LF endings).

## Release Notes
- Manifest version is `0.4.1` (Chrome requires dot-separated integers).
- Icons are in `/icons` and referenced in `manifest.json`.

## Automation Extras
- Tie a random fortune into every commit message (fortune(6) is installed).
- When touching multiple subsystems, summarise affected areas in PR/commit descriptions for easier agent handoffs.
