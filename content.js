// Transcript Styler - Content Script
// v0.4.0-test with comprehensive features and logging

// Only inject on YouTube watch pages
if (location.hostname === 'www.youtube.com' && location.pathname === '/watch') {

// Global state
let transcriptData = [];
let aborter = null;
let UI_DEBUG = false;
let lastPrefs = {};
let activeBatchId = null;
let lastTtsUrl = null;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    <div class="yt-section">
      <h4>Language Preferences</h4>
      <div class="yt-controls">
        <label>Preferred Languages (comma-separated):</label>
        <input type="text" id="yt-lang-prefs" placeholder="en,es,fr,de,ja" style="width: 100%;">
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

    <!-- LLM Controls Section -->
    <div class="yt-section">
      <h4>LLM Provider</h4>
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
        <label>ASCII Blocklist:</label>
        <input type="text" id="yt-blocklist" placeholder="Additional characters to avoid" style="width: 100%;">
      </div>
    </div>

    <!-- Style & Prompt Section -->
    <div class="yt-section">
      <h4>Style & Prompt</h4>
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
      <textarea id="yt-prompt-template" rows="4" style="width: 100%;" placeholder="Custom prompt template..."></textarea>
      <div class="yt-controls">
        <button id="yt-restyle-btn">Restyle All</button>
        <button id="yt-stop-btn">Stop</button>
        <span id="yt-progress"></span>
      </div>
    </div>

    <!-- TTS Section -->
    <div class="yt-section">
      <h4>Text-to-Speech</h4>
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
        <button id="yt-download-tts-btn" style="display: none;">Download Audio</button>
      </div>
      <audio id="yt-tts-audio" controls style="width: 100%; margin-top: 5px; display: none;"></audio>
    </div>

    <!-- Export Section -->
    <div class="yt-section">
      <h4>Export</h4>
      <div class="yt-controls">
        <button id="yt-export-txt-btn">Export TXT</button>
        <button id="yt-export-srt-btn">Export SRT</button>
        <button id="yt-export-vtt-btn">Export VTT</button>
        <button id="yt-export-json-btn">Export JSON</button>
      </div>
    </div>

    <!-- Transcript Display Section -->
    <div class="yt-section">
      <h4>Transcript</h4>
      <div class="yt-controls">
        <input type="text" id="yt-search-input" placeholder="Search transcript..." style="width: 100%;">
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
  generateTtsBtn: document.getElementById('yt-generate-tts-btn'),
  downloadTtsBtn: document.getElementById('yt-download-tts-btn'),
  ttsAudio: document.getElementById('yt-tts-audio'),
  
  exportTxtBtn: document.getElementById('yt-export-txt-btn'),
  exportSrtBtn: document.getElementById('yt-export-srt-btn'),
  exportVttBtn: document.getElementById('yt-export-vtt-btn'),
  exportJsonBtn: document.getElementById('yt-export-json-btn'),
  
  searchInput: document.getElementById('yt-search-input'),
  transcriptList: document.getElementById('yt-transcript-list'),
  status: document.getElementById('yt-status')
};

// Default values
const DEFAULT_PROMPT = `Restyle this transcript segment to be {{style}}. Output language: {{outlang}}. Keep the meaning intact but improve clarity and readability. If ASCII-only mode is enabled, use only standard ASCII characters (no accents, special punctuation, or Unicode symbols).

Context (previous lines):
{{prevLines}}

Current line to restyle:
{{currentLine}}

Context (next lines):
{{nextLines}}`;

const DEFAULT_TTS_SETTINGS = {
  enabled: false,
  provider: 'openai',
  voice: 'alloy',
  format: 'mp3',
  azureRegion: 'eastus',
  rate: 1.0
};

// ASCII sanitization - Fixed character list
const DEFAULT_BAD = [
  // Accented characters
  'à', 'á', 'â', 'ã', 'ä', 'å', 'æ', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï',
  'ð', 'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', 'ø', 'ù', 'ú', 'û', 'ü', 'ý', 'þ', 'ÿ',
  'À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Æ', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì', 'Í', 'Î', 'Ï',
  'Ð', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ø', 'Ù', 'Ú', 'Û', 'Ü', 'Ý', 'Þ',
  // Punctuation and symbols
  '\u2013', '\u2014', '\u2018', '\u2019', '\u201C', '\u201D', '\u2026', '\u2022', '\u2122', '\u00A9', '\u00AE', '\u00A7', '\u00B6', '\u2020', '\u2021', '\u2030',
  '\u2039', '\u203A', '\u00AB', '\u00BB', '\u00A1', '\u00BF', '\u00A2', '\u00A3', '\u00A4', '\u00A5', '\u00A6', '\u00A8', '\u00AA', '\u00AC', '\u00AF', '\u00B0',
  '\u00B1', '\u00B2', '\u00B3', '\u00B4', '\u00B5', '\u00B7', '\u00B8', '\u00B9', '\u00BA', '\u00BC', '\u00BD', '\u00BE', '\u00D7', '\u00F7'
];

