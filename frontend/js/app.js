(() => {
  'use strict';
  const API = window.API_BASE || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '' : 'https://vocal-roots-learn-and-translate-tribal-dialects-production.up.railway.app');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { dialects: [], lastResult: '' };

  /* ---------- helpers ---------- */
  const store = {
    get token() { return localStorage.getItem('vr_token'); },
    set token(v) { v ? localStorage.setItem('vr_token', v) : localStorage.removeItem('vr_token'); },
    get user() { try { return JSON.parse(localStorage.getItem('vr_user') || 'null'); } catch { return null; } },
    set user(v) { v ? localStorage.setItem('vr_user', JSON.stringify(v)) : localStorage.removeItem('vr_user'); }
  };

  // Builds DOM with textContent only, so user-contributed words can never inject HTML.
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function toast(msg, isErr = false) {
    const el = h('div', { class: 'toast' + (isErr ? ' err' : ''), role: 'status' }, msg);
    $('#toasts').append(el);
    setTimeout(() => el.remove(), 4200);
  }

  async function api(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    if (store.token) headers.Authorization = 'Bearer ' + store.token;
    let payload;
    if (form) payload = form;
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    let res;
    try { res = await fetch(API + path, { method, headers, body: payload }); }
    catch { throw new Error('Cannot reach the server. Check that the backend is running.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && store.token && !path.startsWith('/api/auth')) logout();
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  function countUp(el, to) {
    if (reduceMotion) { el.textContent = to; return; }
    const start = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - start) / 900);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ---------- speech output ---------- */
  function speak(text, lang = 'hi-IN') {
    if (!('speechSynthesis' in window)) return toast('Speech playback is not supported in this browser', true);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = 0.85;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  // Prefer a native speaker's recording; the browser voice is only an approximation.
  function playWord({ audioUrl, text, lang }) {
    if (audioUrl) new Audio(API + audioUrl).play().catch(() => toast('Could not play the recording', true));
    else speak(text, lang);
  }

  /* ---------- visual effects ---------- */
  function initFx() {
    const box = $('#bubbles');
    for (let i = 0; i < 16; i++) {
      const s = 8 + Math.random() * 38;
      box.append(h('span', { class: 'bubble', style: `width:${s}px;height:${s}px;left:${Math.random() * 100}%;--drift:${(Math.random() - 0.5) * 120}px;animation-duration:${14 + Math.random() * 20}s;animation-delay:${-Math.random() * 30}s` }));
    }
    const nav = $('#nav');
    const onScroll = () => nav.classList.toggle('solid', scrollY > innerHeight * 0.7);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();

    document.addEventListener('pointermove', (e) => {
      const g = e.target.closest && e.target.closest('.glass');
      if (!g) return;
      const r = g.getBoundingClientRect();
      g.style.setProperty('--mx', e.clientX - r.left + 'px');
      g.style.setProperty('--my', e.clientY - r.top + 'px');
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.btn');
      if (!b || reduceMotion) return;
      const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
      const rip = h('span', { class: 'ripple', style: `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px` });
      b.append(rip); setTimeout(() => rip.remove(), 650);
    });
  }

  /* ---------- dictionary metadata ---------- */
  async function loadMeta() {
    try {
      const [stats, dialects] = await Promise.all([api('/api/words/stats'), api('/api/words/dialects')]);
      countUp($('#stWords'), stats.words); countUp($('#stDialects'), stats.dialects); countUp($('#stVerified'), stats.verified);
      $('#demoNote').hidden = stats.verified > 0;
      state.dialects = dialects;
      const langs = [{ id: 'english', label: 'English' }, { id: 'hindi', label: 'Hindi' }, ...dialects];
      const opts = () => langs.map((l) => h('option', { value: l.id }, l.label));
      const from = $('#fromLang'), to = $('#toLang');
      const keepFrom = from.value, keepTo = to.value;
      from.replaceChildren(...opts()); to.replaceChildren(...opts());
      from.value = keepFrom || 'english';
      to.value = keepTo || (dialects[0] ? dialects[0].id : 'hindi');
      const learn = $('#learnDialect'), keep = learn.value;
      learn.replaceChildren(h('option', { value: '' }, 'All dialects'), ...dialects.map((d) => h('option', { value: d.id }, d.label)));
      learn.value = keep;
      $('#dialectList').replaceChildren(...dialects.map((d) => h('option', { value: d.label })));
    } catch (e) { toast(e.message, true); }
  }

  /* ---------- translator ---------- */
  function replaceToken(from, to) {
    const ta = $('#srcText');
    ta.value = ta.value.replace(new RegExp('(^|[^\\p{L}])' + esc(from) + '(?![\\p{L}])', 'iu'), (m, pre) => pre + to);
  }

  function renderTranslation(r) {
    const to = $('#toLang').value;
    state.lastResult = r.tokens.map((t) => (t.found ? t.target : t.source)).join(' ');
    $('#tOut').replaceChildren(...r.tokens.map((t) => {
      if (t.found) {
        return h('button', { class: 'chip', type: 'button', title: 'Hear it',
          onclick: () => playWord({ audioUrl: t.audioUrl, text: t.target, lang: to === 'english' ? 'en-IN' : 'hi-IN' }) },
          t.target, t.native ? h('small', {}, t.native) : null);
      }
      return h('div', {},
        h('span', { class: 'chip miss' }, t.source, h('small', {}, t.missing ? `no word for "${t.concept}" yet` : 'not in dictionary')),
        t.suggestions && t.suggestions.length
          ? h('div', { class: 'sugg' }, t.suggestions.map((s) => h('button', { type: 'button', onclick: () => { replaceToken(t.source, s.roman); translate(); } }, `${s.roman} (${s.concept})`)))
          : null);
    }));
    $('#tMeta').textContent = Math.round(r.coverage * 100) + '% of words found';
    $('#copyBtn').hidden = false;
  }

  async function translate() {
    const text = $('#srcText').value.trim();
    if (!text) return toast('Type a word or short phrase first', true);
    $('#tOut').replaceChildren(h('span', { class: 'muted' }, 'Translating…'));
    try {
      renderTranslation(await api('/api/translate', { method: 'POST', body: { text, from: $('#fromLang').value, to: $('#toLang').value } }));
    } catch (e) { $('#tOut').replaceChildren(h('span', { class: 'muted' }, e.message)); $('#copyBtn').hidden = true; $('#tMeta').textContent = ''; }
  }

  function initTranslator() {
    $('#goBtn').addEventListener('click', translate);
    $('#srcText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) translate(); });
    $('#swapBtn').addEventListener('click', () => {
      const f = $('#fromLang'), t = $('#toLang'), a = f.value;
      f.value = t.value; t.value = a;
      if (state.lastResult) { $('#srcText').value = state.lastResult; translate(); }
    });
    $('#copyBtn').addEventListener('click', () => navigator.clipboard.writeText(state.lastResult).then(() => toast('Copied')).catch(() => toast('Copy is blocked in this browser', true)));

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = $('#micBtn');
    if (!SR) { btn.disabled = true; btn.title = 'Speech input is not supported in this browser'; return; }
    let rec = null;
    btn.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      const from = $('#fromLang').value;
      if (!['english', 'hindi'].includes(from)) return toast('Speech input works for English and Hindi. Type dialect words instead.', true);
      rec = new SR(); rec.lang = from === 'hindi' ? 'hi-IN' : 'en-IN';
      rec.onstart = () => btn.classList.add('live');
      rec.onresult = (e) => { $('#srcText').value = e.results[0][0].transcript; if (window.VoiceFX) VoiceFX.pulse(0.8); translate(); };
      rec.onerror = (e) => toast('Could not hear you: ' + e.error, true);
      rec.onend = () => { btn.classList.remove('live'); rec = null; };
      rec.start();
    });
  }

  /* ---------- ML: dialect detector ---------- */
  function initDetector() {
    const run = async () => {
      const text = $('#detectText').value.trim(), box = $('#detectOut');
      if (!text) return toast('Enter a word or phrase first', true);
      try {
        const r = await api('/api/ml/detect', { method: 'POST', body: { text } });
        box.replaceChildren(...r.predictions.map((p, i) => {
          const fill = h('div', { class: 'fill' });
          requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = p.probability * 100 + '%')));
          return h('div', { class: 'bar' + (i === 0 ? ' top' : '') }, h('span', {}, p.label), h('div', { class: 'track' }, fill), h('span', {}, Math.round(p.probability * 100) + '%'));
        }), h('p', { class: 'muted' }, Math.round(r.known_ratio * 100) + '% of these words are already in the dictionary.'));
      } catch (e) { box.replaceChildren(h('p', { class: 'error' }, e.message)); }
    };
    $('#detectBtn').addEventListener('click', run);
    $('#detectText').addEventListener('keydown', (e) => e.key === 'Enter' && run());
  }

  /* ---------- flashcards ---------- */
  const deck = { cards: [], i: 0 };
  const dialectParam = () => ($('#learnDialect').value ? '&dialect=' + encodeURIComponent($('#learnDialect').value) : '');

  async function loadDeck() {
    try { deck.cards = await api('/api/learn/deck?limit=10' + dialectParam()); deck.i = 0; showCard(); }
    catch (e) { toast(e.message, true); }
  }

  function showCard() {
    const c = deck.cards[deck.i], flash = $('#flash');
    flash.classList.remove('flipped'); $('#rate').hidden = true;
    const info = $('#deckInfo');
    if (!c) {
      $('#fDialect').textContent = ''; $('#fWord').textContent = deck.cards.length ? 'Deck complete' : 'No cards yet';
      $('#fNative').textContent = ''; $('#fPlay').hidden = true; $('#fConcept').textContent = ''; $('#fHindi').textContent = '';
      info.replaceChildren(h('button', { class: 'btn btn-ghost', type: 'button', onclick: loadDeck }, 'Load a new deck'));
      return;
    }
    $('#fPlay').hidden = false;
    $('#fDialect').textContent = c.dialectLabel;
    $('#fWord').textContent = c.roman; $('#fNative').textContent = c.native || '';
    $('#fConcept').textContent = c.concept; $('#fHindi').textContent = c.hindi;
    info.textContent = `Card ${deck.i + 1} of ${deck.cards.length}` + (store.token ? '' : '. Log in to save your progress.');
  }

  function flip() {
    if (!deck.cards[deck.i]) return;
    const on = $('#flash').classList.toggle('flipped');
    $('#rate').hidden = !on;
  }

  async function rate(q) {
    const c = deck.cards[deck.i];
    if (!c) return;
    if (store.token) {
      try { updateStats(await api('/api/learn/review', { method: 'POST', body: { wordId: c._id, quality: q } })); }
      catch (e) { toast(e.message, true); }
    }
    deck.i++; showCard();
  }

  function initCards() {
    $('#flash').addEventListener('click', flip);
    $('#fPlay').addEventListener('click', (e) => { e.stopPropagation(); const c = deck.cards[deck.i]; if (c) playWord({ audioUrl: c.audioUrl, text: c.roman, lang: 'hi-IN' }); });
    $$('#rate [data-q]').forEach((b) => b.addEventListener('click', () => rate(+b.dataset.q)));
    $('#flash').addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      const q = { 1: 1, 2: 3, 3: 4, 4: 5 }[e.key];
      if (q && $('#flash').classList.contains('flipped')) rate(q);
    });
  }

  /* ---------- quiz ---------- */
  const quiz = { qs: [], i: 0, score: 0 };

  async function startQuiz() {
    const box = $('#quizBox');
    try {
      quiz.qs = await api('/api/learn/quiz?n=5' + dialectParam()); quiz.i = 0; quiz.score = 0;
      renderQuestion();
    } catch (e) { box.replaceChildren(h('p', { class: 'error' }, e.message)); }
  }

  async function renderQuestion() {
    const box = $('#quizBox'), q = quiz.qs[quiz.i];
    if (!q) {
      if (store.token && quiz.qs.length) { try { updateStats(await api('/api/learn/quiz/finish', { method: 'POST', body: { score: quiz.score } })); } catch { /* score still shown */ } }
      box.replaceChildren(
        h('p', { class: 'q-prompt' }, quiz.qs.length ? `You got ${quiz.score} of ${quiz.qs.length}` : 'Add some words to start a quiz'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: startQuiz }, 'Play again'));
      return;
    }
    box.replaceChildren(
      h('p', { class: 'muted' }, `Question ${quiz.i + 1} of ${quiz.qs.length}. ${q.dialectLabel}`),
      h('div', { class: 'q-prompt' }, q.prompt, q.native ? h('span', { class: 'native' }, '  ' + q.native) : null),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => playWord({ audioUrl: q.audioUrl, text: q.prompt, lang: 'hi-IN' }) }, 'Hear it'),
      h('p', {}, 'What does it mean?'),
      h('div', { class: 'opts' }, q.options.map((o) => h('button', { class: 'opt', type: 'button', onclick: (ev) => answer(ev.currentTarget, o) }, o))));
  }

  function answer(btn, choice) {
    const q = quiz.qs[quiz.i], ok = choice === q.answer;
    if (ok) quiz.score++;
    $$('.opt', $('#quizBox')).forEach((b) => { b.disabled = true; if (b.textContent === q.answer) b.classList.add('right'); });
    if (!ok) btn.classList.add('wrong');
    setTimeout(() => { quiz.i++; renderQuestion(); }, 1100);
  }

  /* ---------- ML: personal review plan ---------- */
  async function loadPlan() {
    const box = $('#planBox');
    if (!store.token) {
      box.replaceChildren(h('p', {}, 'Log in and review a few flashcards to get a plan built from your own results.'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: openAuth }, 'Log in'));
      return;
    }
    try {
      const r = await api('/api/ml/recommend');
      if (!r.items.length) { box.replaceChildren(h('p', {}, 'Review some flashcards first. Your plan appears once there are results to learn from.')); return; }
      box.replaceChildren(
        r.weakCategories.length ? h('p', {}, 'Weakest topics: ' + r.weakCategories.map((c) => `${c.category} (${Math.round(c.retention * 100)}% recall)`).join(', ')) : null,
        h('div', { class: 'plan-list' }, r.items.map((it) => {
          const fill = h('div', { class: 'fill' });
          requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = it.retention * 100 + '%')));
          return h('div', { class: 'plan-item' },
            h('div', {}, h('strong', {}, it.roman), ` means ${it.concept} (${it.hindi}) `, h('span', { class: 'muted' }, it.dialectLabel)),
            h('div', {}, h('span', { class: 'muted' }, `Predicted recall ${Math.round(it.retention * 100)}%`), h('div', { class: 'track' }, fill)));
        })));
    } catch (e) { box.replaceChildren(h('p', { class: 'error' }, e.message)); }
  }

  function initTabs() {
    $$('[role=tab]').forEach((b) => b.addEventListener('click', () => {
      $$('[role=tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      ['cards', 'quiz', 'plan'].forEach((n) => ($('#tab-' + n).hidden = n !== b.dataset.tab));
      if (b.dataset.tab === 'quiz') startQuiz();
      if (b.dataset.tab === 'plan') loadPlan();
    }));
    $('#learnDialect').addEventListener('change', () => {
      loadDeck();
      if (!$('#tab-quiz').hidden) startQuiz();
    });
  }

  /* ---------- auth and progress ---------- */
  let mode = 'login';
  function setMode(m) {
    mode = m;
    $('#authTitle').textContent = m === 'login' ? 'Log in' : 'Create your account';
    $('#nameRow').hidden = m === 'login';
    $('#authForm [name=name]').required = m === 'register';
    $('#authForm [name=password]').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('#authSwitch').textContent = m === 'login' ? 'Create an account' : 'I have an account';
  }
  function openAuth() { setMode('login'); $('#authError').textContent = ''; $('#authDialog').showModal(); }

  function updateStats(r) {
    if (r && r.xp != null && store.user) $('#userStats').textContent = `${store.user.name}: ${r.xp} XP, ${r.streak} day streak`;
  }
  async function refreshStats() {
    try { const s = await api('/api/learn/stats'); $('#userStats').textContent = `${store.user.name}: ${s.xp} XP, ${s.streak} day streak, ${s.due} due`; } catch { /* ignore */ }
  }
  function renderAuth() {
    const u = store.user;
    $('#authBtn').textContent = u ? 'Log out' : 'Log in';
    $('#userStats').hidden = !u;
    if (u) { $('#userStats').textContent = u.name; refreshStats(); }
  }
  function logout() { store.token = null; store.user = null; renderAuth(); }

  function initAuth() {
    $('#authBtn').addEventListener('click', () => (store.user ? (logout(), toast('Logged out'), loadDeck()) : openAuth()));
    $('#authSwitch').addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
    $('#authClose').addEventListener('click', () => $('#authDialog').close());
    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/auth/' + mode, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        store.token = r.token; store.user = r.user;
        $('#authDialog').close(); e.target.reset(); renderAuth(); toast(`Welcome, ${r.user.name}`); loadDeck();
      } catch (err) { $('#authError').textContent = err.message; }
    });
    renderAuth();
  }

  /* ---------- contribute + recording ---------- */
  const rec = { mr: null, blob: null, chunks: [], stream: null, ctx: null };

  function resetRec() { rec.blob = null; $('#recPreview').hidden = true; $('#recInfo').textContent = 'Record the pronunciation (up to 6 seconds)'; }

  function initContribute() {
    const btn = $('#recBtn');
    btn.addEventListener('click', async () => {
      if (rec.mr && rec.mr.state === 'recording') { rec.mr.stop(); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Recording is not supported in this browser', true);
      try { rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { return toast('Allow microphone access to record', true); }
      rec.chunks = []; rec.mr = new MediaRecorder(rec.stream);
      rec.mr.ondataavailable = (e) => e.data.size && rec.chunks.push(e.data);
      rec.mr.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        if (rec.ctx) rec.ctx.close();
        rec.blob = new Blob(rec.chunks, { type: rec.mr.mimeType || 'audio/webm' });
        const p = $('#recPreview'); p.src = URL.createObjectURL(rec.blob); p.hidden = false;
        btn.classList.remove('live'); $('#recInfo').textContent = 'Listen, then save the word. Record again to replace it.';
      };
      rec.mr.start(); btn.classList.add('live'); $('#recInfo').textContent = 'Recording… tap to stop';
      setTimeout(() => rec.mr && rec.mr.state === 'recording' && rec.mr.stop(), 6000);

      const AC = window.AudioContext || window.webkitAudioContext;
      rec.ctx = new AC();
      const an = rec.ctx.createAnalyser(); an.fftSize = 256;
      rec.ctx.createMediaStreamSource(rec.stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      (function loop() {
        if (!rec.mr || rec.mr.state !== 'recording') return;
        an.getByteFrequencyData(buf);
        if (window.VoiceFX) VoiceFX.pulse((buf.reduce((a, b) => a + b, 0) / buf.length / 128) * 1.6);
        requestAnimationFrame(loop);
      })();
    });

    $('#wordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!store.token) { toast('Log in to add words', true); return openAuth(); }
      try {
        const word = await api('/api/words', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        if (rec.blob) {
          const fd = new FormData(); fd.append('audio', rec.blob, 'voice.webm');
          await api(`/api/words/${word._id}/audio`, { method: 'POST', form: fd });
        }
        toast('Word saved. A reviewer will verify it.'); e.target.reset(); resetRec(); loadMeta();
      } catch (err) { toast(err.message, true); }
    });
  }

  /* ---------- start ---------- */
  initFx(); initTranslator(); initDetector(); initCards(); initTabs(); initAuth(); initContribute();
  loadMeta().then(loadDeck);
})();
