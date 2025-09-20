/**
 * background.js (TEST BUILD)
 * Service worker for cross-origin fetches (timedtext, LLM, TTS)
 * Provides compact logging with optional debug mode.
 * NOTE: Do not persist API keys; keep them in the content script only.
 */

const BG_LOG_PREFIX = '[yt-restyle/bg]';
let BG_DEBUG = false; // flipped when ytro_debug flag stored

const bglog = {
  info: (...args) => console.log(BG_LOG_PREFIX, ...args),
  warn: (...args) => console.warn(BG_LOG_PREFIX, ...args),
  error: (...args) => console.error(BG_LOG_PREFIX, ...args),
  debug: (...args) => { if (BG_DEBUG) console.debug(BG_LOG_PREFIX, ...args); }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  (async () => {
    const t0 = performance.now();
    try {
      // -------- Timedtext --------
      if (msg.type === 'LIST_TRACKS') {
        bglog.debug('LIST_TRACKS', { videoId: msg.videoId });
        const listUrl = `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(msg.videoId)}`;
        const text = await fetchText(listUrl);
        bglog.info('LIST_TRACKS ok', dur(t0));
        sendResponse({ ok: true, text });
        return;
      }

      if (msg.type === 'FETCH_TRANSCRIPT') {
        const { videoId, lang } = msg;
        bglog.debug('FETCH_TRANSCRIPT', { videoId, lang });
        const base = `https://video.google.com/timedtext?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(videoId)}`;
        try {
          const vtt = await fetchText(base + '&fmt=vtt');
          if (vtt.trim().includes('WEBVTT')) {
            bglog.info('FETCH_TRANSCRIPT vtt', dur(t0));
            sendResponse({ ok: true, kind: 'vtt', text: vtt });
            return;
          }
        } catch (err) {
          bglog.debug('FETCH_TRANSCRIPT vtt fallback', String(err));
        }
        const xml = await fetchText(base + '&fmt=srv3');
        bglog.info('FETCH_TRANSCRIPT srv3', dur(t0));
        sendResponse({ ok: true, kind: 'srv3', text: xml });
        return;
      }

      // -------- LLM calls --------
      if (msg.type === 'LLM_CALL') {
        const { provider, model, apiKey, baseUrl, temperature, maxTokens, prompt, asciiOnly } = msg.payload || {};
        bglog.debug('LLM_CALL', {
          provider,
          model,
          temperature,
          maxTokens,
          baseUrl: safeUrl(baseUrl),
          asciiOnly
        });

        if (provider === 'openai-compatible') {
          if (!baseUrl) throw new Error('Missing baseUrl for OpenAI-compatible');
          const res = await fetch(trimSlash(baseUrl) + '/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {})
            },
            body: JSON.stringify({
              model,
              temperature,
              max_tokens: maxTokens,
              messages: [
                { role: 'system', content: 'You rewrite captions carefully. Output only the rewritten line.' },
                { role: 'user', content: prompt }
              ]
            })
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const json = await res.json();
          const out = json?.choices?.[0]?.message?.content?.trim() || '';
          bglog.info('LLM_CALL openai-compatible ok', dur(t0));
          sendResponse({ ok: true, text: out });
          return;
        }

        if (provider === 'openai') {
          const body = {
            model,
            temperature,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: 'You rewrite captions carefully. Output only the rewritten line.' },
              { role: 'user', content: prompt }
            ],
            logit_bias: openaiAsciiLogitBias(!!asciiOnly),
            response_format: { type: 'text' }
          };
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify(body)
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const json = await res.json();
          const out = json?.choices?.[0]?.message?.content?.trim() || '';
          bglog.info('LLM_CALL openai ok', dur(t0));
          sendResponse({ ok: true, text: out });
          return;
        }

        if (provider === 'anthropic') {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model,
              max_tokens: maxTokens,
              temperature,
              system: 'You rewrite captions carefully. Output only the rewritten line.',
              messages: [{ role: 'user', content: prompt }]
            })
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const json = await res.json();
          const out = json?.content?.[0]?.text?.trim?.() || '';
          bglog.info('LLM_CALL anthropic ok', dur(t0));
          sendResponse({ ok: true, text: out });
          return;
        }

        throw new Error('Unknown provider');
      }

      // -------- TTS providers --------
      if (msg.type === 'TTS_SPEAK') {
        const { provider, apiKey, model, voice, format, text, baseUrl, kokoroPath, lang, azureRegion } = msg.payload || {};
        bglog.debug('TTS_SPEAK', {
          provider,
          model,
          voice,
          format,
          baseUrl: safeUrl(baseUrl),
          path: kokoroPath,
          lang,
          azureRegion
        });

        if (provider === 'openai-tts') {
          const res = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
              model: model || 'gpt-4o-mini-tts',
              voice: voice || 'alloy',
              input: text,
              format: format || 'mp3'
            })
          });
          if (!res.ok) throw new Error('TTS HTTP ' + res.status);
          const buf = await res.arrayBuffer();
          bglog.info('TTS openai ok', dur(t0));
          sendResponse({ ok: true, audioB64: arrayBufferToBase64(buf), mime: pickMime(format) });
          return;
        }

        if (provider === 'openai-compatible-tts') {
          if (!baseUrl) throw new Error('Missing baseUrl for OpenAI-compatible TTS');
          const res = await fetch(trimSlash(baseUrl) + '/v1/audio/speech', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { 'Authorization': 'Bearer ' + apiKey } : {})
            },
            body: JSON.stringify({
              model: model || 'gpt-4o-mini-tts',
              voice: voice || 'alloy',
              input: text,
              format: format || 'mp3'
            })
          });
          if (!res.ok) throw new Error('TTS HTTP ' + res.status);
          const buf = await res.arrayBuffer();
          bglog.info('TTS openai-compatible ok', dur(t0));
          sendResponse({ ok: true, audioB64: arrayBufferToBase64(buf), mime: pickMime(format) });
          return;
        }

        if (provider === 'kokoro-fastapi') {
          const base = trimSlash(baseUrl || 'http://localhost:8000');
          const path = kokoroPath || '/tts';
          const res = await fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: voice || 'default', lang: lang || '' })
          });
          if (!res.ok) throw new Error('Kokoro HTTP ' + res.status);
          const buf = await res.arrayBuffer();
          bglog.info('TTS kokoro ok', dur(t0));
          sendResponse({ ok: true, audioB64: arrayBufferToBase64(buf), mime: 'audio/wav' });
          return;
        }

        if (provider === 'azure-tts') {
          if (!azureRegion) throw new Error('Azure region required');
          if (!apiKey) throw new Error('Azure Speech key required');
          const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
          const ssml = `
            <speak version="1.0" xml:lang="en-US">
              <voice name="${voice || 'en-US-JennyNeural'}">
                <prosody rate="0%" pitch="0%">${escapeSSML(text)}</prosody>
              </voice>
            </speak>`
            .replace(/\s+/g, ' ')
            .trim();
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/ssml+xml',
              'Ocp-Apim-Subscription-Key': apiKey,
              'X-Microsoft-OutputFormat': azureFormat(format),
              'User-Agent': 'yt-restyle-overlay/0.4.0-test'
            },
            body: ssml
          });
          if (!res.ok) throw new Error('Azure TTS HTTP ' + res.status);
          const buf = await res.arrayBuffer();
          bglog.info('TTS azure ok', dur(t0));
          sendResponse({ ok: true, audioB64: arrayBufferToBase64(buf), mime: pickMime(format) });
          return;
        }

        throw new Error('Unknown TTS provider');
      }

      if (msg.type === 'TTS_AZURE_VOICES') {
        const { azureRegion, apiKey } = msg.payload || {};
        if (!azureRegion) throw new Error('Azure region required');
        if (!apiKey) throw new Error('Azure Speech key required');
        const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'User-Agent': 'yt-restyle-overlay/0.4.0-test'
          }
        });
        if (!res.ok) throw new Error('Azure voices HTTP ' + res.status);
        const json = await res.json();
        bglog.info('Azure voices ok', { count: Array.isArray(json) ? json.length : 0, ...dur(t0) });
        sendResponse({ ok: true, voices: json });
        return;
      }

      // -------- Prefs --------
      if (msg.type === 'GET_PREFS') {
        const keys = ['ytro_prefs', 'ytro_presets', 'ytro_theme', 'ytro_pos_left', 'ytro_pos_top', 'ytro_debug'];
        const data = await chrome.storage.local.get(keys);
        if (typeof data.ytro_debug === 'boolean') BG_DEBUG = data.ytro_debug;
        bglog.debug('GET_PREFS', { have: Object.keys(data) });
        sendResponse({ ok: true, data });
        return;
      }

      if (msg.type === 'SET_PREFS') {
        await chrome.storage.local.set(msg.data || {});
        if (typeof msg.data?.ytro_debug === 'boolean') BG_DEBUG = msg.data.ytro_debug;
        bglog.debug('SET_PREFS', { keys: Object.keys(msg.data || {}) });
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      bglog.error(msg?.type || 'unknown', String(err), dur(t0));
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true; // keep channel open for async reply
});

