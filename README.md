# Transcript Styler

Transcript Styler is a Chrome extension that extracts YouTube captions, lets you restyle them with LLMs, and optionally produces TTS audio. The overlay lives directly on the watch page so you can go from raw captions to polished copy and exports without leaving the tab.

## Features

### Core

- Auto-detects video IDs and pulls captions (VTT or SRV3) directly from the YouTube page
- Sends caption segments to OpenAI, Anthropic, or OpenAI-compatible endpoints for restyling
- Supports multi-language input/output with customizable prompts
- Click any transcript segment to jump the YouTube player to that timestamp
- Exports to TXT, SRT, VTT, and JSON

### Advanced

- Live subtitle overlay mirrored on the YouTube player
- Text-to-speech via OpenAI, Azure, custom FastAPI (Kokoro), or the browser speech engine
- ASCII sanitization and blocklists for strict output requirements
- Moveable overlay with theme selection and persistent presets
- Debug logging and progress indicators for long-running jobs

### LLM & TTS Providers

- **LLM:** OpenAI, Anthropic, OpenAI-compatible (Ollama/LM Studio, etc.)
- **TTS:** OpenAI, Azure Speech, Browser TTS, Custom FastAPI (Kokoro)

## Installation

### Load Unpacked (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/helix4u/Transcripts-Styler.git
   cd Transcripts-Styler
   ```
2. Install dependencies: `npm install`
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the project folder.
4. Navigate to a YouTube video and confirm the overlay appears in the top-left corner once the page finishes loading.

## Configuration

The overlay stores preferences in Chrome storage. API keys live only in memory.

### LLM Providers

- **OpenAI** – Base URL `https://api.openai.com`, supply your API key and model (e.g., `gpt-4o-mini`).
- **Anthropic** – Base URL `https://api.anthropic.com`, specify the API version (default `2023-06-01`).
- **OpenAI-Compatible** – Point to your local or third-party endpoint (e.g., `http://localhost:11434`) and enter the corresponding model name.

### TTS Providers

- **OpenAI TTS** – Uses the same key as OpenAI LLM calls; select voice/format in the overlay.
- **Azure Speech** – Provide region and subscription key, then list voices.
- **Browser TTS** – Uses system voices; no API key required.
- **Custom FastAPI** – Provide the base URL for your own endpoint (e.g., Kokoro).

## Usage

1. Open a YouTube video with captions.
2. Click **Detect** (to populate video ID) and **List Tracks** to load caption options. Tracks pulled directly from the page are marked _in-page_.
3. Select a caption track and press **Fetch Transcript**. The transcript list populates immediately.
4. Configure provider credentials, prompts, and language preferences.
5. Press **Restyle All** to queue LLM calls. Use **Stop** to cancel outstanding requests.
6. Enable **Text-to-Speech** if you need audio output and click **Generate TTS**.
7. Export via TXT/SRT/VTT/JSON buttons.

### Tips

- Enable the **Debug Logging** checkbox to see `[TS-UI]` and `[TS-BG]` logs in DevTools.
- If tracks fail to load, refresh the watch page; the content script reloads after navigation.
- The extension surfaces errors in `chrome://extensions/?errors=<extension-id>`.

## Troubleshooting

| Issue                                      | What to try                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "No tracks found"                          | Ensure the YouTube transcript panel shows captions. Refresh the page to repopulate player metadata.                                                                      |
| "No transcript data loaded" when restyling | Fetch a transcript first (select a track and click **Fetch Transcript**). The restyle button will auto-fetch on your behalf, but errors still indicate missing captions. |
| 429/Rate-limit errors                      | The queue backs off automatically. Reduce concurrency or pause before retrying.                                                                                          |
| TTS generation fails                       | Confirm API keys/regions and that the provider supports the requested format.                                                                                            |

## Development

```
# Clone and install
git clone https://github.com/helix4u/Transcripts-Styler.git
cd Transcripts-Styler
npm install

# Lint / Format
npx eslint background.js content.js
npx prettier --write background.js content.js
```

Key files:

- `background.js` – MV3 service worker that handles network calls and caption fetching.
- `content.js` – Injected overlay logic and UI handlers.
- `overlay.css` – Styling for the floating panel.
- `docs/TODO.md` – extended roadmap (mirrors the README checklist).

## Changelog

### v0.4.1 (current)

- Added in-page caption discovery when timedtext endpoints fail
- Expanded transcript fetching to accept base URLs from YouTube player data
- Improved Azure TTS format handling and Anthropic API payloads

### Earlier Releases

See previous tags for v0.3.x, v0.2.x, and v0.1.x history.

## TODO

- [ ] Batch processing for multiple videos
- [ ] Additional TTS providers
- [ ] Japanese language enhancements (furigana, pitch accents)
- [ ] Collaborative preset sharing
- [ ] Chrome Web Store submission
- [ ] Firefox port
- [ ] Video timestamp seek integration
- [ ] Subtitle overlay on the video player
- [ ] Note-taking app integrations
- [ ] Public API surface for third-party tools

## Security & Privacy

- Transcripts are processed locally; only your configured API provider receives text for restyling or TTS.
- Preferences live in Chrome storage; API keys stay in memory and clear when the page/extension reloads.
- No telemetry is collected by the extension.

## License

Licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Support

- Open issues or feature requests via [GitHub Issues](https://github.com/helix4u/Transcripts-Styler/issues).
- Attach console logs (with Debug Logging enabled) and reproduction steps when reporting problems.
- Refer to `agents.md` if you are working with automation agents.
