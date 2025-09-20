// Transcript Styler - Background Service Worker
// v0.4.0-test with comprehensive logging and debug features

// Global debug state
let DEBUG_ENABLED = false;

// Logging utilities

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
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fetchWithCreds(url, options = {}) {
  return fetch(url, { credentials: 'include', ...options });
}

const abortControllers = new Map();
const batchControllers = new Map();
const requestToBatch = new Map();

function registerAbortController(batchId, requestId) {
  const controller = new AbortController();
  if (requestId) {
    abortControllers.set(requestId, controller);
    if (batchId) {
      let set = batchControllers.get(batchId);
      if (!set) {
        set = new Set();
        batchControllers.set(batchId, set);
      }
      set.add(requestId);
      requestToBatch.set(requestId, batchId);
    }
  }
  return controller;
}

function releaseAbortController(requestId) {
  if (!requestId) return;
  const controller = abortControllers.get(requestId);
  if (!controller) return;
  abortControllers.delete(requestId);
  const batchId = requestToBatch.get(requestId);
  requestToBatch.delete(requestId);
  if (batchId) {
    const set = batchControllers.get(batchId);
    if (set) {
      set.delete(requestId);
      if (set.size === 0) {
        batchControllers.delete(batchId);
      }
    }
  }
}

function abortByRequestId(requestId) {
  const controller = abortControllers.get(requestId);
  if (!controller) return false;
  controller.abort();
  releaseAbortController(requestId);
  return true;
}

function abortBatch(batchId) {
  const set = batchControllers.get(batchId);
  if (!set) return 0;
  const requestIds = Array.from(set);
  let count = 0;
  requestIds.forEach(id => {
    if (abortByRequestId(id)) {
      count += 1;
    }
  });
  return count;
}

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