function sanitizeAscii(text, blocklist = '') {
  if (!text) return text;
  
  const badChars = [...DEFAULT_BAD, ...blocklist.split('')];
  const replacements = {
    '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
    '\u2026': '...', '\u2022': '*', '\u2122': '(TM)', '\u00A9': '(C)', '\u00AE': '(R)',
    '\u00A7': 'Section', '\u00B6': 'Para', '\u2020': '+', '\u2021': '++', '\u2030': '%o',
    '\u2039': '<', '\u203A': '>', '\u00AB': '<<', '\u00BB': '>>', '\u00A1': '!', '\u00BF': '?',
    '\u00A2': 'c', '\u00A3': 'L', '\u00A4': '$', '\u00A5': 'Y', '\u00A6': '|', '\u00A8': '"',
    '\u00AA': 'a', '\u00AC': '-', '\u00AF': '-', '\u00B0': 'deg', '\u00B1': '+/-', '\u00B2': '2',
    '\u00B3': '3', '\u00B4': "'", '\u00B5': 'u', '\u00B7': '.', '\u00B8': ',', '\u00B9': '1',
    '\u00BA': 'o', '\u00BC': '1/4', '\u00BD': '1/2', '\u00BE': '3/4', '\u00D7': 'x', '\u00F7': '/'
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
        overlay.style.left = ytro_position.left + 'px';
        overlay.style.top = ytro_position.top + 'px';
      }
      
      // Load preferences
      if (ytro_prefs) {
        setIf(elements.videoId, ytro_prefs.videoId);
        setIf(elements.langPrefs, ytro_prefs.langPrefs);
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
        
        // TTS settings
        setIf(elements.ttsEnabled, ytro_prefs.ttsEnabled, 'checked');
        setIf(elements.ttsProvider, ytro_prefs.ttsProvider);
        setIf(elements.ttsVoice, ytro_prefs.ttsVoice);
        setIf(elements.ttsFormat, ytro_prefs.ttsFormat);
        setIf(elements.azureRegion, ytro_prefs.azureRegion);
        setIf(elements.ttsRate, ytro_prefs.ttsRate);
        
        Object.assign(lastPrefs, ytro_prefs);
        syncProviderUI();
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
    anthropicVersion: elements.anthropicVersion.value,
    concurrency: parseInt(elements.concurrency.value) || 3,
    stylePreset: elements.stylePreset.value,
    promptTemplate: elements.promptTemplate.value,
    asciiOnly: elements.asciiOnly.checked,
    blocklist: elements.blocklist.value,
    
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
    anthropicVersion: elements.anthropicVersion.value,
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
    ttsRate: parseFloat(elements.ttsRate.value) || 1.0
  };
}

function loadPreset(preset) {
  if (!preset) return;
  
  setIf(elements.provider, preset.provider);
  setIf(elements.baseUrl, preset.baseUrl);
  setIf(elements.model, preset.model);
  setIf(elements.anthropicVersion, preset.anthropicVersion);
  setIf(elements.concurrency, preset.concurrency);
  setIf(elements.stylePreset, preset.stylePreset);
  setIf(elements.promptTemplate, preset.promptTemplate);
  setIf(elements.asciiOnly, preset.asciiOnly, 'checked');
  setIf(elements.blocklist, preset.blocklist);
  setIf(elements.langPrefs, preset.langPrefs);
  setIf(elements.outputLang, preset.outputLang);
  setIf(elements.customLang, preset.customLang);
  setIf(elements.ttsEnabled, preset.ttsEnabled, 'checked');
  setIf(elements.ttsProvider, preset.ttsProvider);
  setIf(elements.ttsVoice, preset.ttsVoice);
  setIf(elements.ttsFormat, preset.ttsFormat);
  setIf(elements.azureRegion, preset.azureRegion);
  setIf(elements.ttsRate, preset.ttsRate);
  
  syncProviderUI();
  syncTtsUI();
  savePrefs();
}

