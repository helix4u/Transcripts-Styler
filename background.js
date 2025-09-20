// Transcript Styler - Background Service Worker
// v0.4.0-test with comprehensive logging and debug features

// Global debug state
let DEBUG_ENABLED = false;

// Logging utilities with key redaction
function redact(str) {
  if (!str || typeof str !== 'string') return str;
  if (str.length <= 8) return '***';
  return str.substring(0, 4) + '***' + str.substring(str.length - 4);
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

function log(...args) {
  if (DEBUG_ENABLED) {
    console.log('[TS-BG]', ...args);
  }
}

function logError(...args) {
  console.error('[TS-BG-ERROR]', ...args);
}

// Utility functions
function slashTrim(s) {
  return s?.replace(/\/+$/, '') || '';
}

function pickMime(response) {
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('audio/mpeg') || ct.includes('audio/mp3')) return 'audio/mpeg';
  if (ct.includes('audio/wav') || ct.includes('audio/wave')) return 'audio/wav';
  if (ct.includes('audio/ogg')) return 'audio/ogg';
  if (ct.includes('audio/webm')) return 'audio/webm';
  return 'audio/mpeg'; // fallback
}

async function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ASCII sanitization for OpenAI logit bias
// Note: Character list reconstructed from corrupted source - may need refinement
const STR_KEYS = [
  'â', 'ã', 'ä', 'å', 'æ', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï',
  'ð', 'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', 'ø', 'ù', 'ú', 'û', 'ü', 'ý', 'þ',
  'ÿ', 'À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Æ', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì',
  'Í', 'Î', 'Ï', 'Ð', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ø', 'Ù', 'Ú', 'Û',
  'Ü', 'Ý', 'Þ', '\u2013', '\u2014', '\u2018', '\u2019', '\u201C', '\u201D', '\u2026', '\u2022', '\u2122', '\u00A9', '\u00AE', '\u00A7',
  '\u00B6', '\u2020', '\u2021', '\u2030', '\u2039', '\u203A', '\u00AB', '\u00BB', '\u00A1', '\u00BF', '\u00A2', '\u00A3', '\u00A4', '\u00A5', '\u00A6',
  '\u00A8', '\u00A9', '\u00AA', '\u00AC', '\u00AE', '\u00AF', '\u00B0', '\u00B1', '\u00B2', '\u00B3', '\u00B4', '\u00B5', '\u00B6', '\u00B7', '\u00B8',
  '\u00B9', '\u00BA', '\u00BB', '\u00BC', '\u00BD', '\u00BE', '\u00BF', '\u00D7', '\u00F7'
];

function openaiAsciiLogitBias(asciiOnly) {
  if (!asciiOnly) return undefined;
  const bias = {};
  STR_KEYS.forEach(char => {
    bias[char] = -100;
  });
  return bias;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, data } = message;
  log(`Received message: ${action}`, data ? Object.keys(data) : 'no data');

  switch (action) {
    case 'LIST_TRACKS':
      handleListTracks(data, sendResponse);
      return true; // async response

    case 'FETCH_TRANSCRIPT':
      handleFetchTranscript(data, sendResponse);
      return true; // async response

    case 'LLM_CALL':
      handleLLMCall(data, sendResponse);
      return true; // async response

    case 'TTS_SPEAK':
      handleTTSSpeak(data, sendResponse);
      return true; // async response

    case 'TTS_AZURE_VOICES':
      handleAzureVoices(data, sendResponse);
      return true; // async response

    case 'GET_PREFS':
      handleGetPrefs(data, sendResponse);
      return true; // async response

    case 'SET_PREFS':
      handleSetPrefs(data, sendResponse);
      return true; // async response

    default:
      log(`Unknown action: ${action}`);
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
});