function handleAbortRequests(data, sendResponse) {
  const payload = data || {};
  const { batchId, requestIds = [] } = payload;
  let aborted = 0;

  if (Array.isArray(requestIds)) {
    requestIds.forEach(id => {
      if (abortByRequestId(id)) {
        aborted += 1;
      }
    });
  }

  if (batchId) {
    aborted += abortBatch(batchId);
  }

  log(`Abort requested: batch=${batchId || 'none'}, aborted=${aborted}`);
  sendResponse({ success: true, aborted });
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

    case 'ABORT_REQUESTS':
      handleAbortRequests(data, sendResponse);
      return false;

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

    const endpoints = [
      `https://video.google.com/timedtext?type=list&v=${videoId}`,
      `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`,
      // Additional fallback with different parameters
      `https://video.google.com/timedtext?type=list&v=${videoId}&hl=en`,
      `https://www.youtube.com/api/timedtext?type=list&v=${videoId}&hl=en`
    ];

    let xml = null;
    let lastStatus = null;

    for (const endpoint of endpoints) {
      log(`Trying track list endpoint: ${endpoint}`);
      const response = await fetchWithCreds(endpoint);
      lastStatus = `${response.status} ${response.statusText}`;
      log(`Track list response: ${lastStatus}`);
      if (!response.ok) {
        log(`Track list request to ${endpoint} failed: ${lastStatus}`);
        continue;
      }
      const text = await response.text();
      log(`Track list response length: ${text.length}`);
      if (!text.trim()) {
        log(`Track list response from ${endpoint} was empty`);
        continue;
      }
      xml = text;
      log(`Successfully retrieved track list from ${endpoint}`);
      break;
    }

    if (!xml) {
      log('No caption list available from timedtext endpoints');
      sendResponse({ success: true, data: '<trackList></trackList>' });
      return;
    }

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
    const { videoId, lang = 'en', name = '', baseUrl = '' } = data;
    if (!videoId && !baseUrl) {
      throw new Error('Video ID required');
    }

    log(`=== FETCH_TRANSCRIPT START ===`);
    log(`Input data:`, { videoId, lang, name, baseUrl: baseUrl ? 'present' : 'empty' });
    log(
      `Fetching transcript: video=${videoId || 'n/a'}, lang=${lang}, name=${name}, baseUrl=${baseUrl ? 'inline' : 'timedtext'}`
    );

    const attemptCaptionFetch = async (urlString, formatHint) => {
      log(`Attempting to fetch: ${urlString} (format hint: ${formatHint})`);
      const response = await fetchWithCreds(urlString);
      log(`Response status: ${response.status} ${response.statusText}`);
      if (!response.ok) {
        log(`Caption fetch failed (${response.status} ${response.statusText}) for ${urlString}`);
        return null;
      }
      const text = await response.text();
      log(`Response length: ${text.length} characters`);
      if (!text.trim()) {
        log('Caption response empty');
        return null;
      }
      const inferredFormat = formatHint || inferFormatFromUrl(urlString);
      log(`Successfully fetched transcript, format: ${inferredFormat}`);
      return {
        text,
        format: inferredFormat
      };
    };

    const inferFormatFromUrl = urlString => {
      try {
        const fmt = new URL(urlString).searchParams.get('fmt');
        if (fmt) {
          return fmt.toLowerCase();
        }
      } catch (error) {
        logError('Failed to infer format from URL', error.message);
      }
      return 'vtt';
    };

    let transcript = null;

    if (baseUrl) {
      log(`Using baseUrl approach`);
      const decodedUrl = baseUrl.replace(/\u0026/g, '&');
      log(`Decoded baseUrl: ${decodedUrl}`);
      const candidates = [];
      try {
        const urlObj = new URL(decodedUrl);
        const currentFmt = (urlObj.searchParams.get('fmt') || '').toLowerCase();
        log(`Current fmt from baseUrl: ${currentFmt}`);
        const pushCandidate = (fmt, label) => {
          const clone = new URL(urlObj);
          if (fmt === null) {
            clone.searchParams.delete('fmt');
          } else if (fmt) {
            clone.searchParams.set('fmt', fmt);
          }
          const tag = label || fmt || currentFmt || 'vtt';
          candidates.push({ url: clone.toString(), format: tag });
        };

        if (currentFmt === 'vtt') {
          pushCandidate('vtt', 'vtt');
          pushCandidate('json3', 'json3');
        } else {
          pushCandidate('vtt', 'vtt');
          pushCandidate('json3', 'json3');
          if (currentFmt && currentFmt !== 'vtt') {
            pushCandidate(currentFmt, currentFmt);
          }
          pushCandidate('srv3', 'srv3');
          pushCandidate(null, 'ttml');
        }
        log(`Generated ${candidates.length} candidate URLs from baseUrl`);
      } catch (error) {
        logError('Failed to construct caption URLs from baseUrl', error.message);
        candidates.push({ url: decodedUrl, format: 'vtt' });
      }

      for (const candidate of candidates) {
        log(`Trying candidate: ${candidate.url} (format: ${candidate.format})`);
        transcript = await attemptCaptionFetch(candidate.url, candidate.format);
        if (transcript) {
          log(`Caption fetched via baseUrl using fmt=${candidate.format}`);
          break;
        }
      }
    }

    if (!transcript) {
      log(`BaseUrl approach failed, using fallback timedtext approach`);
      if (!videoId) {
        throw new Error('Unable to fetch transcript with provided data');
      }

      // Multiple fallback endpoints and formats with different parameter orders
      const endpointConfigs = [
        {
          base: 'https://video.google.com/timedtext',
          formats: ['vtt', 'srv3', 'json3'],
          paramOrder: ['lang', 'v', 'fmt', 'name']
        },
        {
          base: 'https://www.youtube.com/api/timedtext',
          formats: ['vtt', 'srv3', 'json3'],
          paramOrder: ['lang', 'v', 'fmt', 'name']
        },
        // Try different parameter orders that YouTube might expect
        {
          base: 'https://video.google.com/timedtext',
          formats: ['vtt', 'srv3', 'json3'],
          paramOrder: ['v', 'lang', 'fmt', 'name']
        },
        {
          base: 'https://www.youtube.com/api/timedtext',
          formats: ['vtt', 'srv3', 'json3'],
          paramOrder: ['v', 'lang', 'fmt', 'name']
        },
        // Try without fmt parameter (some endpoints might default to a format)
        {
          base: 'https://video.google.com/timedtext',
          formats: [null], // null means no fmt parameter
          paramOrder: ['lang', 'v', 'name']
        },
        {
          base: 'https://www.youtube.com/api/timedtext',
          formats: [null],
          paramOrder: ['lang', 'v', 'name']
        }
      ];

      const buildUrl = (config, fmt) => {
        const params = [];
        for (const param of config.paramOrder) {
          if (param === 'v') {
            params.push(`${param}=${encodeURIComponent(videoId)}`);
          } else if (param === 'lang') {
            params.push(`${param}=${encodeURIComponent(lang)}`);
          } else if (param === 'fmt' && fmt) {
            params.push(`${param}=${encodeURIComponent(fmt)}`);
          } else if (param === 'name' && name) {
            params.push(`${param}=${encodeURIComponent(name)}`);
          }
        }
        return `${config.base}?${params.join('&')}`;
      };

      for (const config of endpointConfigs) {
        for (const fmt of config.formats) {
          const url = buildUrl(config, fmt);
          log(`Trying endpoint: ${url}`);

          try {
            const response = await fetchWithCreds(url, {
              method: 'GET',
              headers: {
                Accept: '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache'
              }
            });
            log(`Response: ${response.status} ${response.statusText}`);

            if (response.ok) {
              const text = await response.text();
              log(`Response content length: ${text.length}`);
              if (text.trim()) {
                log(
                  `Success! Retrieved ${text.length} characters using ${config.base} with fmt=${fmt || 'none'}`
                );
                transcript = { text, format: fmt || 'vtt' };
                break;
              } else {
                log(`Empty response from ${config.base} with fmt=${fmt || 'none'}`);
              }
            } else {
              log(
                `Failed with ${config.base} fmt=${fmt || 'none'}: ${response.status} ${response.statusText}`
              );
            }
          } catch (fetchError) {
            log(`Network error with ${config.base}: ${fetchError.message}`);
          }
        }
        if (transcript) break;
      }

      if (!transcript) {
        log(`All fallback attempts failed - trying alternative approaches`);

        // Try a few more desperate attempts
        const desperateEndpoints = [
          // Try without any format specification
          `https://video.google.com/timedtext?v=${videoId}&lang=${encodeURIComponent(lang)}`,
          `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${encodeURIComponent(lang)}`,
          // Try with different language codes
          `https://video.google.com/timedtext?v=${videoId}&lang=en`,
          `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
          // Try with minimal parameters
          `https://video.google.com/timedtext?v=${videoId}`,
          `https://www.youtube.com/api/timedtext?v=${videoId}`
        ];

        for (const url of desperateEndpoints) {
          log(`Desperate attempt: ${url}`);
          try {
            const response = await fetchWithCreds(url, {
              method: 'GET',
              headers: {
                Accept: '*/*',
                'Accept-Language': 'en-US,en;q=0.9'
              }
            });

            log(`Desperate response: ${response.status} ${response.statusText}`);

            if (response.ok) {
              const text = await response.text();
              if (text.trim() && text.length > 10) {
                // More than just whitespace
                log(`Desperate success! Retrieved ${text.length} characters from ${url}`);
                transcript = { text, format: 'vtt' }; // Assume VTT format
                break;
              } else {
                log(`Desperate attempt returned empty or minimal content`);
              }
            }
          } catch (error) {
            log(`Desperate attempt failed: ${error.message}`);
          }
        }

        if (!transcript) {
          log(`All attempts failed including desperate measures`);
          throw new Error(
            'Unable to fetch transcript from any endpoint. Check debug logs for detailed error information.'
          );
        }
      }
    }

    log(`Transcript fetched in ${Date.now() - start}ms, format: ${transcript.format}`);
    log(`=== FETCH_TRANSCRIPT SUCCESS ===`);

    sendResponse({ success: true, data: transcript });
  } catch (error) {
    logError('FETCH_TRANSCRIPT failed:', error.message);
    log(`=== FETCH_TRANSCRIPT FAILED ===`);
    sendResponse({ success: false, error: error.message });
  }
}

