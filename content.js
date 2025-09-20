// content.js (Test build minimal overlay)
// Injects a lightweight overlay to fetch tracks and transcripts via background.js

(function () {
  if (window.__yt_restyle_overlay__) return; // prevent duplicates
  window.__yt_restyle_overlay__ = true;

  const LOG_PREFIX = '[yt-restyle/ui]';
  let UI_DEBUG = false;

  const log = (...args) => { if (UI_DEBUG) console.log(LOG_PREFIX, ...args); };
  const warn = (...args) => console.warn(LOG_PREFIX, ...args);

  // --- Storage bridge ---
  async function loadPrefs() {
    const res = await sendMsg({ type: 'GET_PREFS' });
    if (res?.ok) {
      UI_DEBUG = !!res.data?.ytro_debug;
      return res.data?.ytro_prefs || {};
    }
    return {};
  }

  async function saveDebug(flag) {
    UI_DEBUG = !!flag;
    await sendMsg({ type: 'SET_PREFS', data: { ytro_debug: UI_DEBUG } });
  }

  // --- Background bridge ---
  function sendMsg(payload) {
    return new Promise((resolve) => chrome.runtime.sendMessage(payload, resolve));
  }

  async function listTracks(videoId) {
    return await sendMsg({ type: 'LIST_TRACKS', videoId });
  }

  async function fetchTranscript(videoId, lang) {
    return await sendMsg({ type: 'FETCH_TRANSCRIPT', videoId, lang });
  }

  // --- Helpers ---
  function getVideoId() {
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      // shorts
      const m = location.pathname.match(/\/shorts\/([\w-]{5,})/);
      if (m) return m[1];
    } catch (e) {
      /* noop */
    }
    return '';
  }

  function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    });
    [].concat(children).forEach((c) => c && el.appendChild(c));
    return el;
  }

  function parseTrackListXml(xmlText) {
    const out = [];
    try {
      const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      doc.querySelectorAll('track').forEach((t) => {
        out.push({
          lang: t.getAttribute('lang_code') || '',
          name: t.getAttribute('name') || '',
          kind: t.getAttribute('kind') || '',
        });
      });
    } catch (e) { /* ignore */ }
    return out;
  }

  function srv3ToText(xmlText) {
    try {
      const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
      const parts = [];
      doc.querySelectorAll('text').forEach((n) => {
        let s = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (s) parts.push(s);
      });
      return parts.join('\n');
    } catch (e) {
      return xmlText;
    }
  }

  // --- UI ---
  const root = createEl('div', { id: 'yt-restyle-overlay', class: 'ytro' });
  const header = createEl('div', { class: 'ytro-header' }, [
    createEl('span', { class: 'ytro-title', text: 'Transcript Restyler (Test)' }),
  ]);

  const row1 = createEl('div', { class: 'ytro-row' });
  const idInp = createEl('input', { type: 'text', placeholder: 'Video ID', class: 'ytro-id' });
  const btnDetect = createEl('button', { class: 'ytro-btn', text: 'Detect ID', onclick: onDetect });
  const btnList = createEl('button', { class: 'ytro-btn', text: 'List Tracks', onclick: onList });
  const selTrack = createEl('select', { class: 'ytro-tracks' });
  const btnFetch = createEl('button', { class: 'ytro-btn', text: 'Fetch Transcript', onclick: onFetch });
  row1.append(idInp, btnDetect, btnList, selTrack, btnFetch);

  const row2 = createEl('div', { class: 'ytro-row' });
  const dbgLabel = createEl('label', { class: 'ytro-dbg' });
  const dbgChk = createEl('input', { type: 'checkbox' });
  dbgChk.addEventListener('change', () => saveDebug(dbgChk.checked));
  dbgLabel.append(dbgChk, document.createTextNode(' Debug logs'));
  row2.append(dbgLabel);

  const area = createEl('textarea', { class: 'ytro-out', placeholder: 'Transcript output...' });

  root.append(header, row1, row2, area);
  document.documentElement.appendChild(root);

  // Initial state
  (async () => {
    const prefs = await loadPrefs();
    dbgChk.checked = UI_DEBUG;
    const vid = getVideoId();
    if (vid) idInp.value = vid;
  })();

  // --- Handlers ---
  function onDetect() {
    const vid = getVideoId();
    idInp.value = vid || '';
  }

  async function onList() {
    const v = (idInp.value || '').trim();
    if (!v) { warn('no video id'); return; }
    const res = await listTracks(v);
    if (!res?.ok) { warn('LIST_TRACKS error', res?.error); return; }
    const tracks = parseTrackListXml(res.text);
    selTrack.innerHTML = '';
    for (const t of tracks) {
      const label = `${t.lang}${t.name ? ' - ' + t.name : ''}${t.kind ? ' (' + t.kind + ')' : ''}`;
      const opt = createEl('option', { value: t.lang, text: label });
      selTrack.appendChild(opt);
    }
    if (selTrack.options.length > 0) selTrack.selectedIndex = 0;
  }

  async function onFetch() {
    const v = (idInp.value || '').trim();
    const lang = selTrack.value || 'en';
    if (!v) { warn('no video id'); return; }
    const res = await fetchTranscript(v, lang);
    if (!res?.ok) { warn('FETCH_TRANSCRIPT error', res?.error); return; }
    if (res.kind === 'vtt') {
      area.value = res.text;
    } else {
      area.value = srv3ToText(res.text);
    }
  }
})();