// Track listing handler
async function handleListTracks(data, sendResponse) {
  const start = Date.now();
  try {
    const { videoId } = data;
    if (!videoId) {
      throw new Error('Video ID required');
    }

    log(`Listing tracks for video: ${videoId}`);
    
    const url = `https://video.google.com/timedtext?type=list&v=${videoId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();
    log(`Track list fetched in ${Date.now() - start}ms, length: ${xml.length}`);
    
    sendResponse({ success: true, data: xml });
  } catch (error) {
    logError('LIST_TRACKS failed:', error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// Transcript fetching handler
async function handleFetchTranscript(data, sendResponse) {
  const start = Date.now();
  try {
    const { videoId, lang = 'en', name = '' } = data;
    if (!videoId) {
      throw new Error('Video ID required');
    }

    log(`Fetching transcript: video=${videoId}, lang=${lang}, name=${name}`);

    // Try VTT format first
    let url = `https://video.google.com/timedtext?lang=${encodeURIComponent(lang)}&v=${videoId}&fmt=vtt`;
    if (name) {
      url += `&name=${encodeURIComponent(name)}`;
    }

    let response = await fetch(url);
    let format = 'vtt';

    // Fallback to SRV3 XML if VTT fails
    if (!response.ok) {
      log(`VTT failed (${response.status}), trying SRV3 XML`);
      url = `https://video.google.com/timedtext?lang=${encodeURIComponent(lang)}&v=${videoId}&fmt=srv3`;
      if (name) {
        url += `&name=${encodeURIComponent(name)}`;
      }
      response = await fetch(url);
      format = 'srv3';
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    log(`Transcript fetched in ${Date.now() - start}ms, format: ${format}, length: ${text.length}`);
    
    sendResponse({ success: true, data: { text, format } });
  } catch (error) {
    logError('FETCH_TRANSCRIPT failed:', error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// LLM call handler
async function handleLLMCall(data, sendResponse) {
  const start = Date.now();
  try {
    const { provider, baseUrl, apiKey, model, systemPrompt, userPrompt, asciiOnly = false } = data;
    
    if (!provider || !baseUrl || !apiKey || !model || !userPrompt) {
      throw new Error('Missing required parameters');
    }

    log(`LLM call: provider=${provider}, model=${model}, baseUrl=${safeUrl(baseUrl)}, asciiOnly=${asciiOnly}`);

    let response;
    
    switch (provider) {
      case 'openai':
        response = await callOpenAI(baseUrl, apiKey, model, systemPrompt, userPrompt, asciiOnly);
        break;
        
      case 'anthropic':
        response = await callAnthropic(baseUrl, apiKey, model, systemPrompt, userPrompt);
        break;
        
      case 'openai-compatible':
        response = await callOpenAICompatible(baseUrl, apiKey, model, systemPrompt, userPrompt, asciiOnly);
        break;
        
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    log(`LLM call completed in ${Date.now() - start}ms`);
    sendResponse({ success: true, data: response });
  } catch (error) {
    logError('LLM_CALL failed:', error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// OpenAI API call
async function callOpenAI(baseUrl, apiKey, model, systemPrompt, userPrompt, asciiOnly) {
  const url = `${slashTrim(baseUrl)}/v1/chat/completions`;
  
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const body = {
    model,
    messages,
    max_tokens: 1000,
    temperature: 0.7
  };

  // Add logit bias for ASCII-only mode
  const logitBias = openaiAsciiLogitBias(asciiOnly);
  if (logitBias) {
    body.logit_bias = logitBias;
    log(`Applied ASCII logit bias with ${Object.keys(logitBias).length} entries`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || 'No response';
}

// Anthropic API call
async function callAnthropic(baseUrl, apiKey, model, systemPrompt, userPrompt) {
  const url = `${slashTrim(baseUrl)}/v1/messages`;
  
  const body = {
    model,
    max_tokens: 1000,
    messages: [{ role: 'user', content: userPrompt }]
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return result.content?.[0]?.text || 'No response';
}

// OpenAI-compatible API call
async function callOpenAICompatible(baseUrl, apiKey, model, systemPrompt, userPrompt, asciiOnly) {
  const url = `${slashTrim(baseUrl)}/v1/chat/completions`;
  
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const body = {
    model,
    messages,
    max_tokens: 1000,
    temperature: 0.7
  };

  // Some providers may support logit_bias
  const logitBias = openaiAsciiLogitBias(asciiOnly);
  if (logitBias) {
    body.logit_bias = logitBias;
    log(`Applied ASCII logit bias to OpenAI-compatible provider`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || 'No response';
}

// TTS handler
async function handleTTSSpeak(data, sendResponse) {
  const start = Date.now();
  try {
    const { provider, text, voice, baseUrl, apiKey, azureRegion } = data;
    
    if (!provider || !text) {
      throw new Error('Provider and text required');
    }

    log(`TTS request: provider=${provider}, voice=${voice || 'default'}, textLength=${text.length}`);

    let result;
    
    switch (provider) {
      case 'openai':
        result = await ttsOpenAI(baseUrl, apiKey, text, voice);
        break;
        
      case 'openai-compatible':
        result = await ttsOpenAICompatible(baseUrl, apiKey, text, voice);
        break;
        
      case 'kokoro':
        result = await ttsKokoro(baseUrl, text, voice);
        break;
        
      case 'azure':
        result = await ttsAzure(apiKey, azureRegion, text, voice);
        break;
        
      default:
        throw new Error(`Unsupported TTS provider: ${provider}`);
    }

    log(`TTS completed in ${Date.now() - start}ms, audioSize=${result.audioData?.length || 0}`);
    sendResponse({ success: true, data: result });
  } catch (error) {
    logError('TTS_SPEAK failed:', error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// OpenAI TTS
async function ttsOpenAI(baseUrl, apiKey, text, voice = 'alloy') {
  const url = `${slashTrim(baseUrl)}/v1/audio/speech`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS error: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = await arrayBufferToBase64(arrayBuffer);
  const mime = pickMime(response);

  return { audioData: base64, mime };
}

// OpenAI-compatible TTS
async function ttsOpenAICompatible(baseUrl, apiKey, text, voice = 'default') {
  const url = `${slashTrim(baseUrl)}/v1/audio/speech`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS API error: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = await arrayBufferToBase64(arrayBuffer);
  const mime = pickMime(response);

  return { audioData: base64, mime };
}

// Kokoro FastAPI TTS
async function ttsKokoro(baseUrl, text, voice) {
  const url = `${slashTrim(baseUrl)}/tts`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text,
      voice: voice || 'default',
      lang: 'en'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kokoro TTS error: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = await arrayBufferToBase64(arrayBuffer);
  const mime = pickMime(response);

  return { audioData: base64, mime };
}

// Azure TTS
async function ttsAzure(apiKey, region, text, voice = 'en-US-AriaNeural') {
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  
  const ssml = `
    <speak version='1.0' xml:lang='en-US'>
      <voice name='${voice}'>${text.replace(/[<>&'"]/g, (m) => {
        const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
        return map[m];
      })}</voice>
    </speak>
  `;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
    },
    body: ssml
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure TTS error: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = await arrayBufferToBase64(arrayBuffer);

  return { audioData: base64, mime: 'audio/mpeg' };
}

// Azure voices handler
async function handleAzureVoices(data, sendResponse) {
  const start = Date.now();
  try {
    const { apiKey, azureRegion } = data;
    
    if (!apiKey || !azureRegion) {
      throw new Error('API key and region required');
    }

    log(`Fetching Azure voices for region: ${azureRegion}`);
    
    const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
    
    const response = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const voices = await response.json();
    log(`Fetched ${voices.length} Azure voices in ${Date.now() - start}ms`);
    
    sendResponse({ success: true, data: voices });
  } catch (error) {
    logError('TTS_AZURE_VOICES failed:', error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// Preferences handlers
async function handleGetPrefs(data, sendResponse) {
  try {
    const { keys } = data;
    const result = await chrome.storage.local.get(keys);
    
    // Check for debug flag
    if (result.ytro_debug !== undefined) {
      DEBUG_ENABLED = result.ytro_debug;
      log(`Debug mode ${DEBUG_ENABLED ? 'enabled' : 'disabled'}`);
    }
    
    sendResponse({ success: true, data: result });
  } catch (error) {
    logError('GET_PREFS failed:', error.message);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSetPrefs(data, sendResponse) {
  try {
    const { prefs } = data;
    await chrome.storage.local.set(prefs);
    
    // Update debug flag if present
    if (prefs.ytro_debug !== undefined) {
      DEBUG_ENABLED = prefs.ytro_debug;
      log(`Debug mode ${DEBUG_ENABLED ? 'enabled' : 'disabled'}`);
    }
    
    log('Preferences saved:', Object.keys(prefs));
    sendResponse({ success: true });
  } catch (error) {
    logError('SET_PREFS failed:', error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// Initialize debug state on startup
chrome.storage.local.get(['ytro_debug']).then(result => {
  DEBUG_ENABLED = result.ytro_debug || false;
  log('Background service worker initialized, debug:', DEBUG_ENABLED);
});

log('Transcript Styler background script loaded');