// LLM call handler

async function handleLLMCall(data, sendResponse) {
  const start = Date.now();
  const {
    provider,
    baseUrl,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    asciiOnly = false,
    requestId,
    batchId,
    anthropicVersion
  } = data;
  const controller = registerAbortController(batchId, requestId);

  try {
    if (!provider || !baseUrl || !apiKey || !model || !userPrompt) {
      throw new Error('Missing required parameters');
    }

    log(
      `LLM call: provider=${provider}, model=${model}, baseUrl=${safeUrl(baseUrl)}, asciiOnly=${asciiOnly}`
    );

    let response;

    switch (provider) {
      case 'openai':
        response = await callOpenAI(
          baseUrl,
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          asciiOnly,
          controller.signal
        );
        break;

      case 'anthropic':
        response = await callAnthropic(
          baseUrl,
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          anthropicVersion || DEFAULT_ANTHROPIC_VERSION,
          controller.signal
        );
        break;

      case 'openai-compatible':
        response = await callOpenAICompatible(
          baseUrl,
          apiKey,
          model,
          systemPrompt,
          userPrompt,
          asciiOnly,
          controller.signal
        );
        break;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    log(`LLM call completed in ${Date.now() - start}ms`);
    sendResponse({ success: true, data: response });
  } catch (error) {
    if (error.name === 'AbortError') {
      log(`LLM call aborted for request ${requestId || 'n/a'}`);
      sendResponse({ success: false, error: 'Request aborted', aborted: true });
    } else {
      logError('LLM_CALL failed:', error.message);
      sendResponse({ success: false, error: error.message });
    }
  } finally {
    releaseAbortController(requestId);
  }
}

// OpenAI API call

async function callOpenAI(baseUrl, apiKey, model, systemPrompt, userPrompt, asciiOnly, signal) {
  const url = `${slashTrim(baseUrl)}/v1/chat/completions`;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  if (asciiOnly) {
    log('ASCII-only mode active via prompt constraints for OpenAI');
  }

  const body = {
    model,
    messages,
    max_tokens: 1000,
    temperature: 0.7
  };

  const response = await fetchWithCreds(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || 'No response';
}

// Anthropic API call

async function callAnthropic(baseUrl, apiKey, model, systemPrompt, userPrompt, version, signal) {
  const url = `${slashTrim(baseUrl)}/v1/messages`;
  const resolvedVersion = version || DEFAULT_ANTHROPIC_VERSION;
  log(`Anthropic call using version ${resolvedVersion}`);

  const body = {
    model,
    max_output_tokens: 1000,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: userPrompt }]
      }
    ]
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetchWithCreds(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': resolvedVersion
    },
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const textParts = (result.content || [])
    .filter(part => part.type === 'text' && part.text)
    .map(part => part.text.trim())
    .filter(Boolean);

  return textParts.join('\n').trim() || 'No response';
}