// Utility functions
function setStatus(msg, isError = false) {
  elements.status.textContent = msg;
  elements.status.className = `yt-status ${isError ? 'yt-error' : ''}`;
  log('Status:', msg);
}

function setError(msg) {
  setStatus(msg, true);
  logError(msg);
}

function parseTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(p => parseFloat(p) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
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

function mergeNearbySegments(segments, threshold = 0.25) {
  if (!segments || segments.length <= 1) return segments;
  
  const merged = [segments[0]];
  
  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];
    
    if (curr.start - prev.end <= threshold) {
      // Merge segments
      prev.end = curr.end;
      prev.text = (prev.text + ' ' + curr.text).replace(/\s+/g, ' ').trim();
    } else {
      merged.push(curr);
    }
  }
  
  return merged;
}

// Parsing functions
function parseVTT(vtt) {
  const segments = [];
  const lines = vtt.split('\n');
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip header and empty lines
    if (!line || line === 'WEBVTT' || line.startsWith('NOTE') || line.startsWith('STYLE')) {
      i++;
      continue;
    }
    
    // Check if this is a timestamp line
    if (line.includes(' --> ')) {
      const [startStr, endStr] = line.split(' --> ').map(s => s.trim());
      const start = parseTime(startStr);
      const end = parseTime(endStr);
      
      // Collect text lines until next timestamp or end
      const textLines = [];
      i++;
      while (i < lines.length && !lines[i].includes(' --> ') && lines[i].trim()) {
        // Remove VTT tags like <c.colorname>text</c>
        const cleanText = lines[i].replace(/<[^>]*>/g, '').trim();
        if (cleanText) textLines.push(cleanText);
        i++;
      }
      
      if (textLines.length > 0) {
        segments.push({
          start,
          end,
          text: textLines.join(' ').replace(/\s+/g, ' ').trim()
        });
      }
    } else {
      i++;
    }
  }
  
  return mergeNearbySegments(segments);
}

function parseSRV3(xml) {
  const segments = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const texts = doc.querySelectorAll('text');
  
  texts.forEach(textEl => {
    const start = parseFloat(textEl.getAttribute('start')) || 0;
    const dur = parseFloat(textEl.getAttribute('dur')) || 0;
    const end = start + dur;
    const text = textEl.textContent?.replace(/\s+/g, ' ').trim() || '';
    
    if (text) {
      segments.push({ start, end, text });
    }
  });
  
  return mergeNearbySegments(segments);
}

function parsePlainText(text) {
  // Simple fallback for plain text
  return [{
    start: 0,
    end: 0,
    text: text.trim()
  }];
}