// -------- helpers --------
async function fetchText(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.text();
}

function trimSlash(s) {
  return (s || '').replace(/\/+$/, '');
}

function safeUrl(u) {
  return u ? u.split('?')[0] : '';
}

function dur(t0) {
  return { ms: Math.round(performance.now() - t0) };
}

function pickMime(fmt) {
  const f = (fmt || 'mp3').toLowerCase();
  if (f === 'wav') return 'audio/wav';
  if (f === 'ogg') return 'audio/ogg';
  return 'audio/mpeg';
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function openaiAsciiLogitBias(enable) {
  if (!enable) return undefined;
  // discourage common problematic Unicode punctuation when Strict ASCII is on
  const STR_KEYS = [
    '\u2014', // em dash —
    '\u2013', // en dash –
    '\u2026', // ellipsis …
    '\u201c', // left double quote “
    '\u201d', // right double quote ”
    '\u2018', // left single quote ‘
    '\u2019', // right single quote ’
    '\u201e', // low double quote „
    '\u201a', // low single quote ‚
    '\u00ab', // «
    '\u00bb', // »
    '\u00a0', // nbsp
    '\u2022', // bullet •
    '\u2027', // interpunct
    '\u2192', // →
    '\u2190', // ←
    '\u2191', // ↑
    '\u2193', // ↓
    '\u2122', // ™
    '\u00ae', // ®
    '\u00a9'  // ©
  ];
  const bias = {};
  for (const token of STR_KEYS) {
    bias[token] = -100;
  }
  return bias;
}

function escapeSSML(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function azureFormat(fmt) {
  const f = (fmt || 'mp3').toLowerCase();
  if (f === 'wav') return 'riff-24khz-16bit-mono-pcm';
  if (f === 'ogg') return 'ogg-24khz-16bit-mono-opus';
  return 'audio-24khz-96kbitrate-mono-mp3';
}
