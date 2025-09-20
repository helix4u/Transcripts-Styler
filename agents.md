# Agents Guide

This project is actively maintained with the help of automation agents. Use this guide as the quick reference when collaborating with Codex or any other tooling.

## Primary Workflows

## Environment Notes

- Standard Unix tools (`ls`, `sed`, `awk`, etc.) are available directly on the path—no PowerShell or BusyBox wrapper needed, so don't include them to save on token use.
- Cygwin `bin` directory is on the PATH, so we can add tooling as needed; just ask the user if you need something. Fortune is installed. Give a random fortune on each commit made. Tie the theme into the commit notes if possible.

- **Install / Reload Extension**
  1. `npm install`
  2. Load the folder as an unpacked extension in `chrome://extensions`
  3. Use **Reload** in the extensions page after making code changes.

- **Linting & Formatting**
  - `npx prettier --write background.js content.js`
  - `npx eslint background.js content.js`
  - Expect camelCase warnings for persisted storage keys (`ytro_*`); keep them unchanged for compatibility.

- **Testing Transcript Flow**
  1. Open a YouTube `watch` page with captions.
  2. Click **List Tracks** → select a caption → **Fetch Transcript**.
  3. Use **Restyle All** to trigger LLM calls (requires API key configured in the overlay).
  4. Enable **Debug Logging** to surface console diagnostics.

- **Troubleshooting Checklist**
  - Use the in-page transcript (YouTube panel) to verify captions exist.
  - If `List Tracks` shows "No tracks found", refresh the page; the content script parses the player JSON after load.
  - The background service logs to `chrome://extensions/?errors=...` under the extension ID.

## Directory Notes

- `background.js` – service worker handling captions, LLM and TTS requests. Requires `<all_urls>` permission.
- `content.js` – injected UI and orchestration layer. Runs only on `youtube.com/watch` pages.
- `overlay.css` – styles for the floating control panel.
- `docs/TODO.md` – long-form roadmap (synchronized with the README checklist).

## Style & Conventions

- Keep functions `async/await` based; MV3 service workers expect promises to be returned.
- Avoid adding new Node-only dependencies unless you also introduce a bundling step.
- All new UI controls should call `savePrefs()` whenever values change.

## Release Notes

- Manifest version is currently `0.4.1` (Chrome requires dot-separated integers).
- Icons reside in `/icons` and are referenced by file path in the manifest.