// OpenAI-compatible API call

async function callOpenAICompatible(
  baseUrl,
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  asciiOnly,
  signal
) {
  const url = `${slashTrim(baseUrl)}/v1/chat/completions`;

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  if (asciiOnly) {
    log('ASCII-only mode active via prompt constraints for OpenAI-compatible provider');
  }

  const body = {
    model,
    messages,
    max_tokens: 1000,
    temperature: 0.7
  };

  const response = await fetchWithCreds(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI-compatible API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || 'No response';
}

// TTS handler

async function handleTTSSpeak(data, sendResponse) {
  const start = Date.now();
  const {
    provider,
    text,
    voice,
    baseUrl,
    apiKey,
    azureRegion,
    format = 'mp3',
    requestId,
    batchId
  } = data;
  const controller = registerAbortController(batchId, requestId);

  try {
    if (!provider || !text) {
      throw new Error('Provider and text required');
    }

    log(
      `TTS request: provider=${provider}, voice=${voice || 'default'}, format=${format}, textLength=${text.length}`
    );

    let result;

    switch (provider) {
      case 'openai':
        result = await ttsOpenAI(baseUrl, apiKey, text, voice, format, controller.signal);
        break;

      case 'openai-compatible':
        result = await ttsOpenAICompatible(baseUrl, apiKey, text, voice, format, controller.signal);
        break;

      case 'kokoro':
        result = await ttsKokoro(baseUrl, text, voice, controller.signal);
        break;

      case 'azure':
        result = await ttsAzure(apiKey, azureRegion, text, voice, format, controller.signal);
        break;

      default:
        throw new Error(`Unsupported TTS provider: ${provider}`);
    }

    log(`TTS completed in ${Date.now() - start}ms, audioSize=${result.audioData?.length || 0}`);
    sendResponse({ success: true, data: result });
  } catch (error) {
    if (error.name === 'AbortError') {
      log(`TTS request aborted for ${requestId || 'n/a'}`);
      sendResponse({ success: false, error: 'Request aborted', aborted: true });
    } else {
      logError('TTS_SPEAK failed:', error.message);
      sendResponse({ success: false, error: error.message });
    }
  } finally {
    releaseAbortController(requestId);
  }
}

// OpenAI TTS

async function ttsOpenAI(baseUrl, apiKey, text, voice = 'alloy', format = 'mp3', signal) {
  const url = `${slashTrim(baseUrl)}/v1/audio/speech`;
  const normalizedFormat = (format || 'mp3').toLowerCase();
  const responseFormatMap = {
    mp3: 'mp3',
    wav: 'wav',
    ogg: 'ogg'
  };
  const responseFormat = responseFormatMap[normalizedFormat] || 'mp3';
  const fallbackMimeMap = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg'
  };
  const fallbackMime = fallbackMimeMap[normalizedFormat] || 'audio/mpeg';

  const response = await fetchWithCreds(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice || 'alloy',
      response_format: responseFormat
    }),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS error: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = await arrayBufferToBase64(arrayBuffer);
  const mime = pickMime(response) || fallbackMime;

  return { audioData: base64, mime };
}

