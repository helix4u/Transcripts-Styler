# Transcript Styler – Beta Installation Guide

This guide walks through installing the 0.4.1 beta extension, starting the local transcript helper, and wiring optional AI providers. Keep the helper running while you test; the extension relies on it for track discovery and transcript fetching.

## Prerequisites
- Google Chrome 110 or newer (Chromium builds work, Brave/Edge untested).
- Optional API keys for OpenAI, Anthropic, Azure Speech, or other OpenAI-compatible services.
- Python 3.9+ if you plan to run the helper manually on macOS or Linux.

## 1. Get the Files
- Clone the repository: git clone https://github.com/helix4u/Transcripts-Styler.git
- Or download the ZIP from GitHub and extract it to a working folder.

## 2. Load the Extension
1. Open chrome://extensions.
2. Enable Developer mode (toggle in the top-right corner).
3. Click Load unpacked.
4. Select the Transcripts-Styler directory.
5. Confirm Transcript Styler appears in the extension list and stays enabled.

## 3. Start the Local Helper
### Windows
- Run yt-transcript-local/start_server.bat from the repository root. The script creates a .venv, installs dependencies, and launches uvicorn on http://127.0.0.1:17653.

### macOS / Linux
- cd yt-transcript-local
- python3 -m venv .venv
- source .venv/bin/activate
- pip install -r requirements.txt
- uvicorn main:app --host 127.0.0.1 --port 17653 --workers 1

### Verify
- Visit http://127.0.0.1:17653 in a browser or open yt-transcript-local/index.html.
- Expect api/ping to return {"ok": true}.

Keep this process running any time you fetch transcripts.

## 4. First-Run Checklist
1. Navigate to a YouTube watch page with captions enabled.
2. Click Detect + List to populate the video ID field and caption dropdown.
3. Choose a caption track from the dropdown.
4. Press Fetch to populate the overlay and subtitle panel.
5. Toggle Show both original and styled text if you want dual subtitles over the video.
6. Optional: Open the Transcript Q&A section to ask questions once the transcript loads.

## Provider Configuration
- Open the Restyle or TTS panels to select a provider and paste the relevant API key. Keys live in memory only.
- Adjust concurrency for LLM calls; start with 1 while testing new providers.
- Use the presets menu to store and reuse prompt settings across sessions.

## Transcript Q&A Quick Use
- Keep a transcript loaded (via Fetch or auto-load) and scroll to the Transcript Q&A panel.
- Enter a question about the current captions, then click Ask (or press Ctrl/Cmd+Enter).
- Responses inherit your style and output-language preferences; the Read Aloud button reuses your TTS provider settings.
- Answers appear inline; if the helper or providers are offline you will see an error message instead.

## Troubleshooting Cheatsheet
- No tracks found — refresh the YouTube tab so the content script re-parses player JSON.
- Transcript fetch failed — confirm the helper console shows requests and api/ping responds.
- Provider error — keys must be valid and the base URL should include the API version (for example, https://api.openai.com/v1).
- Silent TTS — browser voices need a user gesture; cloud voices may fail if ASCII-only mode strips non-Latin characters.
- Overlay missing — ensure the extension is still enabled and you are on a watch page, not the YouTube homepage.

## Developer Notes
- npm install to grab linting and formatting tools.
- npx prettier --write background.js content.js to keep the scripts tidy.
- npm run lint to check background.js and content.js before committing.
- Reload the extension after edits; there is no hot-reload for MV3 service workers.

## Version
- Release: 0.4.1 beta
- Last updated: September 2025
