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
  let game = playGame;              // partida activa según la vista
  let view = 'play';                // 'play' | 'learn'

  const settings = Object.assign({
    mode: 'ai', level: 2, color: 'w', time: 5,
    hints: true, theme: 'light', sound: true, lang: 'es',
  }, load('rams-chess-settings'));
  let progress = load('rams-chess-progress');   // { lessonId: etapas completadas }

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

  const learn = { lesson: null, stage: 0, color: 'w', stars: new Set(), moves: 0, done: false, busy: false, feedback: '', feedbackKind: '' };

  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  function save() {
    try {
      localStorage.setItem('rams-chess-settings', JSON.stringify(settings));
      localStorage.setItem('rams-chess-progress', JSON.stringify(progress));
    } catch (e) { /* sin almacenamiento */ }
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
    if (view === 'play') renderPlayPanel(); else renderLearn();
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

    state.log.push({ san: done.san, color: done.color });
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
    state.selected = -1; state.targets = [];
    sfx.end();
    renderAll();
    showMessage(t('over_title'), resultText(state.over), t('play_again'), () => $('dlg-new').showModal());
  }

  function undo() {
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
  function showMessage(title, body, okLabel, onOk, cancelLabel) {
    const dlg = $('dlg-msg');
    $('msg-title').textContent = title;
    $('msg-body').textContent = body;
    $('msg-ok').textContent = okLabel;
    $('msg-cancel').textContent = cancelLabel || t('close');
    $('msg-ok').onclick = () => { dlg.close(); onOk && onOk(); };
    $('msg-cancel').onclick = () => dlg.close();
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

  function applyTheme() { document.documentElement.dataset.theme = settings.theme; }
  $('sw-theme').checked = settings.theme === 'dark';
  $('sw-theme').addEventListener('change', (e) => { settings.theme = e.target.checked ? 'dark' : 'light'; save(); applyTheme(); });

  $('sw-sound').checked = settings.sound;
  $('sw-sound').addEventListener('change', (e) => { settings.sound = e.target.checked; save(); });

  document.querySelectorAll('#lang-seg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === settings.lang));

  /* ---------- Navegación global ---------- */
  function setView(v, silent) {
    if (v === view && !silent) return;
    view = v;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('panel-play').hidden = v !== 'play';
    $('panel-learn').hidden = v !== 'learn';
    state.selected = -1; state.targets = [];
    if (v === 'play') {
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

  function loadStage(i) {
    learn.stage = i;
    const st = stage();
    game = learnGame;
    learnGame.load(st.fen);
    learn.color = st.color || 'w';
    learn.stars = new Set((st.stars || []).map(fromAlg));
    learn.moves = 0; learn.done = false; learn.busy = false; learn.feedback = ''; learn.feedbackKind = '';
    state.selected = -1; state.targets = []; state.lastMove = null; state.over = null;
    state.flipped = learn.color === 'b';
    buildBoard(); renderAll();
  }

  function learnMove(m) {
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
      progress[learn.lesson.id] = Math.max(prev, learn.stage + 1);
      save();
      const cnt = learn.moves === 1 ? t('in_move') : t('in_moves', { n: learn.moves });
      learn.feedback = `${t('great')} ${cnt}.` + (learn.moves > st.par ? ' ' + t('par_hint', { n: st.par }) : '');
      learn.feedbackKind = 'ok';
      renderAll();
    } else if (fail) {
      learn.busy = true;
      sfx.fail();
      learn.feedback = `${t(fail)} ${t('try_again')}`;
      learn.feedbackKind = 'err';
      renderAll();
      setTimeout(() => { if (learn.lesson && learn.busy) loadStage(learn.stage); }, 1400);
    } else {
      if (m.captured) sfx.capture(); else if (st.type !== 'stars') sfx.move();
      if (st.type === 'stars') learn.feedback = t('stars_left', { n: learn.stars.size });
      if (st.type === 'capture') learn.feedback = t('pieces_left', { n: g.board.filter((p) => p && p.color === opp).length });
      learn.feedbackKind = '';
      renderAll();
    }
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
    fb.textContent = learn.feedback;
    fb.className = 'lesson-feedback ' + learn.feedbackKind;
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
    get game() { return game; }, state, settings, learn,
    render: renderAll, setView, openLesson,
    load(fen) { cancelAI(); game.load(fen); state.log = []; state.lastMove = null; state.over = null; select(-1); renderAll(); },
  };
})();
