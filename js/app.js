/* ============================================================
   app.js — Interfaz y flujo de la partida
   ============================================================ */
(function () {
  'use strict';

  const { fileOf, rankOf, toAlg, FILES, PIECE_VALUE } = ChessUtil;
  const t = (k) => I18N.t(k);
  const $ = (id) => document.getElementById(id);

  /* ---------- Estado ---------- */
  const game = new Chess();
  const settings = Object.assign({
    mode: 'ai', level: 2, color: 'w', time: 5,
    hints: true, theme: 'light', sound: true, lang: 'es',
  }, load('rams-chess-settings'));

  const state = {
    humanColor: 'w',        // en modo máquina, el color del humano
    flipped: false,
    selected: -1,
    targets: [],
    lastMove: null,
    over: null,             // { result, reason }
    paused: false,
    clocks: { w: 0, b: 0 },
    clockOn: false,
    lastTick: 0,
    thinking: false,
    aiRequest: 0,
    log: [],                // [{san, color}]
  };

  function load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem('rams-chess-settings', JSON.stringify(settings)); } catch (e) { /* sin almacenamiento */ } }

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
  const sfx = {
    move: () => beep(520, 0.08, 'triangle'),
    capture: () => { beep(320, 0.1, 'square', 0.06); setTimeout(() => beep(240, 0.12, 'square', 0.05), 60); },
    check: () => { beep(880, 0.1); setTimeout(() => beep(1100, 0.14), 90); },
    end: () => { beep(440, 0.2); setTimeout(() => beep(330, 0.3), 180); },
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
    const fen = game.fen();
    const started = Date.now();
    const deliver = (m) => {
      if (id !== state.aiRequest) return;             // petición cancelada (deshacer, nueva partida…)
      const wait = Math.max(0, 450 - (Date.now() - started)); // pequeña pausa para que se vea natural
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
        const r = ChessAI.chooseMove(game, settings.level);
        deliver(r ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion || null } : null);
      }, 30);
    }
  }

  const isAIMode = () => settings.mode === 'ai';
  const machineColor = () => (state.humanColor === 'w' ? 'b' : 'w');
  const humanToMove = () => !isAIMode() || game.turn === state.humanColor;
  const canInteract = () => !state.over && !state.paused && !state.thinking && humanToMove();

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
    // coordenadas
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
      const target = settings.hints ? state.targets.find((m) => m.to === i) : null;
      el.classList.toggle('hint', !!target);
      el.classList.toggle('capture', !!target && !!target.captured);
      el.classList.remove('drop-target', 'dragging');
    }
  }

  /* ---------- Panel ---------- */
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
    $('player-top').classList.toggle('active', game.turn === top && !state.over);
    $('player-bottom').classList.toggle('active', game.turn === bottom && !state.over);
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

    const cap = game.captured();  // cap.w = piezas negras capturadas por blancas
    const capHTML = (color) => {
      const list = cap[color];
      const victim = color === 'w' ? 'b' : 'w';
      let html = list.map((type) => `<span class="cap ${victim}"><svg><use href="#pc-${type}"/></svg></span>`).join('');
      const bal = game.materialBalance() * (color === 'w' ? 1 : -1);
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

  function renderStatus() {
    const line = $('hint-line');
    line.classList.remove('alert');
    if (state.over) {
      line.textContent = resultText(state.over);
      return;
    }
    if (state.thinking) { line.textContent = t('thinking'); return; }
    if (state.selected >= 0) {
      const p = game.get(state.selected);
      let txt = t('tip_' + p.type);
      if (p.type === 'k' && state.targets.some((m) => m.castle)) txt += ' ' + t('tip_castle');
      if (p.type === 'p' && state.targets.some((m) => m.enPassant)) txt += ' ' + t('tip_ep');
      if (!state.targets.length) txt = t('tip_none');
      line.textContent = txt;
      return;
    }
    if (game.inCheck()) { line.textContent = t('check'); line.classList.add('alert'); return; }
    line.textContent = state.log.length ? t(game.turn === 'w' ? 'turn_w' : 'turn_b') : t('welcome');
  }

  function renderButtons() {
    $('btn-undo').disabled = game.history.length === 0 || state.paused;
    $('btn-resign').disabled = !!state.over || state.paused;
    $('btn-pause').disabled = !!state.over || game.history.length === 0;
  }

  function renderAll() { renderBoard(); renderPlayers(); renderMoves(); renderClocks(); renderStatus(); renderButtons(); }

  function resultText(over) {
    const who = over.result === '1-0' ? t('win_w') : over.result === '0-1' ? t('win_b') : t('draw');
    return `${who} ${t('r_' + over.reason)}`;
  }

  /* ---------- Movimientos ---------- */
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
    state.log.push({ san: done.san, color: done.color });
    state.lastMove = done;
    state.selected = -1; state.targets = [];
    if (settings.time > 0 && !state.clockOn) { state.clockOn = true; state.lastTick = Date.now(); }

    const st = game.status();
    if (st.over) { endGame(st.result, st.reason); }
    else {
      if (game.inCheck()) sfx.check(); else if (done.captured) sfx.capture(); else sfx.move();
      renderAll();
      if (isAIMode() && game.turn === machineColor()) requestAIMove();
    }
    return true;
  }

  function endGame(result, reason) {
    state.over = { result, reason };
    state.clockOn = false;
    state.thinking = false; state.aiRequest++;
    state.selected = -1; state.targets = [];
    sfx.end();
    renderAll();
    showMessage(t('over_title'), resultText(state.over), t('play_again'), () => $('dlg-new').showModal());
  }

  function undo() {
    if (!game.history.length) return;
    state.aiRequest++; state.thinking = false;
    let plies = 1;
    if (isAIMode() && game.turn === state.humanColor && game.history.length >= 2) plies = 2;
    if (isAIMode() && game.turn === machineColor() && state.over) plies = 1;
    for (let k = 0; k < plies; k++) { if (game.undo()) state.log.pop(); }
    state.over = null;
    state.lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
    state.selected = -1; state.targets = [];
    renderAll();
    // si tras deshacer le toca a la máquina (p. ej. deshacer con una sola jugada), que juegue
    if (isAIMode() && game.turn === machineColor() && !state.paused) requestAIMove();
  }

  /* ---------- Interacción: clic y arrastre ---------- */
  let drag = null;
  boardEl.addEventListener('pointerdown', (e) => {
    const sq = e.target.closest('.sq');
    if (!sq || !canInteract()) return;
    const i = +sq.dataset.i;
    const p = game.get(i);
    if (p && p.color === game.turn) {
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
    if (!state.clockOn || state.paused || state.over) { state.lastTick = Date.now(); return; }
    const now = Date.now();
    const elapsed = now - state.lastTick; state.lastTick = now;
    state.clocks[game.turn] -= elapsed;
    if (state.clocks[game.turn] <= 0) {
      state.clocks[game.turn] = 0;
      endGame(game.turn === 'w' ? '0-1' : '1-0', 'time');
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
    if (!on && isAIMode() && game.turn === machineColor() && !state.thinking && !state.over) requestAIMove();
  }
  $('btn-pause').addEventListener('click', () => setPaused(true));
  $('btn-resume').addEventListener('click', () => setPaused(false));

  /* ---------- Nueva partida ---------- */
  function newGame() {
    state.aiRequest++; state.thinking = false;
    game.reset();
    state.log = []; state.lastMove = null; state.over = null; state.paused = false;
    state.selected = -1; state.targets = [];
    $('pause-veil').hidden = true;
    state.humanColor = settings.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.color;
    state.flipped = isAIMode() && state.humanColor === 'b';
    state.clocks = { w: settings.time * 60000, b: settings.time * 60000 };
    state.clockOn = false;
    buildBoard();
    renderAll();
    if (isAIMode() && game.turn === machineColor()) requestAIMove();
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
      if (seg.id === 'lang-seg') { settings.lang = b.dataset.lang; save(); I18N.set(settings.lang); renderAll(); }
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
    newGame();
  });

  /* ---------- Rendirse / deshacer ---------- */
  $('btn-resign').addEventListener('click', () => {
    if (state.over) return;
    showMessage(t('resign_title'), t('resign_body'), t('resign'), () => {
      const loser = isAIMode() ? state.humanColor : game.turn;
      endGame(loser === 'w' ? '0-1' : '1-0', 'resign');
    }, t('cancel'));
  });
  $('btn-undo').addEventListener('click', undo);

  /* ---------- Interruptores ---------- */
  $('sw-hints').checked = settings.hints;
  $('sw-hints').addEventListener('change', (e) => { settings.hints = e.target.checked; save(); renderBoard(); });

  function applyTheme() { document.documentElement.dataset.theme = settings.theme; }
  $('sw-theme').checked = settings.theme === 'dark';
  $('sw-theme').addEventListener('change', (e) => { settings.theme = e.target.checked ? 'dark' : 'light'; save(); applyTheme(); });

  $('sw-sound').checked = settings.sound;
  $('sw-sound').addEventListener('change', (e) => { settings.sound = e.target.checked; save(); });

  document.querySelectorAll('#lang-seg button').forEach((b) => b.classList.toggle('on', b.dataset.lang === settings.lang));

  /* ---------- Teclado ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('dialog')) return;
    if (e.key === 'Escape') select(-1);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  /* ---------- Arranque ---------- */
  applyTheme();
  I18N.set(settings.lang);
  newGame();

  // API mínima para depurar desde la consola: RamsChess.game.fen(), RamsChess.load('<FEN>')…
  window.RamsChess = {
    game, state, settings,
    render: renderAll,
    load(fen) { state.aiRequest++; state.thinking = false; game.load(fen); state.log = []; state.lastMove = null; state.over = null; select(-1); renderAll(); },
  };
})();
