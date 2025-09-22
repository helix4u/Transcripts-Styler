// Transcript Styler - Content Script
// v0.4.0-test with comprehensive features and logging

// Only inject on YouTube watch pages
if (location.hostname === 'www.youtube.com' && location.pathname === '/watch') {
  // Global state
  let transcriptData = [];
  let aborter = null;
  let UI_DEBUG = false;
  const lastPrefs = {};
  let activeBatchId = null;
  let lastTtsUrl = null;
  let activeSegmentIndex = -1;
  let videoListenerAttached = false;
  let subtitleOverlayEl = null;
  let autoTtsEnabled = false;
  let lastAutoTtsSegment = -1;
  let activeTtsRequestId = null;
  let activeTtsBatchId = null;
  let browserTtsActive = false;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Logging utilities
  function log(...args) {
    if (UI_DEBUG) {
      console.log('[TS-UI]', ...args);
    }
  }

  function logError(...args) {
    console.error('[TS-UI-ERROR]', ...args);
  }

  function dur(start) {
    return `${Date.now() - start}ms`;
  }

  // Create overlay UI
  const overlay = document.createElement('div');
  overlay.id = 'yt-transcript-overlay';
  overlay.innerHTML = `
  <div class="yt-overlay-header">
    <span class="yt-overlay-title">Transcript Styler v0.4.0-test</span>
    <div class="yt-overlay-controls">
      <label><input type="checkbox" id="yt-debug-toggle"> Debug Logging</label>
      <button id="yt-collapse-btn">−</button>
      <button id="yt-close-btn">×</button>
    </div>
  </div>
  
  <div class="yt-overlay-content">
    <!-- Video Detection Section -->
    <div class="yt-section">
      <h4>Video Detection</h4>
      <div class="yt-controls">
        <input type="text" id="yt-video-id" placeholder="Auto-detected video ID">
        <button id="yt-detect-btn">Detect</button>
        <button id="yt-list-tracks-btn">List Tracks</button>
        <button id="yt-fetch-transcript-btn">Fetch Transcript</button>
      </div>
      <select id="yt-track-select" style="width: 100%; margin-top: 5px;">
        <option value="">Select a track...</option>
      </select>
    </div>

    <!-- Customization Section -->
    <div class="yt-section">
      <h4>Customization</h4>
      <div class="yt-controls">
        <label>Theme:</label>
        <select id="yt-theme-select">
          <option value="theme-dark">Dark</option>
          <option value="theme-light">Light</option>
          <option value="theme-system">System</option>
        </select>
      </div>
      <div class="yt-controls">
        <button id="yt-save-preset-btn">Save Preset</button>
        <button id="yt-export-presets-btn">Export Presets</button>
        <input type="file" id="yt-import-presets-input" accept=".json" style="display: none;">
        <button id="yt-import-presets-btn">Import Presets</button>
      </div>
    </div>

    <!-- Language Preferences Section -->
    <div class="yt-section collapsible" data-section="lang">
      <h4 class="section-header">Language Preferences <span class="collapse-icon">▼</span></h4>
      <div class="section-content">
      <div class="yt-controls">
        <label>Preferred Languages (comma-separated):</label>
        <input type="text" id="yt-lang-prefs" placeholder="en,es,fr,de,ja" style="width: 100%;">
      </div>
      <div class="yt-controls">
        <label>Font Size:</label>
        <input type="number" id="yt-font-size" min="10" max="48" value="24" style="width: 70px;">
        <span>px</span>
        <button id="yt-apply-font" title="Apply subtitle/UI font size">Apply</button>
      </div>
      <div class="yt-controls">
        <label>Output Language:</label>
        <select id="yt-output-lang">
          <option value="English">English</option>
          <option value="Spanish">Spanish</option>
          <option value="French">French</option>
          <option value="German">German</option>
          <option value="Japanese">Japanese</option>
          <option value="Chinese">Chinese</option>
          <option value="Korean">Korean</option>
          <option value="Portuguese">Portuguese</option>
          <option value="Italian">Italian</option>
          <option value="Russian">Russian</option>
          <option value="Arabic">Arabic</option>
          <option value="Hindi">Hindi</option>
          <option value="custom">Custom...</option>
        </select>
        <input type="text" id="yt-custom-lang" placeholder="Enter custom language" style="display: none; margin-top: 5px;">
      </div>
      </div>
    </div>

    <!-- LLM Controls Section -->
    <div class="yt-section collapsible" data-section="llm">
      <h4 class="section-header">LLM Provider <span class="collapse-icon">▼</span></h4>
      <div class="section-content">
      <div class="yt-controls">
        <select id="yt-provider">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="openai-compatible">OpenAI-Compatible</option>
        </select>
        <input type="text" id="yt-base-url" placeholder="Base URL" style="width: 45%;">
      </div>
      <div class="yt-controls" id="yt-anthropic-options" style="display: none;">
        <input type="text" id="yt-anthropic-version" placeholder="Anthropic API version (e.g., 2023-06-01)" style="width: 100%;">
      </div>
      <div class="yt-controls">
        <input type="password" id="yt-api-key" placeholder="API Key (memory only)" style="width: 60%;">
        <input type="text" id="yt-model" placeholder="Model" style="width: 35%;">
      </div>
      <div class="yt-controls">
        <label>Concurrency:</label>
        <input type="number" id="yt-concurrency" min="1" max="10" value="3" style="width: 60px;">
        <label><input type="checkbox" id="yt-ascii-only"> ASCII-only output</label>
      </div>
      <div class="yt-controls">
        <label>Temperature:</label>
        <input type="number" id="yt-temperature" min="0" max="2" step="0.1" value="0.7" style="width: 80px;">
      </div>
      <div class="yt-controls">
        <label>Max tokens:</label>
        <input type="number" id="yt-max-tokens" min="64" max="320000" value="1000" style="width: 80px;">
      </div>
      <div class="yt-controls">
        <label><input type="checkbox" id="yt-single-call"> Single-call restyle</label>
      </div>
      <div class="yt-controls">
        <label>ASCII Blocklist:</label>
        <input type="text" id="yt-blocklist" placeholder="Additional characters to avoid" style="width: 100%;">
      </div>
      </div>
    </div>

    <!-- Style & Prompt Section -->
    <div class="yt-section collapsible" data-section="style">
      <h4 class="section-header">Style & Prompt <span class="collapse-icon">▼</span></h4>
      <div class="section-content">
      <div class="yt-controls">
        <select id="yt-style-preset">
          <option value="clean">Clean & Professional</option>
          <option value="casual">Casual & Conversational</option>
          <option value="academic">Academic & Formal</option>
          <option value="creative">Creative & Engaging</option>
          <option value="technical">Technical & Precise</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div class="yt-controls" id="yt-style-text-row" style="display: none;">
        <input type="text" id="yt-style-text" placeholder="Describe style (e.g., Cartman from South Park)" style="width: 100%;">
      </div>
      <textarea id="yt-prompt-template" rows="4" style="width: 100%;" placeholder="Custom prompt template..."></textarea>
      <div class="yt-controls">
        <button id="yt-restyle-btn">Restyle All</button>
        <button id="yt-stop-btn">Stop</button>
        <span id="yt-progress"></span>
      </div>
      </div>
    </div>

    <!-- TTS Section -->
    <div class="yt-section collapsible" data-section="tts">
      <h4 class="section-header">Text-to-Speech <span class="collapse-icon">▼</span></h4>
      <div class="section-content">
      <div class="yt-controls">
        <label><input type="checkbox" id="yt-tts-enabled"> Enable TTS</label>
        <select id="yt-tts-provider">
          <option value="openai">OpenAI TTS</option>
          <option value="openai-compatible">OpenAI-Compatible</option>
          <option value="kokoro">Kokoro FastAPI</option>
          <option value="azure">Azure TTS</option>
          <option value="browser">Browser TTS</option>
        </select>
      </div>
      <div class="yt-controls" id="yt-tts-voice-controls">
        <input type="text" id="yt-tts-voice" placeholder="Voice (e.g., alloy, nova)" style="width: 60%;">
        <select id="yt-tts-format">
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
          <option value="ogg">OGG</option>
        </select>
      </div>
      <div class="yt-controls" id="yt-azure-controls" style="display: none;">
        <input type="text" id="yt-azure-region" placeholder="Azure region (e.g., eastus)" style="width: 45%;">
        <button id="yt-azure-voices-btn">List Voices</button>
        <select id="yt-azure-voice-select" style="width: 100%; margin-top: 5px;">
          <option value="">Select Azure voice...</option>
        </select>
      </div>
      <div class="yt-controls" id="yt-browser-tts-controls" style="display: none;">
        <select id="yt-browser-voice-select" style="width: 60%;">
          <option value="">Select browser voice...</option>
        </select>
        <label>Rate:</label>
        <input type="range" id="yt-tts-rate" min="0.5" max="2" step="0.1" value="1" style="width: 80px;">
        <span id="yt-rate-value">1.0</span>
      </div>
      <div class="yt-controls">
        <button id="yt-generate-tts-btn">Generate TTS</button>
        <button id="yt-stop-tts-btn" style="display: none;">Stop TTS</button>
        <button id="yt-download-tts-btn" style="display: none;">Download Audio</button>
      </div>
      <audio id="yt-tts-audio" controls style="width: 100%; margin-top: 5px; display: none;"></audio>
      </div>
    </div>

    <!-- Export Section -->
    <div class="yt-section collapsible" data-section="export">
      <h4 class="section-header">Export <span class="collapse-icon">▼</span></h4>
      <div class="section-content">
      <div class="yt-controls">
        <button id="yt-export-txt-btn">Export TXT</button>
        <button id="yt-export-srt-btn">Export SRT</button>
        <button id="yt-export-vtt-btn">Export VTT</button>
        <button id="yt-export-json-btn">Export JSON</button>
      </div>
      </div>
    </div>

    <!-- Transcript Display Section -->
    <div class="yt-section">
      <h4>Transcript</h4>
      <div class="yt-controls">
        <input type="text" id="yt-search-input" placeholder="Search transcript..." style="width: 100%;">
      </div>
      <div class="yt-controls">
        <label><input type="checkbox" id="yt-auto-tts"> Auto-play TTS with video timing</label>
        <select id="yt-auto-tts-type" style="margin-left: 10px;">
          <option value="original">Original text</option>
          <option value="restyled">Restyled text</option>
        </select>
      </div>
      <div class="yt-controls">
        <label><input type="checkbox" id="yt-furigana"> Show furigana for Japanese text</label>
        <label><input type="checkbox" id="yt-show-both"> Show both original and styled text over video</label>
      </div>
      <div id="yt-transcript-list" class="yt-transcript-list"></div>
    </div>

    <!-- Status Section -->
    <div class="yt-section">
      <div id="yt-status" class="yt-status"></div>
    </div>
  </div>
`;

  // Append overlay to page
  document.body.appendChild(overlay);

  // Global functions for UI interactions
  async function getPrefs() {
    try {
      const response = await sendMessage('GET_PREFS', {
        keys: ['ytro_prefs']
      });
      
      if (response.success && response.data.ytro_prefs) {
        return response.data.ytro_prefs;
      }
      return {};
    } catch (error) {
      logError('Failed to get preferences:', error);
      return {};
    }
  }

  async function playSegmentTTS(segmentIndex, textType) {
    if (!transcriptData || segmentIndex < 0 || segmentIndex >= transcriptData.length) {
      return;
    }

    const segment = transcriptData[segmentIndex];
    let textToSpeak = '';
    
    if (textType === 'original') {
      textToSpeak = segment.text || '';
    } else if (textType === 'restyled') {
      textToSpeak = segment.restyled || '';
    }

    log(`TTS input - segment ${segmentIndex}, type: ${textType}, text: "${textToSpeak}"`);

    if (!textToSpeak.trim()) {
      setStatus('No text content to speak');
      return;
    }

    // Stop any currently playing TTS
    const currentAudio = elements.ttsAudio;
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      } catch (_) {
        /* ignore pause errors */
      }
    }

    try {
      // Get current TTS settings
      const prefs = await getPrefs();
      
      if (!prefs.ttsEnabled) {
        setStatus('TTS is not enabled. Enable it in the TTS section first.');
        return;
      }

      // Check for ASCII-only mode with non-ASCII text
      if (prefs.asciiOnly && /[^\x00-\x7F]/.test(textToSpeak)) {
        setStatus('Warning: ASCII-only mode is enabled but text contains Unicode characters. TTS may not work properly.');
        log('ASCII-only mode warning: Text contains non-ASCII characters:', textToSpeak);
      }

      // Handle browser TTS directly in content script
      if (prefs.ttsProvider === 'browser') {
        if (!('speechSynthesis' in window)) {
          setError('Browser TTS not supported in this environment');
          return;
        }

        const cleanText = textToSpeak.trim();
        if (!cleanText) {
          setStatus('No text to speak');
          return;
        }

        log(
          `Browser TTS: Speaking text (${cleanText.length} chars): "${cleanText.substring(0, 50)}${
            cleanText.length > 50 ? '...' : ''
          }"`
        );

        if (browserTtsActive || window.speechSynthesis.speaking) {
          log('Browser TTS already speaking; queuing next utterance');
        }

        return new Promise(resolve => {
          const finish = () => {
            browserTtsActive = false;
            updateStopButtonVisibility();
            resolve();
          };

          const utterance = new SpeechSynthesisUtterance(cleanText);

          const voices = window.speechSynthesis.getVoices();
          let selectedVoice = null;

          if (prefs.ttsVoice) {
            selectedVoice = voices.find(v => v.name === prefs.ttsVoice || v.voiceURI === prefs.ttsVoice);

            if (!selectedVoice) {
              const languageCode = prefs.ttsVoice.toLowerCase();
              selectedVoice = voices.find(
                v => v.lang.toLowerCase().includes(languageCode) || v.name.toLowerCase().includes(languageCode)
              );
            }
          }

          if (!selectedVoice) {
            if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(cleanText)) {
              selectedVoice = voices.find(
                v => v.lang.toLowerCase().includes('ja') || v.lang.toLowerCase().includes('japanese')
              );
              if (selectedVoice) {
                log(`Auto-selected Japanese voice: ${selectedVoice.name}`);
              }
            } else if (/[\u4e00-\u9fff]/.test(cleanText)) {
              selectedVoice = voices.find(
                v => v.lang.toLowerCase().includes('zh') || v.lang.toLowerCase().includes('chinese')
              );
              if (selectedVoice) {
                log(`Auto-selected Chinese voice: ${selectedVoice.name}`);
              }
            } else if (/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(cleanText)) {
              selectedVoice = voices.find(
                v => v.lang.toLowerCase().includes('ko') || v.lang.toLowerCase().includes('korean')
              );
              if (selectedVoice) {
                log(`Auto-selected Korean voice: ${selectedVoice.name}`);
              }
            } else if (/[\u0600-\u06ff]/.test(cleanText)) {
              selectedVoice = voices.find(
                v => v.lang.toLowerCase().includes('ar') || v.lang.toLowerCase().includes('arabic')
              );
              if (selectedVoice) {
                log(`Auto-selected Arabic voice: ${selectedVoice.name}`);
              }
            } else if (/[\u0400-\u04ff]/.test(cleanText)) {
              selectedVoice = voices.find(
                v => v.lang.toLowerCase().includes('ru') || v.lang.toLowerCase().includes('russian')
              );
              if (selectedVoice) {
                log(`Auto-selected Russian voice: ${selectedVoice.name}`);
              }
            }
          }

          if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
            log(`Using voice: ${selectedVoice.name} (${selectedVoice.lang})`);
          } else {
            log('No specific voice found, using default');
          }

          utterance.rate = prefs.ttsRate || 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;

          utterance.onstart = () => {
            browserTtsActive = true;
            updateStopButtonVisibility();
          };

          utterance.onend = () => {
            log('Browser TTS completed');
            finish();
          };

          utterance.onerror = event => {
            logError('Browser TTS error:', event.error);
            setError(`TTS error: ${event.error}`);
            finish();
          };

          try {
            window.speechSynthesis.speak(utterance);
            setStatus(`Playing ${textType} text for segment ${segmentIndex + 1} (browser TTS)`);
          } catch (error) {
            logError('Failed to queue browser TTS:', error);
            setError('Failed to start browser TTS');
            finish();
          }
        });
      }
      // Send TTS request to background script for other providers
      const response = await sendMessage('TTS_SPEAK', {
        text: textToSpeak,
        provider: prefs.ttsProvider,
        voice: prefs.ttsVoice,
        format: prefs.ttsFormat,
        azureRegion: prefs.azureRegion,
        baseUrl: prefs.baseUrl,
        apiKey: prefs.apiKey,
        rate: prefs.ttsRate
      });

      if (response.success && response.data && response.data.audioData) {
        if (!currentAudio) {
          setError('No audio element available for TTS playback');
          return;
        }

        const audioData = response.data.audioData;
        const mimeType = response.data.mime || 'audio/mpeg';
        const binaryString = atob(audioData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i += 1) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        const audioUrl = URL.createObjectURL(blob);

        currentAudio.src = audioUrl;
        currentAudio.style.display = 'block';
        setStatus(`Playing ${textType} text for segment ${segmentIndex + 1}`);

        await new Promise(resolve => {
          let resolved = false;

          const cleanup = () => {
            if (resolved) return;
            resolved = true;
            currentAudio.removeEventListener('ended', onEnded);
            currentAudio.removeEventListener('error', onError);
            currentAudio.removeEventListener('pause', onPause);
            URL.revokeObjectURL(audioUrl);
            resolve();
          };

          const onEnded = () => {
            cleanup();
          };

          const onError = event => {
            logError('Failed to play TTS audio:', event?.error || event);
            setStatus('Failed to play audio');
            cleanup();
          };

          const onPause = () => {
            if (!currentAudio.paused) {
              return;
            }
            if (currentAudio.ended || currentAudio.currentTime === 0 || !currentAudio.src) {
              cleanup();
            }
          };

          currentAudio.addEventListener('ended', onEnded, { once: true });
          currentAudio.addEventListener('error', onError, { once: true });
          currentAudio.addEventListener('pause', onPause, { once: true });

          const playPromise = currentAudio.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(onError);
          }
        });
      } else {
        setError(`TTS failed: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      logError('TTS request failed:', error);
      setError('Failed to generate TTS audio');
    }
  };

  // Element references
  const elements = {
    debugToggle: document.getElementById('yt-debug-toggle'),
    collapseBtn: document.getElementById('yt-collapse-btn'),
    closeBtn: document.getElementById('yt-close-btn'),
    content: document.querySelector('.yt-overlay-content'),

    videoId: document.getElementById('yt-video-id'),
    detectBtn: document.getElementById('yt-detect-btn'),
    listTracksBtn: document.getElementById('yt-list-tracks-btn'),
    fetchTranscriptBtn: document.getElementById('yt-fetch-transcript-btn'),
    trackSelect: document.getElementById('yt-track-select'),

    themeSelect: document.getElementById('yt-theme-select'),
    savePresetBtn: document.getElementById('yt-save-preset-btn'),
    exportPresetsBtn: document.getElementById('yt-export-presets-btn'),
    importPresetsInput: document.getElementById('yt-import-presets-input'),
    importPresetsBtn: document.getElementById('yt-import-presets-btn'),

    langPrefs: document.getElementById('yt-lang-prefs'),
    fontSize: document.getElementById('yt-font-size'),
    outputLang: document.getElementById('yt-output-lang'),
    customLang: document.getElementById('yt-custom-lang'),

    provider: document.getElementById('yt-provider'),
    baseUrl: document.getElementById('yt-base-url'),
    apiKey: document.getElementById('yt-api-key'),
    model: document.getElementById('yt-model'),
    anthropicVersion: document.getElementById('yt-anthropic-version'),
    concurrency: document.getElementById('yt-concurrency'),
    asciiOnly: document.getElementById('yt-ascii-only'),
    blocklist: document.getElementById('yt-blocklist'),
    singleCall: document.getElementById('yt-single-call'),
    maxTokens: document.getElementById('yt-max-tokens'),
    temperature: document.getElementById('yt-temperature'),
    styleText: document.getElementById('yt-style-text'),

    stylePreset: document.getElementById('yt-style-preset'),
    promptTemplate: document.getElementById('yt-prompt-template'),
    restyleBtn: document.getElementById('yt-restyle-btn'),
    stopBtn: document.getElementById('yt-stop-btn'),
    progress: document.getElementById('yt-progress'),

    ttsEnabled: document.getElementById('yt-tts-enabled'),
    ttsProvider: document.getElementById('yt-tts-provider'),
    ttsVoice: document.getElementById('yt-tts-voice'),
    ttsFormat: document.getElementById('yt-tts-format'),
    azureRegion: document.getElementById('yt-azure-region'),
    azureVoicesBtn: document.getElementById('yt-azure-voices-btn'),
    azureVoiceSelect: document.getElementById('yt-azure-voice-select'),
    browserVoiceSelect: document.getElementById('yt-browser-voice-select'),
    ttsRate: document.getElementById('yt-tts-rate'),
    rateValue: document.getElementById('yt-rate-value'),
    applyFontBtn: document.getElementById('yt-apply-font'),
    generateTtsBtn: document.getElementById('yt-generate-tts-btn'),
    stopTtsBtn: document.getElementById('yt-stop-tts-btn'),
    downloadTtsBtn: document.getElementById('yt-download-tts-btn'),
    ttsAudio: document.getElementById('yt-tts-audio'),
    fontSize: document.getElementById('yt-font-size'),

    exportTxtBtn: document.getElementById('yt-export-txt-btn'),
    exportSrtBtn: document.getElementById('yt-export-srt-btn'),
    exportVttBtn: document.getElementById('yt-export-vtt-btn'),
    exportJsonBtn: document.getElementById('yt-export-json-btn'),

    searchInput: document.getElementById('yt-search-input'),
    transcriptList: document.getElementById('yt-transcript-list'),
    autoTts: document.getElementById('yt-auto-tts'),
    autoTtsType: document.getElementById('yt-auto-tts-type'),
    furigana: document.getElementById('yt-furigana'),
    showBoth: document.getElementById('yt-show-both'),
    status: document.getElementById('yt-status')
  };

  // Default values
  const DEFAULT_PROMPT = `Restyle this closed-caption sentence fragment in {{style}} style. Output language: {{outlang}}. This input is a partial sentence from on-screen captions. Keep the meaning intact but improve clarity and readability for captions. Keep sentence pacing etc. Just change verbiage and vibe. It will play alongside the youtube vid in CCs. Do not include timestamps, time ranges, or any numerals that are part of time markers; ignore them entirely. Do not add speaker names or extra content. If ASCII-only mode is enabled, use only standard ASCII characters (no accents, special punctuation, or Unicode symbols).

Context (previous fragments):
{{prevLines}}

Current fragment to restyle:
{{currentLine}}

Context (next fragments):
{{nextLines}}`;

  const DEFAULT_TTS_SETTINGS = {
    enabled: false,
    provider: 'openai',
    voice: 'alloy',
    format: 'mp3',
    azureRegion: 'eastus',
    rate: 1.0
  };

  const DEFAULT_FONT_SIZE = 13;

  // ASCII sanitization - Fixed character list
  const DEFAULT_BAD = [
    // Accented characters
    'à',
    'á',
    'â',
    'ã',
    'ä',
    'å',
    'æ',
    'ç',
    'è',
    'é',
    'ê',
    'ë',
    'ì',
    'í',
    'î',
    'ï',
    'ð',
    'ñ',
    'ò',
    'ó',
    'ô',
    'õ',
    'ö',
    'ø',
    'ù',
    'ú',
    'û',
    'ü',
    'ý',
    'þ',
    'ÿ',
    'À',
    'Á',
    'Â',
    'Ã',
    'Ä',
    'Å',
    'Æ',
    'Ç',
    'È',
    'É',
    'Ê',
    'Ë',
    'Ì',
    'Í',
    'Î',
    'Ï',
    'Ð',
    'Ñ',
    'Ò',
    'Ó',
    'Ô',
    'Õ',
    'Ö',
    'Ø',
    'Ù',
    'Ú',
    'Û',
    'Ü',
    'Ý',
    'Þ',
    // Punctuation and symbols
    '\u2013',
    '\u2014',
    '\u2018',
    '\u2019',
    '\u201C',
    '\u201D',
    '\u2026',
    '\u2022',
    '\u2122',
    '\u00A9',
    '\u00AE',
    '\u00A7',
    '\u00B6',
    '\u2020',
    '\u2021',
    '\u2030',
    '\u2039',
    '\u203A',
    '\u00AB',
    '\u00BB',
    '\u00A1',
    '\u00BF',
    '\u00A2',
    '\u00A3',
    '\u00A4',
    '\u00A5',
    '\u00A6',
    '\u00A8',
    '\u00AA',
    '\u00AC',
    '\u00AF',
    '\u00B0',
    '\u00B1',
    '\u00B2',
    '\u00B3',
    '\u00B4',
    '\u00B5',
    '\u00B7',
    '\u00B8',
    '\u00B9',
    '\u00BA',
    '\u00BC',
    '\u00BD',
    '\u00BE',
    '\u00D7',
    '\u00F7'
  ];

  function sanitizeAscii(text, blocklist = '') {
    if (!text) return text;

    const badChars = [...DEFAULT_BAD, ...blocklist.split('')];
    const replacements = {
      '\u2013': '-',
      '\u2014': '-',
      '\u2018': "'",
      '\u2019': "'",
      '\u201C': '"',
      '\u201D': '"',
      '\u2026': '...',
      '\u2022': '*',
      '\u2122': '(TM)',
      '\u00A9': '(C)',
      '\u00AE': '(R)',
      '\u00A7': 'Section',
      '\u00B6': 'Para',
      '\u2020': '+',
      '\u2021': '++',
      '\u2030': '%o',
      '\u2039': '<',
      '\u203A': '>',
      '\u00AB': '<<',
      '\u00BB': '>>',
      '\u00A1': '!',
      '\u00BF': '?',
      '\u00A2': 'c',
      '\u00A3': 'L',
      '\u00A4': '$',
      '\u00A5': 'Y',
      '\u00A6': '|',
      '\u00A8': '"',
      ª: 'a',
      '\u00AC': '-',
      '\u00AF': '-',
      '\u00B0': 'deg',
      '\u00B1': '+/-',
      '\u00B2': '2',
      '\u00B3': '3',
      '\u00B4': "'",
      µ: 'u',
      '\u00B7': '.',
      '\u00B8': ',',
      '\u00B9': '1',
      º: 'o',
      '\u00BC': '1/4',
      '\u00BD': '1/2',
      '\u00BE': '3/4',
      '\u00D7': 'x',
      '\u00F7': '/'
    };

    let result = text;
    badChars.forEach(char => {
      if (char && char.trim()) {
        const replacement = replacements[char] || '';
        result = result.replaceAll(char, replacement);
      }
    });

    // Clean up extra spaces
    return result.replace(/\s+/g, ' ').trim();
  }

  // Initialize default values
  elements.promptTemplate.value = DEFAULT_PROMPT;
  Object.assign(lastPrefs, DEFAULT_TTS_SETTINGS);
  // Apply initial font size from the control value so the UI reflects defaults
  applyFontSize(parseInt(document.getElementById('yt-font-size')?.value, 10) || DEFAULT_FONT_SIZE);

  // Load preferences and apply theme
  async function loadPrefs() {
    const start = Date.now();
    try {
      const response = await sendMessage('GET_PREFS', {
        keys: ['ytro_prefs', 'ytro_presets', 'ytro_debug', 'ytro_theme', 'ytro_position']
      });

      if (response.success) {
    const { ytro_prefs, ytro_presets, ytro_debug, ytro_theme, ytro_position } = response.data;

        // Apply debug setting
        if (ytro_debug !== undefined) {
          UI_DEBUG = ytro_debug;
          elements.debugToggle.checked = UI_DEBUG;
          log(`Debug mode loaded: ${UI_DEBUG}`);
        }

        // Apply theme
        if (ytro_theme) {
          applyTheme(ytro_theme);
          elements.themeSelect.value = ytro_theme;
        }

        // Apply position
        if (ytro_position) {
          overlay.style.left = `${ytro_position.left}px`;
          overlay.style.top = `${ytro_position.top}px`;
        }

        // Load preferences
        if (ytro_prefs) {
          setIf(elements.videoId, ytro_prefs.videoId);
    setIf(elements.langPrefs, ytro_prefs.langPrefs);
    setIf(elements.fontSize, ytro_prefs.fontSize);
          setIf(elements.outputLang, ytro_prefs.outputLang);
          setIf(elements.customLang, ytro_prefs.customLang);
          setIf(elements.provider, ytro_prefs.provider);
          setIf(elements.baseUrl, ytro_prefs.baseUrl);
          setIf(elements.model, ytro_prefs.model);
          setIf(elements.anthropicVersion, ytro_prefs.anthropicVersion);
          setIf(elements.concurrency, ytro_prefs.concurrency);
          setIf(elements.stylePreset, ytro_prefs.stylePreset);
          setIf(elements.promptTemplate, ytro_prefs.promptTemplate);
          setIf(elements.asciiOnly, ytro_prefs.asciiOnly, 'checked');
          setIf(elements.blocklist, ytro_prefs.blocklist);
          setIf(elements.singleCall, ytro_prefs.singleCall, 'checked');
          setIf(elements.maxTokens, ytro_prefs.maxTokens);
          setIf(elements.temperature, ytro_prefs.temperature);
          setIf(elements.styleText, ytro_prefs.styleText);

          // Auto-TTS settings
          setIf(elements.autoTts, ytro_prefs.autoTts, 'checked');
          setIf(elements.autoTtsType, ytro_prefs.autoTtsType);
          autoTtsEnabled = elements.autoTts?.checked || false;

          // Furigana settings
          setIf(elements.furigana, ytro_prefs.furigana, 'checked');
    setIf(elements.showBoth, ytro_prefs.showBoth, 'checked');

          // TTS settings
          setIf(elements.ttsEnabled, ytro_prefs.ttsEnabled, 'checked');
          setIf(elements.ttsProvider, ytro_prefs.ttsProvider);
          setIf(elements.ttsVoice, ytro_prefs.ttsVoice);
          setIf(elements.ttsFormat, ytro_prefs.ttsFormat);
          setIf(elements.azureRegion, ytro_prefs.azureRegion);
          setIf(elements.ttsRate, ytro_prefs.ttsRate);

          Object.assign(lastPrefs, ytro_prefs);
        syncProviderUI();
        applyFontSize(ytro_prefs.fontSize);
          syncTtsUI();
        }

        // Load presets (global object for preset management)
        window.ytPresets = ytro_presets || {};
        rebuildPresetOptions();

        log(`Preferences loaded in ${dur(start)}`);
      }
    } catch (error) {
      logError('Failed to load preferences:', error);
    }
  }

  function setIf(element, value, prop = 'value') {
    if (element && value !== undefined && value !== null) {
      if (prop === 'checked') {
        element.checked = Boolean(value);
      } else {
        element[prop] = String(value);
      }
    }
  }

  

  // Save preferences
  async function savePrefs() {
    const prefs = {
      videoId: elements.videoId.value,
      langPrefs: elements.langPrefs.value,
      outputLang: elements.outputLang.value,
      customLang: elements.customLang.value,
    provider: elements.provider.value,
    baseUrl: elements.baseUrl.value,
    model: elements.model.value,
    anthropicVersion:
      elements.provider.value === 'anthropic' ? elements.anthropicVersion.value.trim() : '',
    concurrency: parseInt(elements.concurrency.value) || 3,
    stylePreset: elements.stylePreset.value,
    fontSize: parseInt(elements.fontSize.value, 10) || DEFAULT_FONT_SIZE,
      promptTemplate: elements.promptTemplate.value,
      asciiOnly: elements.asciiOnly.checked,
      blocklist: elements.blocklist.value,
      singleCall: elements.singleCall.checked,
      maxTokens: parseInt(elements.maxTokens?.value, 10) || 1000,
      temperature: parseFloat(elements.temperature?.value) || 0.7,
      styleText: elements.styleText?.value || '',

      // Auto-TTS settings
      autoTts: elements.autoTts?.checked || false,
      autoTtsType: elements.autoTtsType?.value || 'original',

      // Furigana settings
      furigana: elements.furigana?.checked || false,
    showBoth: elements.showBoth?.checked || false,

      // TTS settings
      ttsEnabled: elements.ttsEnabled.checked,
      ttsProvider: elements.ttsProvider.value,
      ttsVoice: elements.ttsVoice.value,
      ttsFormat: elements.ttsFormat.value,
      azureRegion: elements.azureRegion.value,
      ttsRate: parseFloat(elements.ttsRate.value) || 1.0
    };

    try {
      await sendMessage('SET_PREFS', {
        prefs: {
          ytro_prefs: prefs,
          ytro_debug: UI_DEBUG
        }
      });
      Object.assign(lastPrefs, prefs);
      log('Preferences saved');
    } catch (error) {
      logError('Failed to save preferences:', error);
    }
  }

  // Theme management
  function applyTheme(theme) {
    overlay.className = overlay.className.replace(/theme-\w+/g, '');
    overlay.classList.add(theme);

    // Save theme preference
    sendMessage('SET_PREFS', {
      prefs: { ytro_theme: theme }
    }).catch(logError);
  }

  function applyFontSize(pxValue) {
    const size = parseInt(pxValue, 10);
    const resolved = Number.isFinite(size) && size > 0 ? size : DEFAULT_FONT_SIZE;
    overlay.style.setProperty('--yt-font-size', `${resolved}px`);
    // Also scale the on-video subtitle overlay
    document.body.style.setProperty('--ts-subtitle-font-size', `${Math.round(resolved * 1.85)}px`);
  }

  // Preset management
  function rebuildPresetOptions() {
    // This would rebuild preset dropdown if we had one
    // For now, presets are managed via save/export/import buttons
  }

  function snapshotPreset() {
    return {
      provider: elements.provider.value,
      baseUrl: elements.baseUrl.value,
      model: elements.model.value,
      anthropicVersion:
        elements.provider.value === 'anthropic' ? elements.anthropicVersion.value.trim() : '',
      concurrency: parseInt(elements.concurrency.value) || 3,
      stylePreset: elements.stylePreset.value,
      promptTemplate: elements.promptTemplate.value,
      asciiOnly: elements.asciiOnly.checked,
      blocklist: elements.blocklist.value,
      langPrefs: elements.langPrefs.value,
      outputLang: elements.outputLang.value,
      customLang: elements.customLang.value,
      ttsEnabled: elements.ttsEnabled.checked,
      ttsProvider: elements.ttsProvider.value,
      ttsVoice: elements.ttsVoice.value,
      ttsFormat: elements.ttsFormat.value,
      azureRegion: elements.azureRegion.value,
      ttsRate: parseFloat(elements.ttsRate.value) || 1.0,
      singleCall: elements.singleCall.checked,
      maxTokens: parseInt(elements.maxTokens?.value, 10) || 1000,
      temperature: parseFloat(elements.temperature?.value) || 0.7,
      styleText: elements.styleText?.value || ''
    };
  }

  function setStatus(msg, isError = false) {
    elements.status.textContent = msg;
    elements.status.className = `yt-status ${isError ? 'yt-error' : ''}`;
    log('Status:', msg);
  }

  function setError(msg) {
    setStatus(msg, true);
    logError(msg);
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
  }



  // Parsing functions
  function ensureSubtitleOverlay() {
    if (!subtitleOverlayEl) {
      subtitleOverlayEl = document.createElement('div');
      subtitleOverlayEl.id = 'ts-video-subtitles';
    }

    if (!subtitleOverlayEl.isConnected) {
      const player =
        document.querySelector('.html5-video-player') || document.querySelector('#movie_player');
      if (!player) {
        return null;
      }
      const computed = window.getComputedStyle(player);
      if (computed.position === 'static') {
        player.style.position = 'relative';
      }
      player.appendChild(subtitleOverlayEl);
    }
    return subtitleOverlayEl;
  }

  function updateSubtitleText(segment) {
    const overlay = ensureSubtitleOverlay();
    if (!overlay) return;

    if (segment && (segment.restyled || segment.text)) {
      const originalText = segment.text || '';
      const restyledText = segment.restyled || '';
      
      let textToShow = '';
      
      if (elements.showBoth?.checked && originalText && restyledText) {
        // Show both original and restyled text
        const displayOriginal = elements.furigana?.checked ? generateFurigana(originalText) : originalText;
        const displayRestyled = elements.furigana?.checked ? generateFurigana(restyledText) : restyledText;
        
        textToShow = `<div class="subtitle-original">${displayOriginal}</div><div class="subtitle-restyled">${displayRestyled}</div>`;
        overlay.innerHTML = textToShow;
      } else {
        // Show only one text (prefer restyled if available)
        textToShow = restyledText || originalText;
        
        if (elements.furigana?.checked) {
          overlay.innerHTML = generateFurigana(textToShow);
        } else {
          overlay.textContent = textToShow;
        }
      }
      
      overlay.style.display = textToShow ? 'block' : 'none';
    } else {
      overlay.textContent = '';
      overlay.style.display = 'none';
    }
  }

  function getVideoElement() {
    return document.querySelector('video');
  }

  function ensureVideoListeners() {
    const video = getVideoElement();
    if (!video || videoListenerAttached) return;
    video.addEventListener('timeupdate', () => {
      updateActiveSegment(video.currentTime || 0).catch(error => {
        logError('Failed to update active segment:', error);
      });
    });
    video.addEventListener('emptied', () => {
      resetSubtitleState();
    });
    videoListenerAttached = true;
  }

  function resetSubtitleState() {
    activeSegmentIndex = -1;
    lastAutoTtsSegment = -1; // Reset auto-TTS tracking
    updateSubtitleText(null);
    applyActiveHighlight(false);
  }

  function findSegmentIndex(time) {
    if (!Array.isArray(transcriptData) || !transcriptData.length) return -1;
    for (let i = 0; i < transcriptData.length; i += 1) {
      const segment = transcriptData[i];
      const start = typeof segment.start === 'number' ? segment.start : 0;
      const nextStart =
        typeof transcriptData[i + 1]?.start === 'number'
          ? transcriptData[i + 1].start
          : Number.POSITIVE_INFINITY;
      const end = typeof segment.end === 'number' ? segment.end : Math.min(nextStart, start + 6);
      if (time + 0.05 >= start && time <= end + 0.05) {
        return i;
      }
    }
    return time >= (transcriptData[transcriptData.length - 1]?.start || 0)
      ? transcriptData.length - 1
      : -1;
  }

  async function updateActiveSegment(currentTime) {
    if (!transcriptData.length) {
      resetSubtitleState();
      return;
    }

    const index = findSegmentIndex(currentTime);
    if (index !== activeSegmentIndex) {
      activeSegmentIndex = index;
      applyActiveHighlight(true); // Enable auto-scroll
      if (index >= 0) {
        updateSubtitleText(transcriptData[index]);

        // Auto-play TTS if enabled and this is a new segment
        if (autoTtsEnabled && index !== lastAutoTtsSegment && index < transcriptData.length) {
          lastAutoTtsSegment = index;
          const textType = elements.autoTtsType?.value || 'original';
          const video = getVideoElement();
          let pausedForTts = false;

          if (video && !video.paused && !video.ended) {
            try {
              video.pause();
              pausedForTts = true;
            } catch (error) {
              logError('Failed to pause video for auto TTS:', error);
            }
          }

          try {
            await playSegmentTTS(index, textType);
          } catch (error) {
            logError('Auto TTS playback failed:', error);
          } finally {
            if (video && pausedForTts) {
              video.play().catch(() => {
                /* ignore autoplay block */
              });
            }
          }
        }
      } else {
        updateSubtitleText(null);
      }
    }
  }

  function applyActiveHighlight(scrollIntoView = false) {
    if (!elements.transcriptList) return;
    const items = elements.transcriptList.querySelectorAll('.yt-transcript-item');
    items.forEach(item => {
      const idx = Number(item.dataset.index);
      const isActive = idx === activeSegmentIndex && idx !== -1;
      item.classList.toggle('active', isActive);
      if (isActive && scrollIntoView) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  function seekTo(seconds) {
    const video = getVideoElement();
    if (video) {
      video.currentTime = Math.max(0, seconds || 0);
      if (video.paused) {
        video.play().catch(() => {
          /* ignore autoplay block */
        });
      }
      return;
    }

    if (window.ytplayer?.player?.seekTo) {
      window.ytplayer.player.seekTo(seconds || 0, true);
    }
  }

  function renderList(segments = transcriptData, searchTerm = '') {
    if (!Array.isArray(segments)) return;

    const filtered = searchTerm
      ? segments.filter(s => s.text?.toLowerCase().includes(searchTerm.toLowerCase()))
      : segments;

    elements.transcriptList.innerHTML = filtered
      .map((segment, i) => {
        const originalIndex = segments.indexOf(segment);
        const timeStr = segment.start ? formatTime(segment.start) : '';
        const restyled = segment.restyled || '';

        // Apply furigana if enabled
        const originalText = elements.furigana?.checked ? generateFurigana(segment.text) : escapeHtml(segment.text);
        const restyledText = restyled ? (elements.furigana?.checked ? generateFurigana(restyled) : escapeHtml(restyled)) : '';

        return `
      <div class="yt-transcript-item" data-index="${originalIndex}" data-start="${segment.start ?? 0}">
        <div class="yt-transcript-time">${timeStr}</div>
        <div class="yt-transcript-text">
          <div class="yt-original">
            <span class="yt-speaker-icon" title="Play original text" data-segment-index="${originalIndex}" data-text-type="original">🔊</span>
            ${originalText}
          </div>
          ${restyled ? `<div class="yt-restyled">
            <span class="yt-speaker-icon" title="Play restyled text" data-segment-index="${originalIndex}" data-text-type="restyled">🔊</span>
            ${restyledText}
          </div>` : ''}
        </div>
      </div>
    `;
      })
      .join('');
    
    // Add event listeners for speaker icons
    elements.transcriptList.querySelectorAll('.yt-speaker-icon').forEach(icon => {
      icon.addEventListener('click', () => {
        const segmentIndex = parseInt(icon.dataset.segmentIndex, 10);
        const textType = icon.dataset.textType;
        playSegmentTTS(segmentIndex, textType);
      });
    });
    
    applyActiveHighlight();
    applyActiveHighlight(false);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Simple furigana generation for common kanji
  function generateFurigana(text) {
    if (!text || !/[一-龯]/.test(text)) {
      return text; // No kanji found, return original text
    }

    // Comprehensive kanji readings mapping
    const kanjiReadings = {
      // Basic pronouns and particles
      '私': 'わたし', '僕': 'ぼく', '君': 'きみ', 'あなた': 'あなた', '彼': 'かれ', '彼女': 'かのじょ',
      '私たち': 'わたしたち', '皆': 'みんな', '自分': 'じぶん', '人': 'ひと', '方': 'かた',
      
      // Time and dates
      '今日': 'きょう', '明日': 'あした', '昨日': 'きのう', '今年': 'ことし', '来年': 'らいねん', '去年': 'きょねん',
      '今月': 'こんげつ', '来月': 'らいげつ', '先月': 'せんげつ', '今週': 'こんしゅう', '来週': 'らいしゅう', '先週': 'せんしゅう',
      '時間': 'じかん', '時': 'とき', '分': 'ふん', '秒': 'びょう', '年': 'ねん', '月': 'つき', '日': 'ひ', '週': 'しゅう',
      '朝': 'あさ', '昼': 'ひる', '夜': 'よる', '夕方': 'ゆうがた', '夜中': 'よなか',
      
      // Numbers and quantities
      '一': 'いち', '二': 'に', '三': 'さん', '四': 'よん', '五': 'ご', '六': 'ろく', '七': 'なな', '八': 'はち', '九': 'きゅう', '十': 'じゅう',
      '百': 'ひゃく', '千': 'せん', '万': 'まん', '億': 'おく', '兆': 'ちょう',
      '何': 'なに', '誰': 'だれ', 'どこ': 'どこ', 'なぜ': 'なぜ', 'どう': 'どう', '何時': 'なんじ', 'いくつ': 'いくつ',
      '多': 'おお', '少': 'すく', '全部': 'ぜんぶ', '半分': 'はんぶん', '少し': 'すこし', 'たくさん': 'たくさん',
      
      // Directions and positions
      '上': 'うえ', '下': 'した', '中': 'なか', '外': 'そと', '内': 'うち', '前': 'まえ', '後': 'うしろ', '右': 'みぎ', '左': 'ひだり',
      '東': 'ひがし', '西': 'にし', '南': 'みなみ', '北': 'きた', '中央': 'ちゅうおう', '周り': 'まわり',
      
      // Basic adjectives
      '大': 'おお', '小': 'ちい', '新': 'あたら', '古': 'ふる', '高': 'たか', '低': 'ひく', '長': 'なが', '短': 'みじか',
      '早': 'はや', '遅': 'おそ', '良': 'よ', '悪': 'わる', '美': 'うつく', '醜': 'みにく', '強': 'つよ', '弱': 'よわ',
      '重': 'おも', '軽': 'かる', '熱': 'あつ', '冷': 'つめ', '明': 'あか', '暗': 'くら', '静': 'しず', '騒': 'さわ',
      '楽': 'たの', '苦': 'くる', '安': 'やす', '危': 'あぶ', '正': 'ただ', '間': 'あいだ', '忙': 'いそが', '暇': 'ひま',
      
      // Common nouns - people and relationships
      '家族': 'かぞく', '父': 'ちち', '母': 'はは', '兄': 'あに', '姉': 'あね', '弟': 'おとうと', '妹': 'いもうと',
      '息子': 'むすこ', '娘': 'むすめ', '夫': 'おっと', '妻': 'つま', '友達': 'ともだち', '恋人': 'こいびと',
      '先生': 'せんせい', '生徒': 'せいと', '学生': 'がくせい', '医者': 'いしゃ', '看護師': 'かんごし',
      '会社員': 'かいしゃいん', '店員': 'てんいん', '警察官': 'けいさつかん', '消防士': 'しょうぼうし',
      
      // Body parts
      '体': 'からだ', '頭': 'あたま', '顔': 'かお', '目': 'め', '耳': 'みみ', '鼻': 'はな', '口': 'くち', '歯': 'は',
      '首': 'くび', '肩': 'かた', '手': 'て', '指': 'ゆび', '足': 'あし', '背中': 'せなか', '胸': 'むね', '心': 'こころ',
      
      // Common objects
      '物': 'もの', '事': 'こと', '所': 'ところ', '場所': 'ばしょ', '家': 'いえ', '部屋': 'へや', '窓': 'まど', 'ドア': 'ドア',
      '椅子': 'いす', '机': 'つくえ', 'ベッド': 'ベッド', '本': 'ほん', '紙': 'かみ', '鉛筆': 'えんぴつ', 'ペン': 'ペン',
      '電話': 'でんわ', 'コンピューター': 'コンピューター', 'テレビ': 'テレビ', 'ラジオ': 'ラジオ', 'カメラ': 'カメラ',
      '車': 'くるま', '電車': 'でんしゃ', 'バス': 'バス', '飛行機': 'ひこうき', '船': 'ふね', '自転車': 'じてんしゃ',
      
      // Places and locations
      '学校': 'がっこう', '会社': 'かいしゃ', '病院': 'びょういん', '銀行': 'ぎんこう', '郵便局': 'ゆうびんきょく',
      '駅': 'えき', '空港': 'くうこう', '港': 'みなと', '公園': 'こうえん', '図書館': 'としょかん', '美術館': 'びじゅつかん',
      '店': 'みせ', 'レストラン': 'レストラン', 'ホテル': 'ホテル', '道': 'みち', '橋': 'はし', '建物': 'たてもの',
      
      // Nature and weather
      '空': 'そら', '山': 'やま', '川': 'かわ', '海': 'うみ', '湖': 'みずうみ', '森': 'もり', '木': 'き', '花': 'はな',
      '草': 'くさ', '太陽': 'たいよう', '月': 'つき', '星': 'ほし', '雲': 'くも', '風': 'かぜ', '雨': 'あめ', '雪': 'ゆき',
      '火': 'ひ', '水': 'みず', '土': 'つち', '石': 'いし', '砂': 'すな',
      
      // Animals
      '動物': 'どうぶつ', '犬': 'いぬ', '猫': 'ねこ', '鳥': 'とり', '魚': 'さかな', '馬': 'うま', '牛': 'うし', '豚': 'ぶた',
      '羊': 'ひつじ', '猿': 'さる', '熊': 'くま', '象': 'ぞう', 'ライオン': 'ライオン', '虎': 'とら',
      
      // Food and drinks
      '食べ物': 'たべもの', '飲み物': 'のみもの', '食事': 'しょくじ', '朝食': 'ちょうしょく', '昼食': 'ちゅうしょく', '夕食': 'ゆうしょく',
      '米': 'こめ', 'パン': 'パン', '肉': 'にく', '魚': 'さかな', '野菜': 'やさい', '果物': 'くだもの', '卵': 'たまご',
      '牛乳': 'ぎゅうにゅう', '水': 'みず', 'お茶': 'おちゃ', 'コーヒー': 'コーヒー', 'ビール': 'ビール', '酒': 'さけ',
      
      // Clothing
      '服': 'ふく', 'シャツ': 'シャツ', 'ズボン': 'ズボン', 'スカート': 'スカート', 'ドレス': 'ドレス', '靴': 'くつ',
      '帽子': 'ぼうし', '眼鏡': 'めがね', '時計': 'とけい', '鞄': 'かばん',
      
      // Colors
      '色': 'いろ', '赤': 'あか', '青': 'あお', '緑': 'みどり', '黄': 'き', '黒': 'くろ', '白': 'しろ', '茶': 'ちゃ',
      '紫': 'むらさき', 'ピンク': 'ピンク', 'オレンジ': 'オレンジ', 'グレー': 'グレー',
      
      // Common verbs
      '言': 'い', '話': 'はなし', '聞': 'き', '見': 'み', '読': 'よ', '書': 'か', '学': 'まな', '教': 'おし',
      '行': 'い', '来': 'き', '帰': 'かえ', '出': 'で', '入': 'はい', '立': 'た', '座': 'すわ', '歩': 'ある',
      '走': 'はし', '飛': 'と', '泳': 'およ', '買': 'か', '売': 'う', '作': 'つく', '使': 'つか',
      '食': 'た', '飲': 'の', '寝': 'ね', '起': 'お', '働': 'はたら', '遊': 'あそ', '休': 'やす',
      '習': 'なら', '覚': 'おぼ', '忘': 'わす', '知': 'し', '分': 'わ', '考': 'かんが', '思': 'おも',
      '感': 'かん', '愛': 'あい', '好': 'す', '嫌': 'きら', '嬉': 'うれ', '悲': 'かな', '怒': 'おこ',
      '驚': 'おどろ', '怖': 'こわ', '心配': 'しんぱい', '安心': 'あんしん', '困': 'こま',
      
      // Academic and professional terms
      '批判': 'ひはん', '反対': 'はんたい', '支持': 'しじ', '賛成': 'さんせい', '意見': 'いけん', '考え': 'かんがえ',
      '問題': 'もんだい', '解決': 'かいけつ', '方法': 'ほうほう', '計画': 'けいかく', '目標': 'もくひょう',
      '結果': 'けっか', '原因': 'げんいん', '理由': 'りゆう', '目的': 'もくてき', '意味': 'いみ',
      '内容': 'ないよう', '情報': 'じょうほう', 'データ': 'データ', '研究': 'けんきゅう', '調査': 'ちょうさ',
      '報告': 'ほうこく', '発表': 'はっぴょう', '説明': 'せつめい', '質問': 'しつもん', '回答': 'かいとう',
      
      // Politics and society
      '政治': 'せいじ', '政府': 'せいふ', '大統領': 'だいとうりょう', '首相': 'しゅしょう', '大臣': 'だいじん',
      '国会': 'こっかい', '選挙': 'せんきょ', '投票': 'とうひょう', '法律': 'ほうりつ', '規則': 'きそく',
      '社会': 'しゃかい', '経済': 'けいざい', '文化': 'ぶんか', '歴史': 'れきし', '伝統': 'でんとう',
      '国際': 'こくさい', '外交': 'がいこう', '平和': 'へいわ', '戦争': 'せんそう', '環境': 'かんきょう',
      
      // Technology and modern life
      '技術': 'ぎじゅつ', '科学': 'かがく', '発明': 'はつめい', '発見': 'はっけん', '開発': 'かいはつ',
      'インターネット': 'インターネット', 'ウェブサイト': 'ウェブサイト', 'アプリ': 'アプリ', 'ソフトウェア': 'ソフトウェア',
      'スマートフォン': 'スマートフォン', 'タブレット': 'タブレット', 'メール': 'メール', 'メッセージ': 'メッセージ',
      
      // Health and medical
      '健康': 'けんこう', '病気': 'びょうき', '治療': 'ちりょう', '手術': 'しゅじゅつ', '薬': 'くすり',
      '症状': 'しょうじょう', '診断': 'しんだん', '検査': 'けんさ', '予防': 'よぼう', '回復': 'かいふく',
      
      // Additional kanji from user's transcript
      '俺': 'おれ', '凄': 'すご', '判': 'はん', '喜': 'よろこ', '基': 'もと', '変': 'かわ', '奴': 'やつ',
      '嫌': 'きら', '対': 'たい', '導': 'みちび', '届': 'とど', '常': 'つね', '強': 'つよ', '当': 'とう',
      '徒': 'と', '得': 'え', '憎': 'にく', '戦': 'たたか', '批': 'ひ', '持': 'も', '敵': 'てき',
      '新': 'あたら', '晴': 'はれ', '最': 'さい', '望': 'のぞ', '本': 'ほん', '核': 'かく', '構': 'こう',
      '正': 'ただ', '死': 'し', '殺': 'ころ', '派': 'は', '渡': 'わた', '然': 'ぜん', '理': 'り',
      '的': 'てき', '目': 'め', '直': 'ちょく', '瞬': 'しゅん', '知': 'し', '硬': 'こう', '神': 'しん',
      '精': 'せい', '素': 'す', '結': 'けつ', '群': 'ぐん', '者': 'しゃ', '見': 'み', '解': 'かい',
      '言': 'げん', '話': 'はな', '説': 'せつ', '誰': 'だれ', '識': 'しき', '貴': 'き', '返': 'へん',
      '送': 'おく', '逆': 'ぎゃく', '通': 'つう', '違': 'ちが', '部': 'ぶ', '間': 'あいだ', '黙': 'だま',
      
      // Additional kanji from second transcript
      '偉': 'い', '姿': 'すがた', '合': 'あ', '彼': 'かれ', '衆': 'しゅう', '際': 'きわ',
      
      // Additional kanji from third transcript
      '伝': 'でん', '光': 'ひかり', '善': 'ぜん', '喋': 'しゃべ', '嬉': 'うれ', '師': 'し',
      '景': 'けい', '暗': 'あん', '激': 'げき', '耐': 'た', '聞': 'き', '道': 'みち',
      '郎': 'ろう', '野': 'の', '驚': 'おどろ', '悪': 'わる',
      
      // Compound words from the transcript
      '全部': 'ぜんぶ', '基本': 'きほん', '全然': 'ぜんぜん', '同じ': 'おなじ', '反対': 'はんたい',
      '意見': 'いけん', '批判': 'ひはん', '学生': 'がくせい', '強硬': 'きょうこう', '群がる': 'むらがる',
      '喜ばせる': 'よろこばせる', '説得': 'せっとく', '理解': 'りかい', '正しい': 'ただしい',
      '常識': 'じょうしき', '基づく': 'もとづく', '戦う': 'たたかう', '愛する': 'あいする',
      '届く': 'とどく', '素晴らしい': 'すばらしい', '生き方': 'いきかた', '導く': 'みちびく',
      'プライベート': 'プライベート', '瞬間': 'しゅんかん', '本当': 'ほんとう', '全部': 'ぜんぶ',
      '高貴': 'こうき', '精神': 'せいしん', '使徒': 'しと', '目的': 'もくてき', '敵': 'てき',
      '憎む': 'にくむ', '最高': 'さいこう', '望む': 'のぞむ', '意見': 'いけん', '違う': 'ちがう',
      '大嫌い': 'だいきらい', '説得': 'せっとく', '最新': 'さいしん', 'ニュース': 'ニュース',
      'トップ': 'トップ', 'ストーリー': 'ストーリー', 'アプリ': 'アプリ', 'チェック': 'チェック',
      'チャンネル': 'チャンネル', 'ライブ': 'ライブ',
      
      // Additional compound words from second transcript
      '人間': 'にんげん', '信じる': 'しんじる', '本当': 'ほんとう', '群衆': 'ぐんしゅう',
      'めちゃくちゃ': 'めちゃくちゃ', '間違いなく': 'まちがいなく', '間際': 'まぎわ',
      '偉大': 'いだい', '合う': 'あう', '話しかける': 'はなしかける', 'グループ': 'グループ',
      'または': 'または', 'アプリ': 'アプリ',
      
      // Additional compound words from third transcript
      '暗殺': 'あんさつ', '激しい': 'はげしい', '光景': 'こうけい', '伝道師': 'でんどうし',
      '最善': 'さいぜん', '喋る': 'しゃべる', '嬉しい': 'うれしい', '悪い': 'わるい',
      '耐える': 'たえる', '驚く': 'おどろく', '野郎': 'やろう', '師匠': 'ししょう',
      '光': 'ひかり', '景色': 'けしき', '暗い': 'くらい', '激怒': 'げきど',
      '忍耐': 'にんたい', '聞く': 'きく', '道路': 'どうろ', '驚愕': 'きょうがく',
      '悪意': 'あくい', '善悪': 'ぜんあく', '伝える': 'つたえる', '伝統': 'でんとう',
      '光る': 'ひかる', '光線': 'こうせん', '善良': 'ぜんりょう', '善行': 'ぜんこう',
      '喋り': 'しゃべり', '嬉しさ': 'うれしさ', '師事': 'しじ', '教師': 'きょうし',
      '風景': 'ふうけい', '暗黒': 'あんこく', '激化': 'げきか', '激戦': 'げきせん',
      '耐性': 'たいせい', '聞こえる': 'きこえる', '聞き取る': 'ききとる', '道筋': 'みちすじ',
      '野心的': 'やしんてき', '野球': 'やきゅう', '驚異': 'きょうい', '驚嘆': 'きょうたん',
      '悪魔': 'あくま', '悪化': 'あっか', '悪夢': 'あくむ', '悪影響': 'あくえいきょう',
      
      // Additional common kanji for comprehensive coverage
      '会': 'かい', '場': 'ば', '所': 'しょ', '地': 'ち', '市': 'し', '県': 'けん', '州': 'しゅう',
      '区': 'く', '町': 'まち', '村': 'むら', '国': 'くに', '都': 'と', '府': 'ふ', '県': 'けん',
      '街': 'まち', '路': 'ろ', '道': 'みち', '橋': 'はし', '駅': 'えき', '港': 'みなと', '空港': 'くうこう',
      '学校': 'がっこう', '大学': 'だいがく', '高校': 'こうこう', '中学': 'ちゅうがく', '小学校': 'しょうがっこう',
      '病院': 'びょういん', '診療所': 'しんりょうしょ', '薬局': 'やっきょく', '銀行': 'ぎんこう',
      '郵便局': 'ゆうびんきょく', '役所': 'やくしょ', '警察署': 'けいさつしょ', '消防署': 'しょうぼうしょ',
      '図書館': 'としょかん', '博物館': 'はくぶつかん', '美術館': 'びじゅつかん', '映画館': 'えいがかん',
      '劇場': 'げきじょう', 'コンサート': 'コンサート', 'ホール': 'ホール', 'スタジアム': 'スタジアム',
      '公園': 'こうえん', '遊園地': 'ゆうえんち', '動物園': 'どうぶつえん', '水族館': 'すいぞくかん',
      '店': 'みせ', '商店': 'しょうてん', 'デパート': 'デパート', 'スーパー': 'スーパー',
      'コンビニ': 'コンビニ', 'レストラン': 'レストラン', 'カフェ': 'カフェ', 'バー': 'バー',
      'ホテル': 'ホテル', '旅館': 'りょかん', '民宿': 'みんしゅく', 'アパート': 'アパート',
      'マンション': 'マンション', '寮': 'りょう', '宿舎': 'しゅくしゃ',
      
      // Transportation
      '電車': 'でんしゃ', '地下鉄': 'ちかてつ', 'バス': 'バス', 'タクシー': 'タクシー',
      '自転車': 'じてんしゃ', 'バイク': 'バイク', '車': 'くるま', 'トラック': 'トラック',
      '飛行機': 'ひこうき', 'ヘリコプター': 'ヘリコプター', '船': 'ふね', 'ボート': 'ボート',
      'フェリー': 'フェリー', 'クルーズ': 'クルーズ', '新幹線': 'しんかんせん',
      '特急': 'とっきゅう', '急行': 'きゅうこう', '普通': 'ふつう', '各駅': 'かくえき',
      
      // Technology and media
      'パソコン': 'パソコン', 'スマホ': 'スマホ', 'タブレット': 'タブレット', 'ゲーム': 'ゲーム',
      'ソフト': 'ソフト', 'アプリ': 'アプリ', 'ウェブ': 'ウェブ', 'サイト': 'サイト',
      'ブログ': 'ブログ', 'SNS': 'SNS', 'ツイッター': 'ツイッター', 'フェイスブック': 'フェイスブック',
      'インスタ': 'インスタ', 'ユーチューブ': 'ユーチューブ', 'ネット': 'ネット',
      'メール': 'メール', 'チャット': 'チャット', 'ビデオ': 'ビデオ', '動画': 'どうが',
      '写真': 'しゃしん', '画像': 'がぞう', '音声': 'おんせい', '音楽': 'おんがく',
      '映画': 'えいが', 'ドラマ': 'ドラマ', 'アニメ': 'アニメ', '番組': 'ばんぐみ',
      'ニュース': 'ニュース', '天気': 'てんき', '予報': 'よほう', '放送': 'ほうそう',
      'ラジオ': 'ラジオ', 'テレビ': 'テレビ', '番組': 'ばんぐみ', 'チャンネル': 'チャンネル',
      
      // Business and work
      '仕事': 'しごと', '会社': 'かいしゃ', '企業': 'きぎょう', '工場': 'こうじょう',
      '事務所': 'じむしょ', 'オフィス': 'オフィス', '会議': 'かいぎ', '会議室': 'かいぎしつ',
      '会議': 'かいぎ', '打ち合わせ': 'うちあわせ', 'ミーティング': 'ミーティング',
      'プロジェクト': 'プロジェクト', '計画': 'けいかく', '予算': 'よさん', '費用': 'ひよう',
      '価格': 'かかく', '値段': 'ねだん', '料金': 'りょうきん', '税金': 'ぜいきん',
      '給料': 'きゅうりょう', '給与': 'きゅうよ', 'ボーナス': 'ボーナス', '年金': 'ねんきん',
      '保険': 'ほけん', '契約': 'けいやく', '契約書': 'けいやくしょ', '合意': 'ごうい',
      '交渉': 'こうしょう', '取引': 'とりひき', '商談': 'しょうだん', '営業': 'えいぎょう',
      '販売': 'はんばい', '購入': 'こうにゅう', '注文': 'ちゅうもん', '発注': 'はっちゅう',
      '配送': 'はいそう', '配達': 'はいたつ', '在庫': 'ざいこ', '商品': 'しょうひん',
      '製品': 'せいひん', 'サービス': 'サービス', '品質': 'ひんしつ', '管理': 'かんり',
      '監督': 'かんとく', '責任': 'せきにん', '義務': 'ぎむ', '権利': 'けんり',
      
      // Education and learning
      '教育': 'きょういく', '学習': 'がくしゅう', '勉強': 'べんきょう', '研究': 'けんきゅう',
      '調査': 'ちょうさ', '実験': 'じっけん', 'テスト': 'テスト', '試験': 'しけん',
      '問題': 'もんだい', '解答': 'かいとう', '答え': 'こたえ', '結果': 'けっか',
      '成績': 'せいせき', '評価': 'ひょうか', '評判': 'ひょうばん', '評価': 'ひょうか',
      '授業': 'じゅぎょう', '講義': 'こうぎ', '講座': 'こうざ', 'セミナー': 'セミナー',
      'ワークショップ': 'ワークショップ', '研修': 'けんしゅう', 'トレーニング': 'トレーニング',
      '練習': 'れんしゅう', '訓練': 'くんれん', '指導': 'しどう', 'アドバイス': 'アドバイス',
      '助言': 'じょげん', '提案': 'ていあん', '改善': 'かいぜん', '向上': 'こうじょう',
      '進歩': 'しんぽ', '発展': 'はってん', '成長': 'せいちょう', '発達': 'はったつ',
      
      // Health and medical
      '健康': 'けんこう', '病気': 'びょうき', '症状': 'しょうじょう', '治療': 'ちりょう',
      '手術': 'しゅじゅつ', '薬': 'くすり', '処方': 'しょほう', '診断': 'しんだん',
      '検査': 'けんさ', '診察': 'しんさつ', '診療': 'しんりょう', '入院': 'にゅういん',
      '退院': 'たいいん', '通院': 'つういん', '通院': 'つういん', '予防': 'よぼう',
      '回復': 'かいふく', '治癒': 'ちゆ', '完治': 'かんち', '改善': 'かいぜん',
      '医師': 'いし', '看護師': 'かんごし', '患者': 'かんじゃ', '家族': 'かぞく',
      '緊急': 'きんきゅう', '救急': 'きゅうきゅう', '応急': 'おうきゅう', '応急処置': 'おうきゅうしょち',
      
      // Food and dining
      '食べ物': 'たべもの', '飲み物': 'のみもの', '料理': 'りょうり', '食事': 'しょくじ',
      '朝食': 'ちょうしょく', '昼食': 'ちゅうしょく', '夕食': 'ゆうしょく', '弁当': 'べんとう',
      'お弁当': 'おべんとう', 'ランチ': 'ランチ', 'ディナー': 'ディナー', 'メニュー': 'メニュー',
      '注文': 'ちゅうもん', '料理人': 'りょうりにん', 'シェフ': 'シェフ', 'レシピ': 'レシピ',
      '材料': 'ざいりょう', '食材': 'しょくざい', '調味料': 'ちょうみりょう', '味': 'あじ',
      '甘い': 'あまい', '辛い': 'からい', '酸っぱい': 'すっぱい', '苦い': 'にがい',
      '塩辛い': 'しおからい', '美味しい': 'おいしい', '不味い': 'まずい', '熱い': 'あつい',
      '冷たい': 'つめたい', '温かい': 'あたたかい', '冷める': 'さめる', '冷やす': 'ひやす',
      
      // Weather and seasons
      '天気': 'てんき', '気候': 'きこう', '季節': 'きせつ', '春': 'はる', '夏': 'なつ',
      '秋': 'あき', '冬': 'ふゆ', '暖かい': 'あたたかい', '暑い': 'あつい', '涼しい': 'すずしい',
      '寒い': 'さむい', '曇り': 'くもり', '晴れ': 'はれ', '雨': 'あめ', '雪': 'ゆき',
      '風': 'かぜ', '台風': 'たいふう', '嵐': 'あらし', '雷': 'かみなり', '虹': 'にじ',
      '湿度': 'しつど', '気温': 'きおん', '温度': 'おんど', '気圧': 'きあつ', '予報': 'よほう',
      
      // Sports and recreation
      'スポーツ': 'スポーツ', '運動': 'うんどう', '練習': 'れんしゅう', '試合': 'しあい',
      '競技': 'きょうぎ', '大会': 'たいかい', '選手': 'せんしゅ', '監督': 'かんとく',
      'コーチ': 'コーチ', 'チーム': 'チーム', 'サッカー': 'サッカー', '野球': 'やきゅう',
      'テニス': 'テニス', 'バスケット': 'バスケット', 'バレーボール': 'バレーボール',
      '水泳': 'すいえい', 'マラソン': 'マラソン', 'ゴルフ': 'ゴルフ', 'スキー': 'スキー',
      'スノーボード': 'スノーボード', '登山': 'とざん', '釣り': 'つり', 'キャンプ': 'キャンプ',
      '旅行': 'りょこう', '観光': 'かんこう', '観光地': 'かんこうち', '名所': 'めいしょ',
      '名物': 'めいぶつ', 'お土産': 'おみやげ', '記念品': 'きねんひん', '写真': 'しゃしん',
      
      // Entertainment and culture
      '娯楽': 'ごらく', '楽しみ': 'たのしみ', '趣味': 'しゅみ', '興味': 'きょうみ',
      '関心': 'かんしん', '好み': 'このみ', '好き': 'すき', '嫌い': 'きらい',
      '愛好': 'あいこう', '熱中': 'ねっちゅう', '夢中': 'むちゅう', '集中': 'しゅうちゅう',
      '注意': 'ちゅうい', '関心': 'かんしん', '注目': 'ちゅうもく', '人気': 'にんき',
      '評判': 'ひょうばん', '名声': 'めいせい', '名誉': 'めいよ', '栄誉': 'えいよ',
      '賞': 'しょう', '表彰': 'ひょうしょう', '受賞': 'じゅしょう', '授賞': 'じゅしょう',
      '芸術': 'げいじゅつ', '美術': 'びじゅつ', '音楽': 'おんがく', '文学': 'ぶんがく',
      '詩': 'し', '小説': 'しょうせつ', '物語': 'ものがたり', '伝説': 'でんせつ',
      '歴史': 'れきし', '伝統': 'でんとう', '文化': 'ぶんか', '習慣': 'しゅうかん',
      '風習': 'ふうしゅう', '祭り': 'まつり', '祝日': 'しゅくじつ', '記念日': 'きねんび',
      '誕生日': 'たんじょうび', '結婚記念日': 'けっこんきねんび', '記念': 'きねん',
      
      // Emotions and feelings
      '感情': 'かんじょう', '気持ち': 'きもち', '心': 'こころ', '心配': 'しんぱい',
      '安心': 'あんしん', '不安': 'ふあん', '緊張': 'きんちょう', 'リラックス': 'リラックス',
      '興奮': 'こうふん', '感動': 'かんどう', '感激': 'かんげき', '驚き': 'おどろき',
      '驚く': 'おどろく', 'びっくり': 'びっくり', 'ショック': 'ショック', '衝撃': 'しょうげき',
      '怒り': 'いかり', '怒る': 'おこる', '憤り': 'いきどおり', '憤慨': 'ふんがい',
      '悲しみ': 'かなしみ', '悲しい': 'かなしい', '辛い': 'つらい', '苦しい': 'くるしい',
      '痛い': 'いたい', '痛み': 'いたみ', '苦痛': 'くつう', '苦しみ': 'くるしみ',
      '喜び': 'よろこび', '嬉しい': 'うれしい', '楽しい': 'たのしい', '愉快': 'ゆかい',
      '面白い': 'おもしろい', '興味深い': 'きょうみぶかい', '魅力的': 'みりょくてき',
      '美しい': 'うつくしい', '素晴らしい': 'すばらしい', '素敵': 'すてき', '立派': 'りっぱ',
      '優しい': 'やさしい', '親切': 'しんせつ', '優雅': 'ゆうが', '上品': 'じょうひん',
      '愛情': 'あいじょう', '愛': 'あい', '恋': 'こい', '恋愛': 'れんあい',
      '友情': 'ゆうじょう', '信頼': 'しんらい', '信じる': 'しんじる', '疑う': 'うたがう',
      '疑い': 'うたがい', '疑惑': 'ぎわく', '不信': 'ふしん', '信頼': 'しんらい',
      '尊敬': 'そんけい', '敬う': 'うやまう', '感謝': 'かんしゃ', 'ありがとう': 'ありがとう',
      '謝罪': 'しゃざい', '謝る': 'あやまる', '許す': 'ゆるす', '許し': 'ゆるし',
      '許容': 'きょよう', '我慢': 'がまん', '忍耐': 'にんたい', '努力': 'どりょく',
      '頑張る': 'がんばる', '諦める': 'あきらめる', '希望': 'きぼう', '願い': 'ねがい',
      '夢': 'ゆめ', '目標': 'もくひょう', '理想': 'りそう', '現実': 'げんじつ',
      '未来': 'みらい', '過去': 'かこ', '現在': 'げんざい', '今日': 'きょう',
      '明日': 'あした', '昨日': 'きのう', '今': 'いま', '今度': 'こんど',
      '次': 'つぎ', '前': 'まえ', '後': 'あと', '最初': 'さいしょ', '最後': 'さいご',
      '始まり': 'はじまり', '終わり': 'おわり', '開始': 'かいし', '終了': 'しゅうりょう',
      '完了': 'かんりょう', '完成': 'かんせい', '成功': 'せいこう', '失敗': 'しっぱい',
      '勝利': 'しょうり', '敗北': 'はいぼく', '勝つ': 'かつ', '負ける': 'まける',
      '優勝': 'ゆうしょう', '準優勝': 'じゅんゆうしょう', '三位': 'さんい', '順位': 'じゅんい'
    };

    let result = text;
    
    // Sort by length (longest first) to avoid partial replacements
    const sortedEntries = Object.entries(kanjiReadings).sort((a, b) => b[0].length - a[0].length);
    
    // Replace kanji with furigana
    for (const [kanji, reading] of sortedEntries) {
      const regex = new RegExp(kanji, 'g');
      result = result.replace(regex, `<ruby>${kanji}<rt>${reading}</rt></ruby>`);
    }

    return result;
  }

  // Prompt building
  function buildPrompt(segment, index, segments) {
    let template = elements.promptTemplate.value || DEFAULT_PROMPT;

    const style =
      elements.stylePreset.value === 'custom'
        ? 'as specified in the template'
        : elements.stylePreset.value.replace('-', ' ');

    const outLang =
      elements.outputLang.value === 'custom'
        ? elements.customLang.value || 'English'
        : elements.outputLang.value;

    // Get context
    const contextRadius = 2;
    const formatPrevContextLine = seg => {
      // Prefer the model's previous outputs when available to maintain coherence
      return `${seg.restyled || seg.text || ''}`.trim();
    };
    const formatNextContextLine = seg => {
      // Use only original upcoming text; omit any timestamps
      return `${seg.text || ''}`.trim();
    };

    const prevLines = segments
      .slice(Math.max(0, index - contextRadius), index)
      .map(formatPrevContextLine)
      .join('\n') || '(none)';
    const nextLines = segments
      .slice(index + 1, Math.min(segments.length, index + contextRadius + 1))
      .map(formatNextContextLine)
      .join('\n') || '(none)';
    const currentLine = formatNextContextLine(segment);

    // Replace placeholders
    template = template
      .replaceAll('{{style}}', style)
      .replaceAll('{{outlang}}', outLang)
      .replaceAll('{{currentLine}}', currentLine)
      .replaceAll('{{prevLines}}', prevLines)
      .replaceAll('{{nextLines}}', nextLines);

    // Add ASCII-only instruction if enabled
    if (elements.asciiOnly.checked) {
      template +=
        '\n\nIMPORTANT: Use only standard ASCII characters in your response. Avoid accented letters, special punctuation, or Unicode symbols.';
      if (elements.blocklist.value.trim()) {
        template += ` Also avoid these specific characters: ${elements.blocklist.value.trim()}`;
      }
    }

    return template;
  }

  // Build a single-call prompt that includes all segments with time data and asks for JSON output
  function buildGlobalPrompt(segments) {
    const presetStyle = elements.stylePreset.value.replace('-', ' ');
    const style = elements.stylePreset.value === 'custom'
      ? (elements.styleText?.value?.trim() || 'custom style provided by the user')
      : presetStyle;
    const outLang =
      elements.outputLang.value === 'custom'
        ? elements.customLang.value || 'English'
        : elements.outputLang.value;

    const minimal = segments.map(seg => ({
      start: Number(seg.start) || 0,
      end: Number(seg.end) || (Number(seg.start) || 0) + (Number(seg.duration) || 0),
      text: String(seg.text || '')
    }));

    const systemPrompt = `You are rewriting a full closed-caption transcript in a coherent way.
Style: ${style}
Output language: ${outLang}

Constraints:
- Preserve the number of segments and each segment's start and end timestamps unchanged.
- Rewrite only the text content to be coherent and fluent while keeping similar word density per segment so playback pacing remains natural.
- Do not invent content, speaker names, or change timing.
- Return ONLY strict JSON with this exact shape and property names:
{ "segments": [ { "start": number, "end": number, "text": string }, ... ] }
No markdown fences, no commentary.`;

    const jsonStr = JSON.stringify({ segments: minimal });

    let userPrompt = `Input segments (JSON):\n${jsonStr}`;
    if (elements.asciiOnly.checked) {
      userPrompt +=
        `\n\nIMPORTANT: Use only standard ASCII characters in your response. Avoid accented letters, special punctuation, or Unicode symbols.`;
      if (elements.blocklist.value.trim()) {
        userPrompt += ` Also avoid these specific characters: ${elements.blocklist.value.trim()}`;
      }
    }

    return { systemPrompt, userPrompt };
  }

  // Background messaging
  async function sendMessage(action, data = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, data }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // Video detection
  function detectVideoId() {
    const urlParams = new URLSearchParams(location.search);
    const videoId = urlParams.get('v');
    if (videoId) {
      elements.videoId.value = videoId;
      savePrefs();
      setStatus(`Video detected: ${videoId}`);
      return videoId;
    } else {
      setError('No video ID found in URL');
      return null;
    }
  }

  // Track listing
  async function listTracks() {
    const start = Date.now();
    const videoId = elements.videoId.value || detectVideoId();
    if (!videoId) return;

    const langPrefs = elements.langPrefs.value
      .split(',')
      .map(l => l.trim().toLowerCase())
      .filter(Boolean);

    try {
      setStatus('Listing tracks...');
      const response = await sendMessage('LIST_TRACKS', { videoId });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Local helper unavailable');
      }

      const payload = response.data || {};
      const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
      if (!tracks.length) {
        elements.trackSelect.innerHTML = '<option value="">No tracks found</option>';
        setError('No caption tracks available from the local helper');
        return;
      }

      const normalized = tracks.map((track, index) => {
        const lang = (track.lang || '').toLowerCase();
        const displayName = track.name || track.language || track.lang || `Track ${index + 1}`;
        return {
          lang,
          name: displayName,
          language: track.language || displayName,
          isGenerated: Boolean(track.isGenerated),
          isTranslatable: Boolean(track.isTranslatable),
          translationLanguages: track.translationLanguages || [],
          source: track.source || 'local-helper'
        };
      });

      normalized.sort((a, b) => {
        const aIndex = langPrefs.indexOf(a.lang);
        const bIndex = langPrefs.indexOf(b.lang);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.lang.localeCompare(b.lang);
      });

      elements.trackSelect.innerHTML = '<option value="">Select a track...</option>';
      normalized.forEach(track => {
        const option = document.createElement('option');
        option.value = JSON.stringify(track);
        const parts = [];
        if (track.language) parts.push(track.language);
        if (track.lang && track.lang !== track.language?.toLowerCase()) {
          parts.push(`(${track.lang})`);
        }
        const flags = [];
        if (track.isGenerated) flags.push('auto');
        let label = parts.filter(Boolean).join(' ');
        if (!label) label = 'Unknown language';
        if (flags.length) {
          label += ` [${flags.join(', ')}]`;
        }
        option.textContent = label;
        elements.trackSelect.appendChild(option);
      });

      setStatus(`Found ${normalized.length} tracks in ${dur(start)}`);
      log(`Listed ${normalized.length} tracks via local helper`, normalized);
    } catch (error) {
      logError('Failed to list tracks:', error);
      elements.trackSelect.innerHTML = '<option value="">No tracks found</option>';
      setError(`Failed to list tracks: ${error.message}`);
    }
  }
  // Transcript fetching
  async function fetchTranscript() {
    const start = Date.now();
    const videoId = elements.videoId.value || detectVideoId();
    if (!videoId) return false;

    let trackData = {};
    if (elements.trackSelect.value) {
      try {
        trackData = JSON.parse(elements.trackSelect.value);
        log('Parsed track data:', trackData);
      } catch (error) {
        logError('Invalid track selection:', error);
      }
    } else {
      log('No track selected, using defaults');
    }

    const lang = trackData.lang || 'en';
    const requestData = {
      videoId,
      lang,
      preferAsr: Boolean(trackData.isGenerated)
    };

    log('Sending FETCH_TRANSCRIPT request:', requestData);

    try {
      setStatus('Fetching transcript...');
      const response = await sendMessage('FETCH_TRANSCRIPT', requestData);
      if (!response || !response.success) {
        throw new Error(response?.error || 'Local helper unavailable');
      }

      const { format, segments } = response.data || {};
      if (format !== 'segments') {
        throw new Error(`Unsupported transcript format: ${format || 'unknown'}`);
      }
      if (!Array.isArray(segments) || !segments.length) {
        throw new Error('Local helper returned an empty transcript');
      }

      const normalized = segments
        .map(segment => {
          const startTime = Number(segment.start) || 0;
          const endTimeRaw = segment.end !== undefined ? Number(segment.end) : NaN;
          let duration = Number(segment.duration);
          let endTime = endTimeRaw;
          if (!Number.isFinite(duration) || duration < 0) {
            duration = Number.isFinite(endTimeRaw) ? endTimeRaw - startTime : 0;
          }
          if (!Number.isFinite(endTime)) {
            endTime = startTime + Math.max(0, duration);
          }

          return {
            start: Math.max(0, startTime),
            end: Math.max(startTime, endTime),
            duration: Math.max(0, duration),
            text: (segment.text || '').trim()
          };
        })
        .filter(segment => segment.text);

      if (!normalized.length) {
        throw new Error('Parsed transcript contained no usable segments');
      }

      transcriptData = normalized;
      renderList();
      resetSubtitleState();
      ensureVideoListeners();

      setStatus(`Transcript loaded: ${transcriptData.length} segments in ${dur(start)}`);
      log(`Parsed ${transcriptData.length} segments`);
      return true;
    } catch (error) {
      setError(`Failed to fetch transcript: ${error.message}`);
      return false;
    }
  }

  // LLM restyling

  async function restyleAll() {
    // Validate inputs before proceeding
    if (!validateAllInputs()) {
      setError('Please fix the validation errors before restyling');
      return;
    }

    if (!transcriptData.length) {
      if (!elements.trackSelect.value) {
        setError('Select a caption track and fetch the transcript first');
        return;
      }

      const loaded = await fetchTranscript();
      if (!loaded || !transcriptData.length) {
        setError('No transcript data loaded');
        return;
      }
    }

    // Single-call mode: one LLM request for the entire transcript
    if (elements.singleCall && elements.singleCall.checked) {
      try {
        setStatus('Starting single-call restyle...');

        const { systemPrompt, userPrompt } = buildGlobalPrompt(transcriptData);
        aborter = new AbortController();
        activeBatchId = `restyle-one-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const response = await sendMessage('LLM_CALL', {
          provider: elements.provider.value,
          baseUrl: elements.baseUrl.value,
          apiKey: elements.apiKey.value,
          model: elements.model.value,
          systemPrompt,
          userPrompt,
          asciiOnly: elements.asciiOnly.checked,
          batchId: activeBatchId,
          requestId: `${activeBatchId}:0`,
          anthropicVersion: elements.anthropicVersion.value.trim(),
          maxTokens: parseInt(elements.maxTokens?.value, 10) || 1000,
          temperature: parseFloat(elements.temperature?.value) || 0.7
        });

        if (!response?.success) {
          throw new Error(response?.error || 'LLM call failed');
        }

        let payloadText = response.data || '';
        // Strip markdown fences if present
        payloadText = String(payloadText).trim();
        const fenceMatch = payloadText.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
        if (fenceMatch) {
          payloadText = fenceMatch[1].trim();
        }
        // Attempt to find first JSON object if extra text present
        const firstBrace = payloadText.indexOf('{');
        if (firstBrace > 0) {
          payloadText = payloadText.slice(firstBrace);
        }

        let parsed;
        try {
          parsed = JSON.parse(payloadText);
        } catch (e) {
          throw new Error('Model did not return valid JSON');
        }

        const outSegments = Array.isArray(parsed?.segments) ? parsed.segments : [];
        if (!outSegments.length) {
          throw new Error('No segments found in model output');
        }

        // Map back by index when counts match; otherwise try by time
        if (outSegments.length === transcriptData.length) {
          outSegments.forEach((seg, i) => {
            const text = String(seg.text || '');
            transcriptData[i].restyled = elements.asciiOnly.checked
              ? sanitizeAscii(text, elements.blocklist.value)
              : text;
          });
        } else {
          // Fallback: build a map by start-end seconds
          const key = s => `${Number(s.start)||0}-${Number(s.end)||0}`;
          const map = new Map(outSegments.map(s => [key(s), String(s.text || '')]));
          transcriptData.forEach((s, i) => {
            const t = map.get(key(s));
            if (typeof t === 'string') {
              transcriptData[i].restyled = elements.asciiOnly.checked
                ? sanitizeAscii(t, elements.blocklist.value)
                : t;
            }
          });
        }

        renderList();
        updateSubtitleText(transcriptData[activeSegmentIndex] || null);
        setStatus(`Single-call restyle complete: ${transcriptData.filter(s=>s.restyled).length}/${transcriptData.length} segments updated`);
      } catch (error) {
        logError('Single-call restyle failed:', error);
        setError(`Restyle failed: ${error.message}`);
      } finally {
        elements.restyleBtn.disabled = false;
        elements.stopBtn.disabled = true;
        elements.progress.textContent = '';
        aborter = null;
        activeBatchId = null;
      }
      return;
    }

    const concurrencyValue = parseInt(elements.concurrency.value, 10) || 3;
    const concurrency = Math.min(Math.max(concurrencyValue, 1), 10);
    const total = transcriptData.length;
    let completed = 0;
    let errors = 0;
    const retryCounts = new Array(total).fill(0);
    const retryQueue = [];
    let nextIndex = 0;
    let consecutive429 = 0;
    let globalPauseUntil = 0;

    const MAX_RETRIES = 3;
    const BASE_BACKOFF_MS = 1000;
    const MAX_BACKOFF_MS = 10000;
    const GLOBAL_COOLDOWN_THRESHOLD = 3;
    const GLOBAL_COOLDOWN_MS = 8000;

    transcriptData.forEach(segment => {
      delete segment.restyled;
      delete segment.error;
    });

    aborter = new AbortController();
    activeBatchId = `restyle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    elements.restyleBtn.disabled = true;
    elements.stopBtn.disabled = false;

    const start = Date.now();
    setStatus('Starting restyle process...');

    const updateProgress = () => {
      const parts = [`${completed}/${total} completed`];
      if (errors > 0) {
        parts.push(`${errors} errors`);
      }
      elements.progress.textContent = parts.join(' | ');
    };

    updateProgress();

    const getNextIndex = () => {
      if (retryQueue.length > 0) {
        return retryQueue.shift();
      }
      if (nextIndex < total) {
        return nextIndex++;
      }
      return undefined;
    };

    const workers = Array.from({ length: concurrency }, async () => {
      while (!aborter.signal.aborted) {
        const index = getNextIndex();
        if (index === undefined) {
          break;
        }

        const segment = transcriptData[index];
        const prompt = buildPrompt(segment, index, transcriptData);
        const requestId = `${activeBatchId}:${index}:${retryCounts[index]}`;

        try {
          const now = Date.now();
          if (globalPauseUntil > now) {
            await wait(globalPauseUntil - now);
          }

          if (aborter.signal.aborted) {
            break;
          }

          const response = await sendMessage('LLM_CALL', {
            provider: elements.provider.value,
            baseUrl: elements.baseUrl.value,
            apiKey: elements.apiKey.value,
            model: elements.model.value,
            systemPrompt: '',
            userPrompt: prompt,
            asciiOnly: elements.asciiOnly.checked,
            batchId: activeBatchId,
            requestId,
            anthropicVersion: elements.anthropicVersion.value.trim()
          });

          if (aborter.signal.aborted || response.aborted) {
            break;
          }

          if (!response.success) {
            throw new Error(response.error || 'LLM call failed');
          }

          let restyled = response.data;
          if (elements.asciiOnly.checked) {
            restyled = sanitizeAscii(restyled, elements.blocklist.value);
          }

          segment.restyled = restyled;
          if (index === activeSegmentIndex) {
            updateSubtitleText(segment);
          }
          delete segment.error;

          completed += 1;
          retryCounts[index] = 0;
          consecutive429 = 0;

          if (completed === 1) {
            setStatus('Restyling in progress...');
          }

          updateProgress();

          if (completed % 5 === 0 || completed === total) {
            renderList();
          }
        } catch (error) {
          if (aborter.signal.aborted) {
            break;
          }

          const message = error?.message || String(error);

          if (/429|rate limit/i.test(message)) {
            const attempt = retryCounts[index];
            if (attempt < MAX_RETRIES) {
              retryCounts[index] = attempt + 1;
              const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
              const attemptNumber = attempt + 2;
              const totalAttempts = MAX_RETRIES + 1;
              setStatus(
                `Rate limited. Retrying segment ${index + 1} (attempt ${attemptNumber}/${totalAttempts})...`
              );
              consecutive429 += 1;

              if (consecutive429 >= GLOBAL_COOLDOWN_THRESHOLD) {
                globalPauseUntil = Date.now() + GLOBAL_COOLDOWN_MS;
                setStatus(
                  `Rate limited. Cooling down for ${Math.round(GLOBAL_COOLDOWN_MS / 1000)}s...`
                );
                consecutive429 = 0;
              }

              await wait(delay);
              retryQueue.push(index);
              continue;
            }
          } else {
            consecutive429 = 0;
          }

          logError(`Failed to restyle segment ${index}:`, error);
          segment.error = message;
          errors += 1;
          updateProgress();
        }
      }
    });

    try {
      await Promise.all(workers);

      if (aborter?.signal?.aborted) {
        setStatus(`Restyle stopped: ${completed}/${total} completed`);
      } else {
        const duration = dur(start);
        setStatus(
          `Restyle complete: ${completed}/${total} segments in ${duration}${
            errors > 0 ? `, ${errors} errors` : ''
          }`
        );
      }
    } catch (error) {
      setError(`Restyle failed: ${error.message}`);
    } finally {
      elements.restyleBtn.disabled = false;
      elements.stopBtn.disabled = true;
      elements.progress.textContent = '';
      aborter = null;
      activeBatchId = null;
      renderList();
    }
  }

  function stopRestyle() {
    if (aborter) {
      aborter.abort();
      if (activeBatchId) {
        sendMessage('ABORT_REQUESTS', { batchId: activeBatchId }).catch(logError);
      }
      setStatus('Stopping restyle...');
    }
  }

  function syncProviderUI() {
    const isAnthropic = elements.provider.value === 'anthropic';
    const container = document.getElementById('yt-anthropic-options');
    if (container) {
      container.style.display = isAnthropic ? 'block' : 'none';
    }
    // Show custom style input when preset is 'custom'
    const styleRow = document.getElementById('yt-style-text-row');
    if (styleRow) {
      styleRow.style.display = elements.stylePreset.value === 'custom' ? 'block' : 'none';
    }
  }

  // TTS functions
  function syncTtsUI() {
    const provider = elements.ttsProvider.value;

    // Show/hide provider-specific controls
    document.getElementById('yt-azure-controls').style.display =
      provider === 'azure' ? 'block' : 'none';
    document.getElementById('yt-browser-tts-controls').style.display =
      provider === 'browser' ? 'block' : 'none';

    // Update voice control visibility
    document.getElementById('yt-tts-voice-controls').style.display =
      provider === 'browser' ? 'none' : 'block';

    // Load browser voices if needed
    if (provider === 'browser') {
      listBrowserVoices();
    }
  }

  function showStopButton(show) {
    if (!elements.stopTtsBtn) return;
    elements.stopTtsBtn.style.display = show ? 'inline-block' : 'none';
  }

  function isAudioPlaying() {
    try {
      const a = elements.ttsAudio;
      return Boolean(a && !a.paused && !a.ended && a.currentTime > 0 && a.readyState > 2);
    } catch (_) {
      return false;
    }
  }

  function updateStopButtonVisibility() {
    showStopButton(browserTtsActive || isAudioPlaying());
  }

  // Input validation functions
  function validateApiKey(key) {
    if (!key || !key.trim()) return 'API key is required';
    if (key.length < 8) return 'API key seems too short';
    // Basic validation - no spaces, contains typical API key characters
    if (/\s/.test(key)) return 'API key should not contain spaces';
    return null;
  }

  function validateUrl(url) {
    if (!url || !url.trim()) return null; // Empty URLs are OK for some providers
    try {
      const parsed = new URL(url);
      if (!parsed.protocol.startsWith('http')) return 'URL must use HTTP or HTTPS protocol';
      return null;
    } catch {
      return 'Invalid URL format';
    }
  }

  function validateModel(model) {
    if (!model || !model.trim()) return 'Model name is required';
    if (model.length < 2) return 'Model name too short';
    return null;
  }

  function validateInput(field, validator) {
    const value = field.value.trim();
    const error = validator(value);

    // Remove existing error styling
    field.classList.remove('yt-input-error');
    let errorEl = field.parentNode.querySelector('.yt-field-error');
    if (errorEl) errorEl.remove();

    if (error) {
      field.classList.add('yt-input-error');
      const errorDiv = document.createElement('div');
      errorDiv.className = 'yt-field-error';
      errorDiv.textContent = error;
      errorDiv.style.color = '#ff6b6b';
      errorDiv.style.fontSize = '11px';
      errorDiv.style.marginTop = '2px';
      field.parentNode.appendChild(errorDiv);
      return false;
    }

    return true;
  }

  function validateAllInputs() {
    let isValid = true;

    // Validate API key
    if (!validateInput(elements.apiKey, validateApiKey)) isValid = false;

    // Validate base URL
    if (!validateInput(elements.baseUrl, validateUrl)) isValid = false;

    // Validate model
    if (!validateInput(elements.model, validateModel)) isValid = false;

    return isValid;
  }

  function handleFontSizeChange() {
    const size = parseInt(elements.fontSize.value, 10);
    if (!Number.isFinite(size) || size < 10 || size > 24) {
      return;
    }
    applyFontSize(size);
    savePrefs();
  }

  function setTtsUiState(isRunning) {
    if (!elements.generateTtsBtn) return;
    elements.generateTtsBtn.disabled = Boolean(isRunning);
    updateStopButtonVisibility();
  }

  function listBrowserVoices() {
    if (!window.speechSynthesis) {
      setError('Browser TTS not supported');
      return;
    }

    const voices = speechSynthesis.getVoices();
    elements.browserVoiceSelect.innerHTML = '<option value="">Default voice</option>';

    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      elements.browserVoiceSelect.appendChild(option);
    });

    // Set saved voice if available
    if (lastPrefs.browserVoice) {
      elements.browserVoiceSelect.value = lastPrefs.browserVoice;
    }
  }

  async function listAzureVoices() {
    if (!elements.apiKey.value || !elements.azureRegion.value) {
      setError('Azure API key and region required');
      return;
    }

    try {
      setStatus('Fetching Azure voices...');
      const response = await sendMessage('TTS_AZURE_VOICES', {
        apiKey: elements.apiKey.value,
        azureRegion: elements.azureRegion.value
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      const voices = response.data;
      elements.azureVoiceSelect.innerHTML = '<option value="">Select voice...</option>';

      voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.ShortName;
        option.textContent = `${voice.DisplayName} (${voice.LocaleName})`;
        elements.azureVoiceSelect.appendChild(option);
      });

      setStatus(`Loaded ${voices.length} Azure voices`);
    } catch (error) {
      setError(`Failed to load Azure voices: ${error.message}`);
    }
  }

  function gatherTranscriptText() {
    if (!transcriptData.length) return '';

    let text = transcriptData
      .map(segment => {
        return segment.restyled || segment.text;
      })
      .join(' ');

    // Apply ASCII sanitization if enabled
    if (elements.asciiOnly.checked) {
      text = sanitizeAscii(text, elements.blocklist.value);
    }

    return text;
  }

  async function generateTTS() {
    if (!elements.ttsEnabled.checked) {
      setError('TTS is disabled');
      return;
    }

    // Validate inputs for TTS providers that need API keys
    const provider = elements.ttsProvider.value;
    if (provider === 'openai' || provider === 'openai-compatible' || provider === 'azure') {
      if (!validateAllInputs()) {
        setError('Please fix the validation errors before generating TTS');
        return;
      }
    }

    const text = gatherTranscriptText();
    if (!text) {
      setError('No transcript text available');
      return;
    }
    const format = (elements.ttsFormat.value || 'mp3').toLowerCase();

    try {
      setStatus('Generating TTS audio...');

      // Setup request identifiers for abort support
      activeTtsBatchId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeTtsRequestId = `${activeTtsBatchId}:0`;
      setTtsUiState(true);

      if (provider === 'browser') {
        browserTtsActive = true;
        generateBrowserTTS(text);
        return;
      }

      const data = {
        provider,
        format,
        text: text.substring(0, 4000),
        baseUrl: elements.baseUrl.value,
        apiKey: elements.apiKey.value,
        batchId: activeTtsBatchId,
        requestId: activeTtsRequestId
      };

      if (provider === 'azure') {
        data.azureRegion = elements.azureRegion.value;
        data.voice = elements.azureVoiceSelect.value || elements.ttsVoice.value;
      } else {
        data.voice = elements.ttsVoice.value;
      }

      const response = await sendMessage('TTS_SPEAK', data);

      if (response.aborted) {
        setStatus('TTS request cancelled');
        return;
      }

      if (!response.success) {
        throw new Error(response.error || 'TTS request failed');
      }

      const { audioData, mime } = response.data;
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mime || 'audio/mpeg' });
      if (lastTtsUrl) {
        URL.revokeObjectURL(lastTtsUrl);
      }
      const url = URL.createObjectURL(blob);
      lastTtsUrl = url;

      elements.ttsAudio.src = url;
      elements.ttsAudio.style.display = 'block';
      elements.downloadTtsBtn.style.display = 'inline-block';
      elements.downloadTtsBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        const extension = mime && mime.includes('/') ? mime.split('/')[1] : format;
        a.download = `transcript-tts.${extension || 'mp3'}`;
        a.click();
      };

      // Clear any previous audio cleanup timeout
      if (elements.ttsAudio._cleanupTimeout) {
        clearTimeout(elements.ttsAudio._cleanupTimeout);
      }

      // Auto-cleanup audio after 5 minutes to prevent memory leaks
      elements.ttsAudio._cleanupTimeout = setTimeout(() => {
        if (elements.ttsAudio && elements.ttsAudio.src) {
          URL.revokeObjectURL(elements.ttsAudio.src);
          elements.ttsAudio.src = '';
          elements.ttsAudio.style.display = 'none';
          elements.downloadTtsBtn.style.display = 'none';
          updateStopButtonVisibility();
        }
      }, 5 * 60 * 1000);

      setStatus('TTS audio generated successfully');
      updateStopButtonVisibility();
    } catch (error) {
      logError('TTS generation failed:', error);
      setError(`TTS failed: ${error.message}`);
    } finally {
      setTtsUiState(false);
      activeTtsRequestId = null;
      activeTtsBatchId = null;
      browserTtsActive = false;
    }
  }

  function generateBrowserTTS(text) {
    if (!window.speechSynthesis) {
      setError('Browser TTS not supported');
      return;
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Set voice if selected
    if (elements.browserVoiceSelect.value) {
      const voices = speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.name === elements.browserVoiceSelect.value);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    utterance.rate = parseFloat(elements.ttsRate.value) || 1.0;

    setTtsUiState(true);
    utterance.onstart = () => {
      setStatus('Playing browser TTS...');
      browserTtsActive = true;
      updateStopButtonVisibility();
    };
    utterance.onend = () => {
      setStatus('Browser TTS completed');
      setTtsUiState(false);
      browserTtsActive = false;
      activeTtsRequestId = null;
      activeTtsBatchId = null;
      updateStopButtonVisibility();
    };
    utterance.onerror = e => {
      setError(`Browser TTS error: ${e.error}`);
      setTtsUiState(false);
      browserTtsActive = false;
      activeTtsRequestId = null;
      activeTtsBatchId = null;
      updateStopButtonVisibility();
    };

    speechSynthesis.speak(utterance);
  }

  async function stopTTS() {
    try {
      // Stop browser speech if active
      if (elements.ttsProvider.value === 'browser' || browserTtsActive) {
        if (window.speechSynthesis) {
          speechSynthesis.cancel();
        }
        browserTtsActive = false;
      }

      // Pause audio playback if playing
      try {
        if (elements.ttsAudio && !elements.ttsAudio.paused) {
          elements.ttsAudio.pause();
          elements.ttsAudio.currentTime = 0;
        }
      } catch (_) {
        /* ignore */
      }

      // Abort background request if present
      if (activeTtsRequestId || activeTtsBatchId) {
        await sendMessage('ABORT_REQUESTS', {
          requestIds: activeTtsRequestId ? [activeTtsRequestId] : [],
          batchId: activeTtsBatchId || undefined
        });
      }

      setStatus('TTS stopped');
    } catch (error) {
      logError('Failed to stop TTS:', error);
    } finally {
      setTtsUiState(false);
      activeTtsRequestId = null;
      activeTtsBatchId = null;
      browserTtsActive = false;
      updateStopButtonVisibility();
    }
  }

  // Keep Stop TTS visible while audio is playing
  if (elements.ttsAudio) {
    ['play', 'playing', 'pause', 'ended', 'emptied', 'abort', 'stalled', 'suspend'].forEach(evt => {
      elements.ttsAudio.addEventListener(evt, updateStopButtonVisibility);
    });
  }

  // Export functions
  function downloadText(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportTXT() {
    if (!transcriptData.length) {
      setError('No transcript data to export');
      return;
    }

    const content = transcriptData
      .map(segment => {
        const text = segment.restyled || segment.text;
        return segment.start ? `[${formatTime(segment.start)}] ${text}` : text;
      })
      .join('\n');

    downloadText(content, 'transcript.txt');
    setStatus('TXT export completed (includes restyled content)');
  }

  function exportSRT() {
    if (!transcriptData.length) {
      setError('No transcript data to export');
      return;
    }

    const content = transcriptData
      .map((segment, i) => {
        const text = segment.restyled || segment.text;
        const start = formatSRTTime(segment.start || i * 3);
        const end = formatSRTTime(segment.end || i * 3 + 3);

        return `${i + 1}\n${start} --> ${end}\n${text}\n`;
      })
      .join('\n');

    downloadText(content, 'transcript.srt');
    setStatus('SRT export completed');
  }

  function exportVTT() {
    if (!transcriptData.length) {
      setError('No transcript data to export');
      return;
    }

    const DEFAULT_DURATION = 2;
    const MIN_GAP = 0.1;
    let lastEnd = 0;

    let content = 'WEBVTT\n\n';

    transcriptData.forEach((segment, index) => {
      const text = segment.restyled || segment.text || '';
      const next = transcriptData[index + 1];

      const startSeconds = typeof segment.start === 'number' ? segment.start : lastEnd;

      let endSeconds;
      if (typeof segment.end === 'number') {
        endSeconds = segment.end;
      } else if (next && typeof next.start === 'number') {
        endSeconds = Math.max(next.start - MIN_GAP, startSeconds + MIN_GAP);
      } else {
        endSeconds = startSeconds + DEFAULT_DURATION;
      }

      if (endSeconds <= startSeconds) {
        endSeconds = startSeconds + MIN_GAP;
      }

      lastEnd = endSeconds;

      content += `${formatVTTTime(startSeconds)} --> ${formatVTTTime(endSeconds)}