// Rendering functions
function renderList(segments = transcriptData, searchTerm = '') {
  if (!Array.isArray(segments)) return;
  
  const filtered = searchTerm
    ? segments.filter(s => s.text?.toLowerCase().includes(searchTerm.toLowerCase()))
    : segments;
  
  elements.transcriptList.innerHTML = filtered.map((segment, i) => {
    const originalIndex = segments.indexOf(segment);
    const timeStr = segment.start ? formatTime(segment.start) : '';
    const restyled = segment.restyled || '';
    
    return `
      <div class="yt-transcript-item" data-index="${originalIndex}">
        <div class="yt-transcript-time">${timeStr}</div>
        <div class="yt-transcript-text">
          <div class="yt-original">${escapeHtml(segment.text)}</div>
          ${restyled ? `<div class="yt-restyled">${escapeHtml(restyled)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Prompt building
function buildPrompt(segment, index, segments) {
  let template = elements.promptTemplate.value || DEFAULT_PROMPT;
  
  const style = elements.stylePreset.value === 'custom' 
    ? 'as specified in the template'
    : elements.stylePreset.value.replace('-', ' ');
  
  const outLang = elements.outputLang.value === 'custom'
    ? elements.customLang.value || 'English'
    : elements.outputLang.value;
  
  // Get context
  const contextRadius = 2;
  const prevLines = segments
    .slice(Math.max(0, index - contextRadius), index)
    .map(s => s.text)
    .join('\n');
  const nextLines = segments
    .slice(index + 1, Math.min(segments.length, index + contextRadius + 1))
    .map(s => s.text)
    .join('\n');
  
  // Replace placeholders
  template = template
    .replaceAll('{{style}}', style)
    .replaceAll('{{outlang}}', outLang)
    .replaceAll('{{currentLine}}', segment.text)
    .replaceAll('{{prevLines}}', prevLines)
    .replaceAll('{{nextLines}}', nextLines);
  
  // Add ASCII-only instruction if enabled
  if (elements.asciiOnly.checked) {
    template += '\n\nIMPORTANT: Use only standard ASCII characters in your response. Avoid accented letters, special punctuation, or Unicode symbols.';
    if (elements.blocklist.value.trim()) {
      template += ` Also avoid these specific characters: ${elements.blocklist.value.trim()}`;
    }
  }
  
  return template;
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
  
  try {
    setStatus('Listing tracks...');
    const response = await sendMessage('LIST_TRACKS', { videoId });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    // Parse track list XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(response.data, 'text/xml');
    const tracks = doc.querySelectorAll('track');
    
    // Clear and populate track select
    elements.trackSelect.innerHTML = '<option value="">Select a track...</option>';
    
    // Sort tracks by language preference
    const langPrefs = elements.langPrefs.value.split(',').map(l => l.trim().toLowerCase());
    const trackArray = Array.from(tracks);
    
    trackArray.sort((a, b) => {
      const aLang = a.getAttribute('lang_code')?.toLowerCase() || '';
      const bLang = b.getAttribute('lang_code')?.toLowerCase() || '';
      const aIndex = langPrefs.indexOf(aLang);
      const bIndex = langPrefs.indexOf(bLang);
      
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return aLang.localeCompare(bLang);
    });
    
    trackArray.forEach(track => {
      const lang = track.getAttribute('lang_code') || '';
      const name = track.getAttribute('name') || '';
      const kind = track.getAttribute('kind') || '';
      
      // Create display label - fix encoding issues
      let label = lang;
      if (name) label += ` • ${name}`;
      if (kind) label += ` (${kind})`;
      
      const option = document.createElement('option');
      option.value = JSON.stringify({ lang, name, kind });
      option.textContent = label;
      elements.trackSelect.appendChild(option);
    });
    
    setStatus(`Found ${tracks.length} tracks in ${dur(start)}`);
    log(`Listed ${tracks.length} tracks`);
  } catch (error) {
    setError(`Failed to list tracks: ${error.message}`);
  }
}

// Transcript fetching
async function fetchTranscript() {
  const start = Date.now();
  const videoId = elements.videoId.value || detectVideoId();
  if (!videoId) return;
  
  let trackData = {};
  if (elements.trackSelect.value) {
    try {
      trackData = JSON.parse(elements.trackSelect.value);
    } catch (error) {
      logError('Invalid track selection:', error);
    }
  }
  
  try {
    setStatus('Fetching transcript...');
    const response = await sendMessage('FETCH_TRANSCRIPT', {
      videoId,
      lang: trackData.lang || 'en',
      name: trackData.name || ''
    });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    const { text, format } = response.data;
    log(`Received transcript: format=${format}, length=${text.length}`);
    
    // Parse based on format
    let segments = [];
    if (format === 'vtt') {
      segments = parseVTT(text);
    } else if (format === 'srv3') {
      segments = parseSRV3(text);
    } else {
      segments = parsePlainText(text);
    }
    
    transcriptData = segments;
    renderList();
    
    setStatus(`Transcript loaded: ${segments.length} segments in ${dur(start)}`);
    log(`Parsed ${segments.length} segments`);
  } catch (error) {
    setError(`Failed to fetch transcript: ${error.message}`);
  }
}

// LLM restyling

async function restyleAll() {
  if (!transcriptData.length) {
    setError('No transcript data loaded');
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
            setStatus(`Rate limited. Retrying segment ${index + 1} (attempt ${attemptNumber}/${totalAttempts})...`);
            consecutive429 += 1;

            if (consecutive429 >= GLOBAL_COOLDOWN_THRESHOLD) {
              globalPauseUntil = Date.now() + GLOBAL_COOLDOWN_MS;
              setStatus(`Rate limited. Cooling down for ${Math.round(GLOBAL_COOLDOWN_MS / 1000)}s...`);
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
      setStatus(`Restyle complete: ${completed}/${total} segments in ${duration}` + (errors > 0 ? `, ${errors} errors` : ''));
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
  
  let text = transcriptData.map(segment => {
    return segment.restyled || segment.text;
  }).join(' ');
  
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

  const text = gatherTranscriptText();
  if (!text) {
    setError('No transcript text available');
    return;
  }

  const provider = elements.ttsProvider.value;
  const format = (elements.ttsFormat.value || 'mp3').toLowerCase();

  try {
    setStatus('Generating TTS audio...');

    if (provider === 'browser') {
      generateBrowserTTS(text);
      return;
    }

    const data = {
      provider,
      format,
      text: text.substring(0, 4000),
      baseUrl: elements.baseUrl.value,
      apiKey: elements.apiKey.value
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
      const extension = (mime && mime.includes('/')) ? mime.split('/')[1] : format;
      a.download = `transcript-tts.${extension || 'mp3'}`;
      a.click();
    };

    setStatus('TTS audio generated successfully');
  } catch (error) {
    logError('TTS generation failed:', error);
    setError(`TTS failed: ${error.message}`);
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
  
  utterance.onstart = () => setStatus('Playing browser TTS...');
  utterance.onend = () => setStatus('Browser TTS completed');
  utterance.onerror = (e) => setError(`Browser TTS error: ${e.error}`);
  
  speechSynthesis.speak(utterance);
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
  
  const content = transcriptData.map(segment => {
    const text = segment.restyled || segment.text;
    return segment.start ? `[${formatTime(segment.start)}] ${text}` : text;
  }).join('\n');
  
  downloadText(content, 'transcript.txt');
  setStatus('TXT export completed');
}

function exportSRT() {
  if (!transcriptData.length) {
    setError('No transcript data to export');
    return;
  }
  
  const content = transcriptData.map((segment, i) => {
    const text = segment.restyled || segment.text;
    const start = formatSRTTime(segment.start || i * 3);
    const end = formatSRTTime(segment.end || (i * 3 + 3));
    
    return `${i + 1}\n${start} --> ${end}\n${text}\n`;
  }).join('\n');
  
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

    const startSeconds = typeof segment.start === 'number'
      ? segment.start
      : lastEnd;

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
    }).then(() => {
      setStatus(`Preset "${name}" saved`);
      rebuildPresetOptions();
    }).catch(logError);
  }
});

elements.exportPresetsBtn.addEventListener('click', () => {
  downloadText(JSON.stringify(window.ytPresets, null, 2), 'yt-presets.json', 'application/json');
});

elements.importPresetsBtn.addEventListener('click', () => {
  elements.importPresetsInput.click();
});

elements.importPresetsInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      Object.assign(window.ytPresets, imported);
      sendMessage('SET_PREFS', {
        prefs: { ytro_presets: window.ytPresets }
      }).then(() => {
        setStatus(`Imported ${Object.keys(imported).length} presets`);
        rebuildPresetOptions();
      }).catch(logError);
    } catch (error) {
      setError(`Failed to import presets: ${error.message}`);
    }
  };
  reader.readAsText(file);
});