// OpenAI-compatible TTS

async function ttsOpenAICompatible(
  baseUrl,
  apiKey,
  text,
  voice = 'default',
  format = 'mp3',
  signal
) {
  const url = `${slashTrim(baseUrl)}/v1/audio/speech`;
  const normalizedFormat = (format || 'mp3').toLowerCase();
  const responseFormatMap = {
    mp3: 'mp3',
    wav: 'wav',
    ogg: 'ogg'
  };
  const responseFormat = responseFormatMap[normalizedFormat] || 'mp3';
  const fallbackMimeMap = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg'
  };
  const fallbackMime = fallbackMimeMap[normalizedFormat] || 'audio/mpeg';

  const response = await fetchWithCreds(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice || 'default',
      response_format: responseFormat
    }),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI-compatible TTS error: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = await arrayBufferToBase64(arrayBuffer);
  const mime = pickMime(response) || fallbackMime;

  return { audioData: base64, mime };
}

// Kokoro FastAPI TTS

async function ttsKokoro(baseUrl, text, voice, signal) {
  const url = `${slashTrim(baseUrl)}/tts`;

  const response = await fetchWithCreds(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      voice: voice || 'default',
      lang: 'en'
    }),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kokoro TTS error: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = await arrayBufferToBase64(arrayBuffer);
  const mime = pickMime(response) || 'audio/mpeg';

  return { audioData: base64, mime };
}

// Azure TTS

async function ttsAzure(apiKey, region, text, voice = 'en-US-AriaNeural', format = 'mp3', signal) {
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const normalizedFormat = (format || 'mp3').toLowerCase();
  const outputFormatMap = {
    mp3: 'audio-16khz-128kbitrate-mono-mp3',
    wav: 'riff-16khz-16bit-mono-pcm',
    ogg: 'ogg-48khz-64kbit-mono-opus'
  };
  const headerFormat = outputFormatMap[normalizedFormat] || outputFormatMap.mp3;
  const fallbackMimeMap = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg'
  };
  const fallbackMime = fallbackMimeMap[normalizedFormat] || fallbackMimeMap.mp3;

  const ssml = `
    <speak version='1.0' xml:lang='en-US'>
      <voice name='${voice}'>${text.replace(/[<>&'"]/g, m => {
        const map = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
        return map[m];
      })}</voice>
    </speak>
  `;

  const response = await fetchWithCreds(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': headerFormat
    },
    body: ssml,
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure TTS error: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = await arrayBufferToBase64(arrayBuffer);
  const mime = pickMime(response) || fallbackMime;

  return { audioData: base64, mime };
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

    const response = await fetchWithCreds(url, {
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