${text}

`;
    });

    downloadText(content.trimEnd(), 'transcript.vtt', 'text/vtt');
    setStatus('VTT export completed');
  }

  function exportJSON() {
    if (!transcriptData.length) {
      setError('No transcript data to export');
      return;
    }

    const data = {
      metadata: {
        videoId: elements.videoId.value,
        exportDate: new Date().toISOString(),
        totalSegments: transcriptData.length
      },
      segments: transcriptData.map(segment => ({
        start: segment.start,
        end: segment.end,
        text: segment.text,
        restyled: segment.restyled || null
      }))
    };

    downloadText(JSON.stringify(data, null, 2), 'transcript.json', 'application/json');
    setStatus('JSON export completed');
  }

  function formatSRTTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  function formatVTTTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(3);

    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.padStart(6, '0')}`;
    } else {
      return `${m.toString().padStart(2, '0')}:${s.padStart(6, '0')}`;
    }
  }

  // Event handlers
  elements.debugToggle.addEventListener('change', () => {
    UI_DEBUG = elements.debugToggle.checked;
    savePrefs();
    log(`Debug logging ${UI_DEBUG ? 'enabled' : 'disabled'}`);
  });

  elements.collapseBtn.addEventListener('click', () => {
    const isCollapsed = elements.content.style.display === 'none';
    elements.content.style.display = isCollapsed ? 'block' : 'none';
    elements.collapseBtn.textContent = isCollapsed ? '−' : '+';
  });

  elements.closeBtn.addEventListener('click', () => {
    overlay.remove();
  });

  // Font size live updates
  if (elements.fontSize) {
    elements.fontSize.addEventListener('input', handleFontSizeChange);
    elements.fontSize.addEventListener('change', handleFontSizeChange);
  }

  // Collapsible sections
  document.querySelectorAll('.yt-section.collapsible .section-header').forEach(header => {
    header.addEventListener('click', () => {
      const section = header.closest('.yt-section');
      const content = section.querySelector('.section-content');
      const icon = header.querySelector('.collapse-icon');
      
      if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
      } else {
        content.style.display = 'none';
        icon.textContent = '▶';
      }
    });
  });

  // Auto-TTS controls
  if (elements.autoTts) {
    elements.autoTts.addEventListener('change', () => {
      autoTtsEnabled = elements.autoTts.checked;
      lastAutoTtsSegment = -1; // Reset to allow replay of current segment
      savePrefs();
      setStatus(`Auto-TTS ${autoTtsEnabled ? 'enabled' : 'disabled'}`);
    });
  }

  if (elements.autoTtsType) {
    elements.autoTtsType.addEventListener('change', () => {
      savePrefs();
    });
  }

  if (elements.furigana) {
    elements.furigana.addEventListener('change', () => {
      savePrefs();
      // Re-render transcript with furigana
      if (transcriptData && transcriptData.length > 0) {
        renderTranscript(transcriptData);
      }
      setStatus(`Furigana ${elements.furigana.checked ? 'enabled' : 'disabled'}`);
    });
  }

  if (elements.showBoth) {
    elements.showBoth.addEventListener('change', () => {
      savePrefs();
      setStatus(`Show both texts ${elements.showBoth.checked ? 'enabled' : 'disabled'}`);
    });
  }

  elements.detectBtn.addEventListener('click', detectVideoId);
  elements.listTracksBtn.addEventListener('click', listTracks);
  elements.fetchTranscriptBtn.addEventListener('click', fetchTranscript);

  elements.themeSelect.addEventListener('change', () => {
    applyTheme(elements.themeSelect.value);
  });

  elements.savePresetBtn.addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (name) {
      window.ytPresets[name] = snapshotPreset();
      sendMessage('SET_PREFS', {
        prefs: { ytro_presets: window.ytPresets }
      })
        .then(() => {
          setStatus(`Preset "${name}" saved`);
          rebuildPresetOptions();
        })
        .catch(logError);
    }
  });

  elements.exportPresetsBtn.addEventListener('click', () => {
    downloadText(JSON.stringify(window.ytPresets, null, 2), 'yt-presets.json', 'application/json');
  });

  elements.importPresetsBtn.addEventListener('click', () => {
    elements.importPresetsInput.click();
  });

  elements.importPresetsInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        Object.assign(window.ytPresets, imported);
        sendMessage('SET_PREFS', {
          prefs: { ytro_presets: window.ytPresets }
        })
          .then(() => {
            setStatus(`Imported ${Object.keys(imported).length} presets`);
            rebuildPresetOptions();
          })
          .catch(logError);
      } catch (error) {
        setError(`Failed to import presets: ${error.message}`);
      }
    };
    reader.readAsText(file);
  });

  if (elements.transcriptList) {
    elements.transcriptList.addEventListener('click', event => {
      const item = event.target.closest('.yt-transcript-item');
      if (!item) return;
      const index = Number(item.dataset.index);
      if (!Number.isFinite(index)) return;
      const segment = transcriptData[index];
      if (!segment) return;
      seekTo(segment.start || 0);
      activeSegmentIndex = index;
      updateSubtitleText(segment);
      applyActiveHighlight(true);
    });
  }

  // Apply font button explicitly updates subtitle overlay and saves
  if (elements.applyFontBtn) {
    elements.applyFontBtn.addEventListener('click', () => {
      handleFontSizeChange();
      const size = parseInt(elements.fontSize.value, 10);
      const resolved = Number.isFinite(size) && size > 0 ? size : DEFAULT_FONT_SIZE;
      document.body.style.setProperty('--ts-subtitle-font-size', `${Math.round(resolved * 1.85)}px`);
      setStatus('Applied font size');
    });
  }

  elements.outputLang.addEventListener('change', () => {
    elements.customLang.style.display = elements.outputLang.value === 'custom' ? 'block' : 'none';
    savePrefs();
  });

  elements.restyleBtn.addEventListener('click', restyleAll);
  elements.stopBtn.addEventListener('click', stopRestyle);
  elements.provider.addEventListener('change', syncProviderUI);
  elements.stylePreset.addEventListener('change', syncProviderUI);

  elements.ttsProvider.addEventListener('change', syncTtsUI);
  elements.azureVoicesBtn.addEventListener('click', listAzureVoices);
  elements.generateTtsBtn.addEventListener('click', generateTTS);
  if (elements.stopTtsBtn) {
    elements.stopTtsBtn.addEventListener('click', stopTTS);
  }

  elements.ttsRate.addEventListener('input', () => {
    elements.rateValue.textContent = elements.ttsRate.value;
  });

  elements.exportTxtBtn.addEventListener('click', exportTXT);
  elements.exportSrtBtn.addEventListener('click', exportSRT);
  elements.exportVttBtn.addEventListener('click', exportVTT);
  elements.exportJsonBtn.addEventListener('click', exportJSON);

  elements.searchInput.addEventListener('input', () => {
    renderList(transcriptData, elements.searchInput.value);
  });

  // Auto-save preferences on input changes
  [
    elements.videoId,
    elements.langPrefs,
    elements.fontSize,
    elements.outputLang,
    elements.customLang,
    elements.provider,
    elements.baseUrl,
    elements.model,
    elements.anthropicVersion,
    elements.concurrency,
    elements.stylePreset,
    elements.promptTemplate,
    elements.asciiOnly,
    elements.blocklist,
    elements.maxTokens,
    elements.styleText,
    elements.ttsEnabled,
    elements.ttsProvider,
    elements.ttsVoice,
    elements.ttsFormat,
    elements.azureRegion,
    elements.ttsRate
  ].forEach(el => {
    if (el) {
      el.addEventListener('change', savePrefs);
      if (el.type === 'text' || el.type === 'password' || el.type === 'number') {
        el.addEventListener('input', savePrefs);
      }
    }
  });

  syncProviderUI();

  // Drag functionality
  let isDragging = false;
  const dragOffset = { x: 0, y: 0 };

  document.querySelector('.yt-overlay-header').addEventListener('mousedown', e => {
    if (e.target.closest('.yt-overlay-controls')) return;

    isDragging = true;
    const rect = overlay.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', onDragEnd);
  });

  function onDrag(e) {
    if (!isDragging) return;

    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;

    overlay.style.left = `${Math.max(0, Math.min(window.innerWidth - overlay.offsetWidth, x))}px`;
    overlay.style.top = `${Math.max(0, Math.min(window.innerHeight - overlay.offsetHeight, y))}px`;
  }

  function onDragEnd() {
    if (!isDragging) return;

    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', onDragEnd);

    // Save position
    sendMessage('SET_PREFS', {
      prefs: {
        ytro_position: {
          left: parseInt(overlay.style.left) || 20,
          top: parseInt(overlay.style.top) || 20
        }
      }
    }).catch(logError);
  }

  // Navigation watcher to reset state and cleanup resources
  let lastUrl = location.href;
  function checkNavigation() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;

      // Cleanup resources before resetting
      if (elements.ttsAudio && elements.ttsAudio._cleanupTimeout) {
        clearTimeout(elements.ttsAudio._cleanupTimeout);
      }
      if (lastTtsUrl) {
        URL.revokeObjectURL(lastTtsUrl);
        lastTtsUrl = '';
      }
      if (elements.ttsAudio && elements.ttsAudio.src) {
        elements.ttsAudio.src = '';
        elements.ttsAudio.style.display = 'none';
        elements.downloadTtsBtn.style.display = 'none';
      }

      // Reset state
      transcriptData = [];
      resetSubtitleState();
      elements.transcriptList.innerHTML = '';
      elements.trackSelect.innerHTML = '<option value="">Select a track...</option>';
      updateSubtitleText(null);
      activeTtsRequestId = null;
      activeTtsBatchId = null;
      browserTtsActive = false;
      updateStopButtonVisibility();
      detectVideoId();
      log('Navigation detected, resources cleaned up and state reset');
    }
  }

  setInterval(checkNavigation, 1000);

  ensureVideoListeners();

  // Load browser voices when available
  if (window.speechSynthesis) {
    speechSynthesis.addEventListener('voiceschanged', listBrowserVoices);
    // Initial load
    setTimeout(listBrowserVoices, 100);
  }

  // Initialize
  loadPrefs()
    .then(() => {
      detectVideoId();
      log('Transcript Styler initialized');
    })
    .catch(logError);
} // End YouTube check
