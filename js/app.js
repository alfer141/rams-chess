/* ============================================================
   app.js — Interfaz y flujo: Jugar, Aprender y ajustes globales
   ============================================================ */
(function () {
  'use strict';

  const { fileOf, rankOf, fromAlg, FILES } = ChessUtil;
  const t = (k, v) => I18N.t(k, v);
  const $ = (id) => document.getElementById(id);
  const L = (obj) => (obj ? obj[I18N.lang] || obj.es : '');

  /* ---------- Estado ---------- */
  const playGame = new Chess();
  const learnGame = new Chess();
  const reviewGame = new Chess();
  let game = playGame;              // partida activa según la vista
  let view = 'play';                // 'play' | 'learn' | 'history'
  let games = (() => { try { const g = JSON.parse(localStorage.getItem('rams-chess-games')); return Array.isArray(g) ? g : []; } catch (e) { return []; } })();
  function saveGames() { try { localStorage.setItem('rams-chess-games', JSON.stringify(games.slice(0, 100))); } catch (e) { /* sin almacenamiento */ } }

  const settings = Object.assign({
    mode: 'ai', level: 2, color: 'w', time: 5,
    hints: true, theme: 'light', sound: true, lang: 'es', accent: 'yellow', voice: true, ttsVoice: 'Kore',
  }, load('rams-chess-settings'));
  let progress = load('rams-chess-progress');   // { lessonId: etapas completadas, _xp: experiencia }
  const XP_STAGE = 10, XP_BONUS = 5;
  const RANKS = [['p', 0], ['n', 60], ['b', 140], ['r', 240], ['q', 360], ['k', 500]];
  const xpTotal = () => progress._xp || 0;
  function rankFor(xp) {
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][1]) i++;
    return { piece: RANKS[i][0], from: RANKS[i][1], to: i + 1 < RANKS.length ? RANKS[i + 1][1] : null, index: i };
  }

  const state = {
    humanColor: 'w',
    flipped: false,
    selected: -1,
    targets: [],
    lastMove: null,
    over: null,
    paused: false,
    clocks: { w: 0, b: 0 },
    clockOn: false,
    lastTick: 0,
    thinking: false,
    aiRequest: 0,
    log: [],
  };

  const learn = { lesson: null, stage: 0, color: 'w', stars: new Set(), moves: 0, done: false, busy: false, feedback: '', feedbackKind: '', feedbackTitle: '', feedbackXP: '' };

  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  function save() {
    try {
      localStorage.setItem('rams-chess-settings', JSON.stringify(settings));
      localStorage.setItem('rams-chess-progress', JSON.stringify(progress));
    } catch (e) { /* sin almacenamiento */ }
    if (window.Account && Account.user) Account.saveProgressDebounced(progress);
  }

  /* ---------- Sonido (WebAudio, sin archivos) ---------- */
  let audio = null;
  function beep(freq, dur, type = 'sine', gain = 0.08) {
    if (!settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* sin audio */ }
  }
  // Sonido de interfaz (audio/ui-select.mp3): se decodifica una vez y se reproduce en cada interacción
  let uiBuffer = null, uiLoading = false;
  function loadUISound() {
    if (uiBuffer || uiLoading) return;
    uiLoading = true;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      fetch('audio/ui-select.mp3')
        .then((r) => r.arrayBuffer())
        .then((buf) => audio.decodeAudioData(buf))
        .then((decoded) => { uiBuffer = decoded; })
        .catch(() => { uiLoading = false; });
    } catch (e) { uiLoading = false; }
  }
  function uiClick(gain = 0.5) {
    if (!settings.sound) return;
    if (!uiBuffer) { loadUISound(); return; }
    try {
      if (audio.state === 'suspended') audio.resume();
      const src = audio.createBufferSource(), g = audio.createGain();
      src.buffer = uiBuffer; g.gain.value = gain;
      src.connect(g).connect(audio.destination);
      src.start();
    } catch (e) { /* sin audio */ }
  }
  // Botones, interruptores, navegación y lecciones
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled) uiClick();
  });
  document.addEventListener('change', (e) => { if (e.target.classList.contains('switch')) uiClick(0.4); });
  document.addEventListener('pointerdown', loadUISound, { once: true });

  const sfx = {
    move: () => beep(520, 0.08, 'triangle'),
    capture: () => { beep(320, 0.1, 'square', 0.06); setTimeout(() => beep(240, 0.12, 'square', 0.05), 60); },
    check: () => { beep(880, 0.1); setTimeout(() => beep(1100, 0.14), 90); },
    end: () => { beep(440, 0.2); setTimeout(() => beep(330, 0.3), 180); },
    star: () => { beep(988, 0.09); setTimeout(() => beep(1319, 0.12), 70); },
    success: () => { beep(660, 0.1); setTimeout(() => beep(880, 0.1), 100); setTimeout(() => beep(1320, 0.22), 200); },
    fail: () => beep(180, 0.22, 'sawtooth', 0.04),
  };

  /* ---------- IA (Web Worker con respaldo síncrono) ---------- */
  let worker = null;
  try {
    worker = new Worker('js/ai.js');
    worker.onerror = () => { worker = null; };
  } catch (e) { worker = null; }

  function requestAIMove() {
    const id = ++state.aiRequest;
    state.thinking = true;
    renderStatus();
    const fen = playGame.fen();
    const started = Date.now();
    const deliver = (m) => {
      if (id !== state.aiRequest) return;
      const wait = Math.max(0, 450 - (Date.now() - started));
      setTimeout(() => {
        if (id !== state.aiRequest) return;
        state.thinking = false;
        if (!m || !applyMove(m)) renderAll();
      }, wait);
    };
    if (worker) {
      worker.onmessage = (e) => { if (e.data.id === id) deliver(e.data.move); };
      worker.postMessage({ id, fen, level: settings.level });
    } else {
      setTimeout(() => {
        const r = ChessAI.chooseMove(playGame, settings.level);
        deliver(r ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion || null } : null);
      }, 30);
    }
  }
  function cancelAI() { state.aiRequest++; state.thinking = false; }

  const isAIMode = () => settings.mode === 'ai';
  const machineColor = () => (state.humanColor === 'w' ? 'b' : 'w');
  const machineToMove = () => view === 'play' && isAIMode() && playGame.turn === machineColor() && !state.over && !state.paused;
  function canInteract() {
    if (view === 'history') return false;
    if (view === 'learn') return !!learn.lesson && !learn.done && !learn.busy && game.turn === learn.color;
    return !state.over && !state.paused && !state.thinking && (!isAIMode() || game.turn === state.humanColor);
  }

  /* ---------- Tablero ---------- */
  const boardEl = $('board');
  const squares = [];

  function buildBoard() {
    boardEl.innerHTML = '';
    squares.length = 0;
    for (let i = 0; i < 64; i++) {
      const el = document.createElement('div');
      el.className = 'sq' + ((fileOf(i) + rankOf(i)) % 2 === 0 ? ' dark' : '');
      el.dataset.i = i;
      squares.push(el);
    }
    const order = state.flipped ? [...Array(64).keys()].reverse() : [...Array(64).keys()];
    order.forEach((i) => boardEl.appendChild(squares[i]));
    const ranks = state.flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
    const files = state.flipped ? [...FILES].reverse() : [...FILES];
    $('ranks').innerHTML = ranks.map((r) => `<span>${r}</span>`).join('');
    $('files').innerHTML = files.map((f) => `<span>${f}</span>`).join('');
  }

  function pieceSVG(p, cls = 'piece') {
    return `<span class="${cls} ${p.color}"><svg><use href="#pc-${p.type}"/></svg></span>`;
  }

  function renderBoard() {
    const kingInCheck = game.inCheck() ? game.kingSquare(game.turn) : -1;
    for (let i = 0; i < 64; i++) {
      const el = squares[i];
      const p = game.get(i);
      el.innerHTML = p ? pieceSVG(p) : '';
      el.classList.toggle('last', !!state.lastMove && (state.lastMove.from === i || state.lastMove.to === i));
      el.classList.toggle('selected', state.selected === i);
      el.classList.toggle('check', kingInCheck === i);
      el.classList.toggle('star', view === 'learn' && learn.stars.has(i));
      const target = settings.hints ? state.targets.find((m) => m.to === i) : null;
      el.classList.toggle('hint', !!target);
      el.classList.toggle('capture', !!target && !!target.captured);
      el.classList.remove('drop-target', 'dragging');
    }
  }

  /* ---------- Panel: Jugar ---------- */
  function fmtClock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderClocks() {
    const top = state.flipped ? 'w' : 'b', bottom = state.flipped ? 'b' : 'w';
    const set = (id, color) => {
      const el = $(id);
      if (settings.time === 0) { el.textContent = '—'; el.classList.remove('low'); return; }
      el.textContent = fmtClock(state.clocks[color]);
      el.classList.toggle('low', state.clocks[color] < 30000 && state.clocks[color] > 0);
    };
    set('clock-top', top); set('clock-bottom', bottom);
    $('player-top').classList.toggle('active', playGame.turn === top && !state.over);
    $('player-bottom').classList.toggle('active', playGame.turn === bottom && !state.over);
  }

  function renderPlayers() {
    const top = state.flipped ? 'w' : 'b', bottom = state.flipped ? 'b' : 'w';
    $('player-top').dataset.color = top;
    $('player-bottom').dataset.color = bottom;
    $('player-top').querySelector('.label').textContent = t(top === 'w' ? 'white' : 'black');
    $('player-bottom').querySelector('.label').textContent = t(bottom === 'w' ? 'white' : 'black');
    const tag = (color) => (!isAIMode() ? '' : color === state.humanColor ? t('you') : t('machine'));
    $('tag-top').textContent = tag(top);
    $('tag-bottom').textContent = tag(bottom);

    const cap = playGame.captured();
    const capHTML = (color) => {
      const victim = color === 'w' ? 'b' : 'w';
      let html = cap[color].map((type) => `<span class="cap ${victim}"><svg><use href="#pc-${type}"/></svg></span>`).join('');
      const bal = playGame.materialBalance() * (color === 'w' ? 1 : -1);
      if (bal > 0) html += `<span class="adv">+${bal}</span>`;
      return html;
    };
    $('cap-top').innerHTML = capHTML(top);
    $('cap-bottom').innerHTML = capHTML(bottom);
  }

  function renderMoves() {
    const ol = $('moves');
    ol.innerHTML = '';
    const total = state.log.length;
    for (let i = 0; i < total; i += 2) {
      const li = document.createElement('li');
      const w = state.log[i], b = state.log[i + 1];
      const isLast = (i === total - 1) || (i + 1 === total - 1);
      li.innerHTML = `<span class="n">${i / 2 + 1}</span>`
        + `<span class="m ${i === total - 1 ? 'cur' : ''}">${w ? w.san : ''}</span>`
        + `<span class="m ${i + 1 === total - 1 ? 'cur' : ''}">${b ? b.san : ''}</span>`
        + `<span class="mark ${isLast ? 'on' : ''}"></span>`;
      ol.appendChild(li);
    }
    ol.scrollTop = ol.scrollHeight;
  }

  function pieceTip(p, targets) {
    let txt = t('tip_' + p.type);
    if (p.type === 'k' && targets.some((m) => m.castle)) txt += ' ' + t('tip_castle');
    if (p.type === 'p' && targets.some((m) => m.enPassant)) txt += ' ' + t('tip_ep');
    if (!targets.length) txt = t('tip_none');
    return txt;
  }

  function renderStatus() {
    if (view !== 'play') return;
    const line = $('hint-line');
    line.classList.remove('alert');
    if (state.over) { line.textContent = resultText(state.over); return; }
    if (state.thinking) { line.textContent = t('thinking'); return; }
    if (state.selected >= 0) { line.textContent = pieceTip(game.get(state.selected), state.targets); return; }
    if (game.inCheck()) { line.textContent = t('check'); line.classList.add('alert'); return; }
    line.textContent = state.log.length ? t(game.turn === 'w' ? 'turn_w' : 'turn_b') : t('welcome');
  }

  function renderButtons() {
    $('btn-undo').disabled = playGame.history.length === 0 || state.paused;
    $('btn-resign').disabled = !!state.over || state.paused;
    $('btn-pause').disabled = !!state.over || playGame.history.length === 0;
  }

  function renderPlayPanel() { renderPlayers(); renderMoves(); renderClocks(); renderStatus(); renderButtons(); }

  function renderAll() {
    renderBoard();
    if (view === 'play') renderPlayPanel();
    else if (view === 'learn') renderLearn();
    else renderReview();
  }

  function resultText(over) {
    const who = over.result === '1-0' ? t('win_w') : over.result === '0-1' ? t('win_b') : t('draw');
    return `${who} ${t('r_' + over.reason)}`;
  }

  /* ---------- Movimientos (comunes) ---------- */
  function select(i) {
    state.selected = i;
    state.targets = i >= 0 ? game.movesFrom(i) : [];
    renderBoard(); renderStatus();
  }

  function tryMove(from, to) {
    const options = state.targets.filter((m) => m.from === from && m.to === to);
    if (!options.length) return false;
    if (options[0].promotion) {
      askPromotion(game.turn).then((promotion) => applyMove({ from, to, promotion }));
      return true;
    }
    applyMove({ from, to });
    return true;
  }

  function applyMove(m) {
    const done = game.move(m);
    if (!done) return false;
    state.lastMove = done;
    state.selected = -1; state.targets = [];
    if (view === 'learn') { learnMove(done); return true; }

    state.log.push({ san: done.san, color: done.color, from: done.from, to: done.to, promotion: done.promotion || null });
    if (settings.time > 0 && !state.clockOn) { state.clockOn = true; state.lastTick = Date.now(); }
    const st = game.status();
    if (st.over) { endGame(st.result, st.reason); }
    else {
      if (game.inCheck()) sfx.check(); else if (done.captured) sfx.capture(); else sfx.move();
      renderAll();
      if (machineToMove()) requestAIMove();
    }
    return true;
  }

  function endGame(result, reason) {
    state.over = { result, reason };
    state.clockOn = false;
    cancelAI();
    recordGame(result, reason);
    state.selected = -1; state.targets = [];
    sfx.end();
    renderAll();
    const last = games[0];
    showMessage(t('over_title'), resultText(state.over), t('play_again'), () => $('dlg-new').showModal(), null,
      last ? { label: t('review_game'), onClick: () => { setView('history'); openGame(last); startReview(); } } : null);
  }

  function undo() {
    if (view === 'history') return;
    if (view === 'learn') { if (learn.lesson) loadStage(learn.stage); return; }
    if (!playGame.history.length) return;
    cancelAI();
    let plies = 1;
    if (isAIMode() && playGame.turn === state.humanColor && playGame.history.length >= 2) plies = 2;
    for (let k = 0; k < plies; k++) { if (playGame.undo()) state.log.pop(); }
    state.over = null;
    state.lastMove = playGame.history.length ? playGame.history[playGame.history.length - 1].move : null;
    state.selected = -1; state.targets = [];
    renderAll();
    if (machineToMove()) requestAIMove();
  }

  /* ---------- Interacción: clic y arrastre ---------- */
  let drag = null;
  boardEl.addEventListener('pointerdown', (e) => {
    const sq = e.target.closest('.sq');
    if (!sq || !canInteract()) return;
    const i = +sq.dataset.i;
    const p = game.get(i);
    if (p && p.color === game.turn) {
      if (state.selected !== i) uiClick(0.3);
      select(i);
      drag = { from: i, x: e.clientX, y: e.clientY, ghost: null, piece: p, pointerId: e.pointerId };
      try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* evento sintético */ }
    } else if (state.selected >= 0) {
      if (!tryMove(state.selected, i)) select(-1);
    }
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.ghost && Math.hypot(dx, dy) > 6) {
      const size = squares[0].getBoundingClientRect().width;
      const g = document.createElement('span');
      g.className = `drag-ghost ${drag.piece.color}`;
      g.style.width = g.style.height = `${size}px`;
      g.innerHTML = `<svg><use href="#pc-${drag.piece.type}"/></svg>`;
      document.body.appendChild(g);
      drag.ghost = g;
      squares[drag.from].classList.add('dragging');
    }
    if (drag.ghost) {
      drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%) scale(1.1)`;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const sq = over && over.closest('.sq');
      squares.forEach((s) => s.classList.remove('drop-target'));
      if (sq && state.targets.some((m) => m.to === +sq.dataset.i)) sq.classList.add('drop-target');
    }
  });

  const endDrag = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    try { boardEl.releasePointerCapture(d.pointerId); } catch (err) { /* ignorar */ }
    squares.forEach((s) => s.classList.remove('drop-target', 'dragging'));
    if (d.ghost) {
      d.ghost.remove();
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const sq = over && over.closest('.sq');
      if (sq) {
        const to = +sq.dataset.i;
        if (to !== d.from && !tryMove(d.from, to)) select(d.from);
        else if (to === d.from) select(d.from);
      } else select(d.from);
    }
  };
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);

  /* ---------- Coronación ---------- */
  function askPromotion(color) {
    return new Promise((resolve) => {
      const row = $('promo-row');
      row.innerHTML = ['q', 'r', 'b', 'n'].map((type) =>
        `<button type="button" data-p="${type}" class="${color}" title="${t('piece_names')[type]}"><svg><use href="#pc-${type}"/></svg></button>`).join('');
      const dlg = $('dlg-promo');
      row.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        dlg.close();
        resolve(b.dataset.p);
      };
      dlg.oncancel = (e) => e.preventDefault();
      dlg.showModal();
    });
  }

  /* ---------- Mensajes ---------- */
  function showMessage(title, body, okLabel, onOk, cancelLabel, alt) {
    const dlg = $('dlg-msg');
    $('msg-title').textContent = title;
    $('msg-body').textContent = body;
    $('msg-ok').textContent = okLabel;
    $('msg-cancel').textContent = cancelLabel || t('close');
    $('msg-ok').onclick = () => { dlg.close(); onOk && onOk(); };
    $('msg-cancel').onclick = () => dlg.close();
    const altBtn = $('msg-alt');
    altBtn.hidden = !alt;
    if (alt) { altBtn.textContent = alt.label; altBtn.onclick = () => { dlg.close(); alt.onClick(); }; }
    dlg.showModal();
  }

  /* ---------- Reloj ---------- */
  setInterval(() => {
    if (!state.clockOn || state.paused || state.over || view !== 'play') { state.lastTick = Date.now(); return; }
    const now = Date.now();
    const elapsed = now - state.lastTick; state.lastTick = now;
    state.clocks[playGame.turn] -= elapsed;
    if (state.clocks[playGame.turn] <= 0) {
      state.clocks[playGame.turn] = 0;
      endGame(playGame.turn === 'w' ? '0-1' : '1-0', 'time');
      return;
    }
    renderClocks();
  }, 200);

  /* ---------- Pausa ---------- */
  function setPaused(on) {
    state.paused = on;
    $('pause-veil').hidden = !on;
    state.lastTick = Date.now();
    renderButtons();
    if (!on && machineToMove() && !state.thinking) requestAIMove();
  }
  $('btn-pause').addEventListener('click', () => setPaused(true));
  $('btn-resume').addEventListener('click', () => setPaused(false));

  /* ---------- Nueva partida ---------- */
  function newGame() {
    cancelAI();
    playGame.reset();
    state.log = []; state.lastMove = null; state.over = null; state.paused = false;
    state.selected = -1; state.targets = [];
    $('pause-veil').hidden = true;
    state.humanColor = settings.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.color;
    state.flipped = isAIMode() && state.humanColor === 'b';
    state.clocks = { w: settings.time * 60000, b: settings.time * 60000 };
    state.clockOn = false;
    if (view === 'play') { buildBoard(); renderAll(); if (machineToMove()) requestAIMove(); }
  }

  function segValue(id) { return document.querySelector(`#${id} button.on`).dataset.v; }
  function segSet(id, v) {
    document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  }
  document.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      if (seg.id === 'seg-mode') updateModeFields();
      if (seg.id === 'lang-seg') { settings.lang = b.dataset.lang; save(); I18N.set(settings.lang); renderAll(); renderLessonList(); }
    });
  });
  function updateModeFields() {
    const ai = segValue('seg-mode') === 'ai';
    $('field-level').style.display = ai ? '' : 'none';
    $('field-color').style.display = ai ? '' : 'none';
  }

  $('btn-new').addEventListener('click', () => {
    segSet('seg-mode', settings.mode); segSet('seg-level', settings.level);
    segSet('seg-color', settings.color); segSet('seg-time', settings.time);
    updateModeFields();
    $('dlg-new').showModal();
  });
  $('dlg-new-cancel').addEventListener('click', () => $('dlg-new').close());
  $('dlg-new-start').addEventListener('click', () => {
    settings.mode = segValue('seg-mode');
    settings.level = +segValue('seg-level');
    settings.color = segValue('seg-color');
    settings.time = +segValue('seg-time');
    save();
    $('dlg-new').close();
    if (view !== 'play') setView('play', true);
    newGame();
  });

  /* ---------- Rendirse / deshacer ---------- */
  $('btn-resign').addEventListener('click', () => {
    if (state.over) return;
    showMessage(t('resign_title'), t('resign_body'), t('resign'), () => {
      const loser = isAIMode() ? state.humanColor : playGame.turn;
      endGame(loser === 'w' ? '0-1' : '1-0', 'resign');
    }, t('cancel'));
  });
  $('btn-undo').addEventListener('click', undo);

  /* ---------- Ajustes globales ---------- */
  $('btn-settings').addEventListener('click', () => $('dlg-settings').showModal());
  $('dlg-settings-close').addEventListener('click', () => $('dlg-settings').close());
  $('btn-reset-progress').addEventListener('click', () => {
    progress = {}; save(); renderLessonList();
    $('btn-reset-progress').textContent = t('progress_reset');
    setTimeout(() => { $('btn-reset-progress').textContent = t('reset_progress'); }, 1500);
  });

  $('sw-hints').checked = settings.hints;
  $('sw-hints').addEventListener('change', (e) => { settings.hints = e.target.checked; save(); renderBoard(); });

  function applyTheme() {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
    document.querySelectorAll('#swatches .swatch').forEach((b) => {
      b.classList.toggle('on', b.dataset.accent === settings.accent);
      b.title = t('c_' + b.dataset.accent);
    });
  }
  $('swatches').addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    settings.accent = b.dataset.accent; save(); applyTheme();
  });
  $('sw-theme').checked = settings.theme === 'dark';
  $('sw-theme').addEventListener('change', (e) => { settings.theme = e.target.checked ? 'dark' : 'light'; save(); applyTheme(); });

  $('sw-sound').checked = settings.sound;
  $('sw-sound').addEventListener('change', (e) => { settings.sound = e.target.checked; save(); });
  $('sw-voice').checked = settings.voice;
  $('sw-voice').addEventListener('change', (e) => { settings.voice = e.target.checked; save(); if (!settings.voice) hush(); });
  document.querySelectorAll('#voice-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.ttsVoice));
  $('voice-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    settings.ttsVoice = b.dataset.v; save();
  });
  $('btn-voice-test').addEventListener('click', () => { const was = settings.voice; settings.voice = true; say(t('tts_sample')); settings.voice = was; });

  document.querySelectorAll('#lang-seg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === settings.lang));

  /* ---------- Navegación global ---------- */
  function setView(v, silent) {
    if (v === view && !silent) return;
    hush();
    view = v;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('panel-play').hidden = v !== 'play';
    $('panel-learn').hidden = v !== 'learn';
    $('panel-history').hidden = v !== 'history';
    state.selected = -1; state.targets = [];
    if (v === 'history') {
      cancelAI();
      game = reviewGame;
      renderHistoryList();
      if (review.g) { state.flipped = review.g.mode === 'ai' && review.g.color === 'b'; buildBoard(); reviewGoto(review.ply); }
      else { reviewGame.reset(); state.flipped = false; state.lastMove = null; buildBoard(); renderAll(); }
    } else if (v === 'play') {
      game = playGame;
      state.flipped = isAIMode() && state.humanColor === 'b';
      state.lastMove = playGame.history.length ? playGame.history[playGame.history.length - 1].move : null;
      state.lastTick = Date.now();
      buildBoard(); renderAll();
      if (machineToMove() && !state.thinking) requestAIMove();
    } else {
      cancelAI();
      game = learnGame;
      if (learn.lesson) loadStage(learn.stage);
      else {
        learnGame.reset();
        state.flipped = false; state.lastMove = null;
        buildBoard(); renderAll();
      }
    }
  }
  $('nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (b) setView(b.dataset.view);
  });

  /* ---------- Aprender ---------- */
  const lessonById = (id) => LESSONS.lessons.find((l) => l.id === id);
  const stage = () => learn.lesson.stages[learn.stage];
  const lessonDone = (l) => (progress[l.id] || 0) >= l.stages.length;

  function renderLessonList() {
    renderXP();
    const box = $('lesson-groups');
    box.innerHTML = '';
    for (const g of LESSONS.groups) {
      const title = document.createElement('div');
      title.className = 'lesson-group-title';
      title.textContent = L(g.title);
      box.appendChild(title);
      for (const les of LESSONS.lessons.filter((l) => l.group === g.id)) {
        const doneN = progress[les.id] || 0;
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'lesson-item'; btn.dataset.id = les.id;
        const prog = lessonDone(les)
          ? `<span class="done"><svg><use href="#ic-check"/></svg></span>`
          : les.stages.map((_, i) => `<span class="p ${i < doneN ? 'on' : ''}"></span>`).join('');
        btn.innerHTML = `<span class="lesson-icon"><svg><use href="#pc-${les.piece}"/></svg></span>`
          + `<span><div class="title">${L(les.title)}</div><div class="sub">${les.stages.length} ${t('stage').toLowerCase()}${les.stages.length > 1 ? 's' : ''}</div></span>`
          + `<span class="lesson-prog">${prog}</span>`;
        box.appendChild(btn);
      }
    }
  }
  $('lesson-groups').addEventListener('click', (e) => {
    const b = e.target.closest('.lesson-item');
    if (b) openLesson(b.dataset.id);
  });

  function openLesson(id) {
    learn.lesson = lessonById(id);
    if (!learn.lesson) return;
    const startAt = Math.min(progress[id] || 0, learn.lesson.stages.length - 1);
    $('learn-list').hidden = true;
    $('learn-stage').hidden = false;
    loadStage(startAt);
  }

  function closeLesson() {
    learn.lesson = null;
    learn.stars = new Set();
    $('learn-list').hidden = false;
    $('learn-stage').hidden = true;
    learnGame.reset();
    state.flipped = false; state.lastMove = null; state.selected = -1; state.targets = [];
    buildBoard(); renderAll();
  }
  $('learn-back').addEventListener('click', closeLesson);

  function loadStage(i, keepFeedback) {
    learn.stage = i;
    const st = stage();
    game = learnGame;
    learnGame.load(st.fen);
    learn.color = st.color || 'w';
    learn.stars = new Set((st.stars || []).map(fromAlg));
    learn.moves = 0; learn.done = false; learn.busy = false;
    if (!keepFeedback) { learn.feedback = ''; learn.feedbackKind = ''; learn.feedbackTitle = ''; learn.feedbackXP = ''; }
    state.selected = -1; state.targets = []; state.lastMove = null; state.over = null;
    state.flipped = learn.color === 'b';
    buildBoard(); renderAll();
  }

  function learnMove(m) {
    if (learn.feedbackKind === 'err') { learn.feedback = ''; learn.feedbackKind = ''; learn.feedbackTitle = ''; }
    const st = stage(); const g = learnGame;
    const opp = learn.color === 'w' ? 'b' : 'w';
    learn.moves++;
    let ok = false, fail = null;
    switch (st.type) {
      case 'stars':
        if (learn.stars.delete(m.to)) sfx.star();
        ok = learn.stars.size === 0; break;
      case 'capture':
        ok = !g.board.some((p) => p && p.color === opp); break;
      case 'check':
        if (g.inCheck(opp)) ok = true; else fail = 'not_check'; break;
      case 'mate':
        if (g.isCheckmate()) ok = true;
        else if (g.isStalemate()) fail = 'stalemate_oops';
        else if (g.inCheck(opp)) fail = 'not_mate';
        else fail = 'not_check';
        break;
      case 'escape': ok = true; break;
      case 'castle': if (m.castle) ok = true; else fail = 'not_castle'; break;
      case 'enpassant': if (m.enPassant) ok = true; else fail = 'not_ep'; break;
      case 'promote': if (m.promotion) ok = true; else fail = 'not_promote'; break;
      case 'safe': {
        const tsq = fromAlg(st.target);
        if (m.from !== tsq) fail = 'not_safe_piece';
        else if (g.isAttacked(m.to, opp)) fail = 'not_safe';
        else ok = true;
        break;
      }
      case 'value': if (m.captured === st.target) ok = true; else fail = 'not_value'; break;
    }
    // El rival no mueve en las lecciones
    g.turn = learn.color; g._legalCache = null;

    if (ok) {
      learn.done = true;
      sfx.success();
      const prev = progress[learn.lesson.id] || 0;
      const firstTime = learn.stage >= prev;
      progress[learn.lesson.id] = Math.max(prev, learn.stage + 1);
      // Experiencia: solo la primera vez que se supera la etapa; bonus si se hace en el mínimo de jugadas
      let gained = 0;
      if (firstTime) {
        gained = XP_STAGE + (learn.moves <= st.par ? XP_BONUS : 0);
        progress._xp = xpTotal() + gained;
      }
      save();
      const cnt = learn.moves === 1 ? t('in_move') : t('in_moves', { n: learn.moves });
      learn.feedbackTitle = t('great');
      learn.feedback = `${cnt.charAt(0).toUpperCase() + cnt.slice(1)}.` + (learn.moves > st.par ? ' ' + t('par_hint', { n: st.par }) : '');
      learn.feedbackXP = gained ? t('xp_gain', { n: gained }) + (gained > XP_STAGE ? ' · ' + t('xp_bonus') : '') : t('xp_repeat');
      learn.feedbackKind = 'ok';
      renderAll();
    } else if (fail) {
      // Se muestra la jugada errónea un momento; después la pieza vuelve sola
      // y el mensaje permanece hasta la siguiente jugada.
      learn.busy = true;
      sfx.fail();
      learn.feedbackTitle = t('try_again');
      learn.feedback = t(fail);
      learn.feedbackXP = '';
      learn.feedbackKind = 'err';
      renderAll();
      setTimeout(() => { if (learn.lesson && learn.busy) loadStage(learn.stage, true); }, 1200);
    } else {
      if (m.captured) sfx.capture(); else if (st.type !== 'stars') sfx.move();
      learn.feedbackTitle = ''; learn.feedbackXP = '';
      if (st.type === 'stars') learn.feedback = t('stars_left', { n: learn.stars.size });
      if (st.type === 'capture') learn.feedback = t('pieces_left', { n: g.board.filter((p) => p && p.color === opp).length });
      learn.feedbackKind = '';
      renderAll();
    }
  }

  function meterHTML(xp, extraSub) {
    const r = rankFor(xp);
    const frac = r.to ? (xp - r.from) / (r.to - r.from) : 1;
    const cells = Array.from({ length: 12 }, (_, i) => `<i class="${i < Math.round(frac * 12) ? 'on' : ''}"></i>`).join('');
    return `<span class="m-label">${t('xp')}</span>`
      + `<span class="m-total">${xp}<small>${t('xp_label')}</small></span>`
      + `<span class="m-value"><span class="lesson-icon"><svg><use href="#pc-${r.piece}"/></svg></span>${t('level')} ${r.index + 1} · ${t('rank_' + r.piece).toUpperCase()}</span>`
      + `<span class="led-bar">${cells}</span>`
      + `<span class="m-sub">${r.to ? t('to_next', { n: r.to - xp }) : t('max_level')}${extraSub ? ' · ' + extraSub : ''}</span>`;
  }
  function renderXP() {
    const xp = xpTotal(), r = rankFor(xp);
    $('xp-card').innerHTML = meterHTML(xp);
    $('xp-chip').textContent = `${String(xp).padStart(4, '0')} XP · ${t('rank_' + r.piece).toUpperCase()}`;
  }

  function renderLearn() {
    if (!learn.lesson) return;
    const les = learn.lesson, st = stage();
    $('lesson-icon').innerHTML = `<svg><use href="#pc-${les.piece}"/></svg>`;
    $('lesson-title').textContent = L(les.title);
    $('lesson-intro').textContent = L(les.intro);
    const doneN = progress[les.id] || 0;
    $('stage-dots').innerHTML = les.stages.map((_, i) => `<span class="sd ${i < doneN ? 'done' : ''} ${i === learn.stage ? 'cur' : ''}" title="${t('stage')} ${i + 1}"></span>`).join('');
    $('lesson-text').textContent = L(st.text);
    const fb = $('lesson-feedback');
    fb.innerHTML = (learn.feedbackTitle ? `<span class="fb-title"><span class="led ${learn.feedbackKind}"></span>${learn.feedbackTitle}</span><br>` : '')
      + (learn.feedbackKind ? learn.feedback : (learn.feedback ? `<span class="dim">${learn.feedback}</span>` : ''))
      + (learn.feedbackXP ? `<span class="fb-xp">${learn.feedbackXP}</span>` : '');
    fb.className = 'fb ' + learn.feedbackKind;
    renderXP();
    const last = learn.stage === les.stages.length - 1;
    $('btn-next').disabled = !learn.done;
    $('btn-next').querySelector('.ctl-label').textContent = last ? t('finish') : t('next');
  }

  $('btn-restart').addEventListener('click', () => { if (learn.lesson) loadStage(learn.stage); });
  $('btn-next').addEventListener('click', () => {
    if (!learn.lesson || !learn.done) return;
    if (learn.stage + 1 < learn.lesson.stages.length) { loadStage(learn.stage + 1); return; }
    // lección terminada: pasar a la siguiente pendiente o volver a la lista
    const all = LESSONS.lessons;
    const idx = all.indexOf(learn.lesson);
    const next = all.slice(idx + 1).find((l) => !lessonDone(l)) || all.find((l) => !lessonDone(l));
    renderLessonList();
    if (next) { openLesson(next.id); }
    else { closeLesson(); showMessage(t('lesson_done'), t('all_done'), t('nav_play'), () => setView('play')); }
  });

  /* ---------- Partidas: registro, lista y reproducción ---------- */
  const review = { g: null, ply: 0 };

  function recordGame(result, reason) {
    if (!state.log.length) return;
    const g = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString(),
      mode: settings.mode, level: isAIMode() ? settings.level : null, color: isAIMode() ? state.humanColor : null,
      result, reason, moves: state.log.slice(),
    };
    games.unshift(g); games = games.slice(0, 100); saveGames();
    if (window.Account && Account.user) Account.addGame(g).catch(() => { /* se reintenta al sincronizar */ });
  }

  const gameTitle = (g) => (g.mode === 'ai' ? `${t('vs_machine')} · ${t('lvl_short')} ${g.level}` : t('vs_human'));
  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(I18N.lang === 'es' ? 'es-ES' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  const resultClass = (g) => (g.result === '1-0' ? 'w' : g.result === '0-1' ? 'b' : 'd');

  function renderHistoryList() {
    $('history-intro').textContent = window.Account && Account.user ? t('history_cloud') : t('history_local');
    const box = $('game-list');
    box.dataset.empty = t('no_games');
    box.innerHTML = '';
    for (const g of games) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'game-item'; btn.dataset.id = g.id;
      const fullMoves = Math.ceil(g.moves.length / 2);
      btn.innerHTML = `<span class="res ${resultClass(g)}"></span>`
        + `<span><div class="g-title">${gameTitle(g)}</div><div class="g-sub">${fmtDate(g.date)} · ${fullMoves} ${t('moves_word')}</div></span>`
        + `<span class="g-right">${g.result}<br>${g.review ? `<span class="g-acc">${g.review.acc.w}% · ${g.review.acc.b}%</span>` : t('r_' + g.reason).replace(/\.$/, '')}</span>`;
      box.appendChild(btn);
    }
  }
  $('game-list').addEventListener('click', (e) => {
    const b = e.target.closest('.game-item');
    if (!b) return;
    const g = games.find((x) => x.id === b.dataset.id);
    if (g) openGame(g);
  });

  function openGame(g) {
    review.g = g; review.ply = 0;
    reviewGame.reset();
    game = reviewGame;
    $('history-list').hidden = true;
    $('history-review').hidden = false;
    state.flipped = g.mode === 'ai' && g.color === 'b';
    buildBoard();
    reviewGoto(g.review ? 0 : g.moves.length);   // revisada: resumen; si no, posición final
    hush();
  }
  function closeReview() {
    hush(); reviewRun.id++; reviewRun.busy = false;
    review.g = null; review.ply = 0;
    $('history-list').hidden = false;
    $('history-review').hidden = true;
    reviewGame.reset(); state.flipped = false; state.lastMove = null;
    buildBoard(); renderAll();
  }
  function reviewGoto(ply) {
    const g = review.g; if (!g) return;
    ply = Math.max(0, Math.min(g.moves.length, ply));
    while (reviewGame.history.length > ply) reviewGame.undo();
    while (reviewGame.history.length < ply) {
      const m = g.moves[reviewGame.history.length];
      if (!reviewGame.move({ from: m.from, to: m.to, promotion: m.promotion || null })) break;
    }
    review.ply = reviewGame.history.length;
    state.lastMove = review.ply ? reviewGame.history[review.ply - 1].move : null;
    state.selected = -1; state.targets = [];
    renderAll();
    const rv = g.review;
    if (rv && review.ply > 0 && rv.plies[review.ply - 1]) {
      const cur = g.moves[review.ply - 1];
      say(`${spokenSan(cur.san)}. ${coachSpeech(rv.plies[review.ply - 1])}`);
    }
  }
  function renderReview() {
    const g = review.g; if (!g) return;
    const n = g.moves.length, p = review.ply;
    const cur = p ? g.moves[p - 1] : null;
    const num = cur ? (Math.floor((p - 1) / 2) + 1) + (cur.color === 'w' ? '.' : '…') : '';
    let html = `<span class="dim">${gameTitle(g)} · ${fmtDate(g.date)}</span><br>`;
    html += cur ? `${num} ${cur.san}` : t('rev_begin');
    html += ` <span class="dim">${String(p).padStart(2, '0')}/${String(n).padStart(2, '0')}</span>`;
    if (p === n) html += `<br><span class="fb-title"><span class="led"></span>${t('rev_end')}</span><br>${resultText({ result: g.result, reason: g.reason })}`;
    const rv = g.review;
    if (reviewRun.busy) {
      html += `<div class="fb"><span class="fb-title"><span class="led"></span>${t('coach')}</span><br>${t('reviewing', { i: reviewRun.progress, n: reviewRun.total })}`
        + `<span class="bar"><i style="width:${reviewRun.total ? Math.round(reviewRun.progress / reviewRun.total * 100) : 0}%"></i></span></div>`;
    } else if (rv && p === 0) {
      const c = (col) => t('counts_line', { bl: rv.counts[col].blunder || 0, mi: rv.counts[col].mistake || 0, in: rv.counts[col].inaccuracy || 0 });
      html += `<div class="fb"><span class="fb-title"><span class="led"></span>${t('accuracy')}</span>`
        + `<span class="acc-row"><span class="acc"><small>${t('white')}</small><b>${rv.acc.w}%</b><span class="bar"><i style="width:${rv.acc.w}%"></i></span><small>${c('w')}</small></span>`
        + `<span class="acc"><small>${t('black')}</small><b>${rv.acc.b}%</b><span class="bar"><i style="width:${rv.acc.b}%"></i></span><small>${c('b')}</small></span></span></div>`;
    } else if (rv && rv.plies[p - 1]) {
      const ply = rv.plies[p - 1];
      html += `<div class="fb"><span class="fb-title"><span class="led ${ply.cls}"></span>${t('cls_' + ply.cls)}</span><br>${coachComment(ply).replace(t('cls_' + ply.cls) + '. ', '')}</div>`;
    } else if (!rv) {
      html += `<div class="fb"><span class="dim">${t('review_hint')}</span></div>`;
    }
    $('review-screen').innerHTML = html;
    $('btn-rev-start').disabled = p === 0 || reviewRun.busy;
    $('btn-rev-prev').disabled = p === 0 || reviewRun.busy;
    $('btn-rev-next').disabled = p === n || reviewRun.busy;
    $('btn-review').disabled = reviewRun.busy || !!rv;
  }
  $('history-back').addEventListener('click', closeReview);
  $('btn-rev-start').addEventListener('click', () => reviewGoto(0));
  $('btn-rev-prev').addEventListener('click', () => reviewGoto(review.ply - 1));
  $('btn-rev-next').addEventListener('click', () => reviewGoto(review.ply + 1));

  /* ---------- Voz del entrenador (Web Speech API, sin servicios externos) ---------- */
  const speech = { on: 'speechSynthesis' in window, voice: null };
  function pickVoice() {
    if (!speech.on) return null;
    const lang = I18N.lang === 'es' ? 'es' : 'en';
    const voices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
    const preferred = voices.find((v) => /monica|paulina|jorge|google|premium|enhanced|samantha|daniel/i.test(v.name)) || voices[0];
    return preferred || null;
  }
  if (speech.on) speechSynthesis.onvoiceschanged = () => { speech.voice = pickVoice(); };
  /* Voz en la nube (Gemini TTS a través de /api/tts). Si la función no está
     configurada (501), falla o agota la cuota, se usa la voz del navegador. */
  const tts = { available: true, cache: new Map(), source: null, seq: 0 };
  const ttsKey = (text) => `${I18N.lang}|${settings.ttsVoice}|${text}`;
  async function ttsFetch(text) {
    const key = ttsKey(text);
    if (tts.cache.has(key)) return tts.cache.get(key);
    const url = `api/tts?t=${encodeURIComponent(text)}&v=${encodeURIComponent(settings.ttsVoice)}&l=${I18N.lang}`;
    let res = null;
    try { if ('caches' in window) { const c = await caches.open('rams-tts-v1'); res = await c.match(url); } } catch (e) { res = null; }
    if (!res) {
      res = await fetch(url);
      if (res.status === 501 || res.status === 404) { tts.available = false; throw new Error('tts-unavailable'); }
      if (!res.ok) throw new Error('tts-' + res.status);
      try { if ('caches' in window) { const c = await caches.open('rams-tts-v1'); await c.put(url, res.clone()); } } catch (e) { /* sin caché */ }
    }
    const buf = await res.arrayBuffer();
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audio.decodeAudioData(buf);
    tts.cache.set(key, decoded);
    return decoded;
  }
  function ttsStop() {
    if (tts.source) { try { tts.source.stop(); } catch (e) { /* ya parado */ } tts.source = null; }
    $('btn-review').classList.remove('speaking');
  }
  async function sayCloud(text) {
    const seq = ++tts.seq;
    const decoded = await ttsFetch(text);
    if (seq !== tts.seq) return;           // llegó una frase más nueva mientras se generaba
    ttsStop();
    if (audio.state === 'suspended') await audio.resume();
    const src = audio.createBufferSource();
    src.buffer = decoded;
    src.connect(audio.destination);
    src.onended = () => { if (tts.source === src) { tts.source = null; $('btn-review').classList.remove('speaking'); } };
    tts.source = src;
    $('btn-review').classList.add('speaking');
    src.start();
  }
  function say(text) {
    if (!settings.voice || !text) return;
    ttsStop();
    if (tts.available) {
      sayCloud(text).catch(() => { if (settings.voice) sayLocal(text); });
      return;
    }
    sayLocal(text);
  }
  function sayLocal(text) {
    if (!speech.on || !settings.voice || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[#+]/g, ''));
      u.lang = I18N.lang === 'es' ? 'es-ES' : 'en-GB';
      u.rate = 1; u.pitch = 1;
      speech.voice = speech.voice || pickVoice();
      if (speech.voice) u.voice = speech.voice;
      const btn = $('btn-review');
      u.onstart = () => btn.classList.add('speaking');
      u.onend = () => btn.classList.remove('speaking');
      u.onerror = () => btn.classList.remove('speaking');
      speechSynthesis.speak(u);
    } catch (e) { /* sin voz */ }
  }
  function hush() { tts.seq++; ttsStop(); if (speech.on) { try { speechSynthesis.cancel(); } catch (e) { /* ignorar */ } } }

  /* ---------- Revisión de partida (motor + comentarios de plantilla) ---------- */
  const reviewRun = { id: 0, busy: false, progress: 0, total: 0 };
  function spokenSan(san) {
    // "Nf3" -> "caballo f3", "O-O" -> "enroque corto"…
    const names = I18N.lang === 'es'
      ? { N: 'caballo', B: 'alfil', R: 'torre', Q: 'dama', K: 'rey' }
      : { N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
    if (san === 'O-O') return I18N.lang === 'es' ? 'enroque corto' : 'castles short';
    if (san === 'O-O-O') return I18N.lang === 'es' ? 'enroque largo' : 'castles long';
    let out = san.replace(/[+#]/g, '');
    out = out.replace(/^([NBRQK])/, (m, p) => names[p] + ' ');
    out = out.replace(/x/, I18N.lang === 'es' ? ' por ' : ' takes ');
    out = out.replace(/=([NBRQ])/, (m, p) => (I18N.lang === 'es' ? ' corona ' : ' promotes to ') + names[p]);
    return out;
  }
  function coachComment(ply, plyIndex) {
    const parts = [];
    parts.push(t('cls_' + ply.cls) + '.');
    if (ply.delivered === 'mate') { parts.push(t('mate_played')); return parts.join(' '); }
    if (ply.mateMissed && ply.best) parts.push(t('mate_missed', { m: ply.best.san }));
    else if (ply.cls === 'best') parts.push(t('keeps_best'));
    else if (ply.cls === 'excellent' || ply.cls === 'good') { if (ply.best) parts.push(t('also_good', { m: ply.best.san })); }
    else if (ply.best) parts.push(t('better_was', { m: ply.best.san }));
    if ((ply.cls === 'mistake' || ply.cls === 'blunder') && ply.reply && ply.reply.captured && ply.loss >= 150) parts.push(t('loses_material', { m: ply.reply.san }));
    return parts.join(' ');
  }
  function coachSpeech(ply) {
    return coachComment(ply).replace(/\b(O-O-O|O-O|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?[+#]?)\b/g, (m) => spokenSan(m));
  }
  function startReview() {
    const g = review.g; if (!g || reviewRun.busy) return;
    if (g.review) { renderReview(); return; }
    const id = ++reviewRun.id;
    reviewRun.busy = true; reviewRun.progress = 0; reviewRun.total = g.moves.length;
    renderReview();
    const moves = g.moves.map((m) => ({ from: m.from, to: m.to, promotion: m.promotion || null }));
    const finish = (result) => {
      if (id !== reviewRun.id) return;
      reviewRun.busy = false;
      g.review = result; saveGames();
      sfx.success();
      reviewGoto(0);
      renderHistoryList();
      say(`${t('accuracy')}: ${t('summary_line', { w: result.acc.w, b: result.acc.b })}`);
    };
    if (worker) {
      const handler = (e) => {
        if (e.data.id !== id) return;
        if (e.data.progress !== undefined) { reviewRun.progress = e.data.progress; renderReview(); return; }
        worker.removeEventListener('message', handler);
        finish(e.data.review);
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ id, analyze: true, moves, opts: { time: 150, depth: 4 } });
    } else {
      setTimeout(() => finish(ChessAI.analyzeGame(moves, { time: 120, depth: 3 })), 30);
    }
  }
  $('btn-review').addEventListener('click', startReview);

  /* ---------- Cuenta sin contraseña ---------- */
  let acctEmail = '';
  function acctMsg(text, kind) { const el = $('acct-msg'); el.textContent = text || ''; el.className = 'screen mono small' + (kind === 'err' ? ' alert' : ''); }
  function acctRender() {
    const conf = window.Account && Account.configured();
    const user = conf ? Account.user : null;
    $('acct-unconfigured').hidden = conf;
    $('acct-login').hidden = !conf || !!user;
    $('acct-user').hidden = !conf || !user;
    $('acct-led').hidden = !user;
    if (user) {
      $('acct-email-label').textContent = `${t('signed_as')} ${user.email}`;
      $('acct-stats').innerHTML = meterHTML(xpTotal(), `${games.length} ${t('games_label').toLowerCase()}`);
    }
  }
  function acctReset() {
    $('acct-code-field').hidden = true; $('acct-verify').hidden = true; $('acct-send').hidden = false;
    $('acct-code').value = ''; acctMsg('');
  }
  $('btn-account').addEventListener('click', () => { acctRender(); acctReset(); $('dlg-account').showModal(); });
  $('acct-cancel').addEventListener('click', () => $('dlg-account').close());
  $('acct-close').addEventListener('click', () => $('dlg-account').close());
  $('acct-close-unconf').addEventListener('click', () => $('dlg-account').close());
  $('acct-send').addEventListener('click', async () => {
    const email = $('acct-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { acctMsg(t('bad_email'), 'err'); return; }
    acctEmail = email; acctMsg(t('sending'));
    $('acct-send').disabled = true;
    try {
      await Account.sendCode(email);
      acctMsg(t('code_sent'));
      $('acct-code-field').hidden = false; $('acct-verify').hidden = false; $('acct-send').hidden = true;
      $('acct-code').focus();
    } catch (err) { acctMsg((err && err.message) || t('acct_error'), 'err'); }
    $('acct-send').disabled = false;
  });
  $('acct-verify').addEventListener('click', async () => {
    const code = $('acct-code').value.replace(/\D/g, '');
    if (code.length !== 6) { acctMsg(t('bad_code'), 'err'); return; }
    acctMsg(t('verifying'));
    $('acct-verify').disabled = true;
    try {
      await Account.verify(acctEmail, code);
      $('dlg-account').close();
    } catch (err) { acctMsg((err && err.message) || t('acct_error'), 'err'); }
    $('acct-verify').disabled = false;
  });
  $('acct-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('acct-verify').click(); });
  $('acct-email').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('acct-send').hidden) $('acct-send').click(); });
  $('acct-logout').addEventListener('click', async () => { await Account.signOut(); $('dlg-account').close(); });

  async function syncFromCloud() {
    try {
      const profile = await Account.getProfile();
      if (profile && profile.progress) {
        const cloud = profile.progress;
        for (const k of Object.keys(cloud)) progress[k] = Math.max(progress[k] || 0, cloud[k] || 0);
        progress._xp = Math.max(xpTotal(), profile.xp || 0, cloud._xp || 0);
      }
      save();                                   // guarda local y sube la fusión
      renderLessonList(); if (view === 'learn') renderAll();
      const cloudGames = await Account.listGames();
      const ids = new Set(cloudGames.map((g) => g.id));
      const localOnly = games.filter((g) => !ids.has(g.id));
      for (const g of localOnly) Account.addGame(g).catch(() => { /* siguiente sincronización */ });
      games = [...cloudGames, ...localOnly].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);
      saveGames();
      if (view === 'history') renderHistoryList();
      acctRender();
    } catch (e) { /* sin conexión: seguimos con lo local */ }
  }
  function onAuthChange(user) {
    acctRender();
    if (user) syncFromCloud();
    else if (view === 'history') renderHistoryList();
  }
  acctRender();
  if (window.Account) Account.init(onAuthChange).catch(() => acctRender());

  /* ---------- Teclado ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('dialog')) return;
    if (e.key === 'Escape') select(-1);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  /* ---------- Arranque ---------- */
  applyTheme();
  I18N.set(settings.lang);
  renderLessonList();
  newGame();

  // API mínima para depurar desde la consola
  window.RamsChess = {
    get game() { return game; }, state, settings, learn, review,
    get games() { return games; },
    render: renderAll, setView, openLesson, openGame,
    load(fen) { cancelAI(); game.load(fen); state.log = []; state.lastMove = null; state.over = null; select(-1); renderAll(); },
  };
})();