elements.outputLang.addEventListener('change', () => {
  elements.customLang.style.display = 
    elements.outputLang.value === 'custom' ? 'block' : 'none';
  savePrefs();
});

elements.restyleBtn.addEventListener('click', restyleAll);
elements.stopBtn.addEventListener('click', stopRestyle);
elements.provider.addEventListener('change', syncProviderUI);

elements.ttsProvider.addEventListener('change', syncTtsUI);
elements.azureVoicesBtn.addEventListener('click', listAzureVoices);
elements.generateTtsBtn.addEventListener('click', generateTTS);

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
  elements.videoId, elements.langPrefs, elements.outputLang, elements.customLang,
  elements.provider, elements.baseUrl, elements.model, elements.anthropicVersion, elements.concurrency,
  elements.stylePreset, elements.promptTemplate, elements.asciiOnly, elements.blocklist,
  elements.ttsEnabled, elements.ttsProvider, elements.ttsVoice, elements.ttsFormat,
  elements.azureRegion, elements.ttsRate
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
let dragOffset = { x: 0, y: 0 };

document.querySelector('.yt-overlay-header').addEventListener('mousedown', (e) => {
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
  
  overlay.style.left = Math.max(0, Math.min(window.innerWidth - overlay.offsetWidth, x)) + 'px';
  overlay.style.top = Math.max(0, Math.min(window.innerHeight - overlay.offsetHeight, y)) + 'px';
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

// Navigation watcher to reset state
let lastUrl = location.href;
function checkNavigation() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    transcriptData = [];
    elements.transcriptList.innerHTML = '';
    elements.trackSelect.innerHTML = '<option value="">Select a track...</option>';
    detectVideoId();
    log('Navigation detected, state reset');
  }
}

setInterval(checkNavigation, 1000);

// Load browser voices when available
if (window.speechSynthesis) {
  speechSynthesis.addEventListener('voiceschanged', listBrowserVoices);
  // Initial load
  setTimeout(listBrowserVoices, 100);
}

// Initialize
loadPrefs().then(() => {
  detectVideoId();
  log('Transcript Styler initialized');
}).catch(logError);

} // End YouTube check
