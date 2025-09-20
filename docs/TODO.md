# TODO

- Build minimal overlay UI and wire to background:
  - Detect video id, List Tracks, Fetch Transcript
  - Show transcript text in the panel
- Add Debug toggle persisted via `chrome.storage.local` (key: `ytro_debug`)
- Clean docs encoding artifacts (control chars, odd `?` between tokens)
- Implement restyle (LLM) call path from UI to `LLM_CALL`
- Add export (txt/srt/vtt/json) after restyle
- Add TTS controls and hooks incrementally (OpenAI-compatible, Azure, Browser TTS)
- Japanese enhancements (furigana, pitch accents, JLPT) behind a toggle
- README with quick install + usage

Notes
- API keys must not be persisted; only kept in memory while the tab is open
- Background already supports: LIST_TRACKS, FETCH_TRANSCRIPT, LLM_CALL, TTS_SPEAK, TTS_AZURE_VOICES, GET_PREFS, SET_PREFS
