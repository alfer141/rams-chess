/* ============================================================
   ai.js — Motor de juego de la máquina
   Negamax + poda alfa-beta + tablas de posición + búsqueda de
   capturas (quiescence) con profundización iterativa por tiempo.
   Funciona como Web Worker o incluido en la página.
   ============================================================ */
(function (global) {
  'use strict';

  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  // Tablas de posición (desde el punto de vista de las blancas, fila 8 arriba)
  const PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20],
    kEnd: [
      -50, -40, -30, -20, -20, -30, -40, -50,
      -30, -20, -10, 0, 0, -10, -20, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -30, 0, 0, 0, 0, -30, -30,
      -50, -30, -30, -30, -30, -30, -30, -50],
  };
  const mirror = (i) => (7 - Math.floor(i / 8)) * 8 + (i % 8);

  /* Niveles: 1 = aleatorio, 2..5 = profundidad y tiempo crecientes */
  const LEVELS = {
    1: { random: true },
    2: { depth: 1, time: 300, blunder: 0.25 },
    3: { depth: 2, time: 800, blunder: 0.08 },
    4: { depth: 3, time: 1500, blunder: 0 },
    5: { depth: 5, time: 4000, blunder: 0 },
  };

  function evaluate(game) {
    let score = 0, material = 0;
    for (const p of game.board) if (p && p.type !== 'k' && p.type !== 'p') material += VAL[p.type];
    const endgame = material <= 1300;
    for (let i = 0; i < 64; i++) {
      const p = game.board[i];
      if (!p) continue;
      const table = p.type === 'k' && endgame ? PST.kEnd : PST[p.type];
      const pos = p.color === 'w' ? table[i] : table[mirror(i)];
      const v = VAL[p.type] + pos;
      score += p.color === 'w' ? v : -v;
    }
    return game.turn === 'w' ? score : -score;
  }

  function orderMoves(moves) {
    // MVV-LVA: capturas valiosas con piezas baratas primero
    return moves.slice().sort((a, b) => {
      const sa = (a.captured ? VAL[a.captured] * 10 - VAL[a.piece] : 0) + (a.promotion ? 800 : 0);
      const sb = (b.captured ? VAL[b.captured] * 10 - VAL[b.piece] : 0) + (b.promotion ? 800 : 0);
      return sb - sa;
    });
  }

  class Search {
    constructor(game, timeLimit) {
      this.game = game;
      this.deadline = Date.now() + timeLimit;
      this.nodes = 0;
      this.aborted = false;
    }

    quiesce(alpha, beta, depth) {
      this.nodes++;
      const stand = evaluate(this.game);
      if (depth === 0) return stand;
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      const captures = orderMoves(this.game.legalMoves().filter((m) => m.captured || m.promotion));
      for (const m of captures) {
        this.game._apply(m);
        const score = -this.quiesce(-beta, -alpha, depth - 1);
        this.game._revert();
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }
      return alpha;
    }

    negamax(depth, alpha, beta, ply) {
      this.nodes++;
      if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) { this.aborted = true; return 0; }
      const moves = this.game.legalMoves();
      if (moves.length === 0) return this.game.inCheck() ? -100000 + ply : 0;
      if (this.game.halfmove >= 100 || this.game.isThreefold()) return 0;
      if (depth === 0) return this.quiesce(alpha, beta, 4);

      let best = -Infinity;
      for (const m of orderMoves(moves)) {
        this.game._apply(m);
        const score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
        this.game._revert();
        if (this.aborted) return 0;
        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
      return best;
    }

    /* Profundización iterativa: devuelve el mejor movimiento de la última profundidad completada */
    best(maxDepth) {
      const moves = orderMoves(this.game.legalMoves());
      if (!moves.length) return null;
      let bestMove = moves[0], bestScore = -Infinity;
      for (let depth = 1; depth <= maxDepth; depth++) {
        let localBest = null, localScore = -Infinity, alpha = -Infinity;
        // el mejor movimiento anterior se examina primero
        const ordered = [bestMove, ...moves.filter((m) => m !== bestMove)];
        for (const m of ordered) {
          this.game._apply(m);
          const score = -this.negamax(depth - 1, -Infinity, -alpha, 1);
          this.game._revert();
          if (this.aborted) break;
          if (score > localScore) { localScore = score; localBest = m; }
          if (score > alpha) alpha = score;
        }
        if (this.aborted) break;
        bestMove = localBest; bestScore = localScore;
        if (bestScore > 90000) break; // mate encontrado
      }
      return { move: bestMove, score: bestScore, nodes: this.nodes };
    }
  }

  function chooseMove(game, level) {
    const cfg = LEVELS[level] || LEVELS[3];
    const moves = game.legalMoves();
    if (!moves.length) return null;
    if (cfg.random) return { move: moves[Math.floor(Math.random() * moves.length)], score: 0, nodes: 0 };
    // Niveles bajos: a veces juegan una jugada "razonable" al azar en vez de la mejor
    if (cfg.blunder && Math.random() < cfg.blunder) {
      const quiet = moves.filter((m) => !m.captured);
      const pool = quiet.length ? quiet : moves;
      return { move: pool[Math.floor(Math.random() * pool.length)], score: 0, nodes: 0 };
    }
    return new Search(game, cfg.time).best(cfg.depth);
  }

  /* ---------- Revisión de partida (estilo "Game Review") ----------
     Evalúa cada posición con el motor y clasifica cada jugada por la
     pérdida en centipeones respecto a la mejor. Devuelve además la
     precisión por bando (fórmula de porcentaje de victoria, como Lichess). */
  const MATE = 100000;
  const cpClamp = (score) => Math.max(-1500, Math.min(1500, Math.abs(score) > 90000 ? Math.sign(score) * 1500 : score));
  const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cpClamp(cp))) - 1);
  function classify(loss, isBest) {
    if (isBest || loss <= 0) return 'best';
    if (loss <= 25) return 'excellent';
    if (loss <= 60) return 'good';
    if (loss <= 120) return 'inaccuracy';
    if (loss <= 300) return 'mistake';
    return 'blunder';
  }
  function searchPosition(game, time, depth) {
    const moves = game.legalMoves();
    if (!moves.length) return { move: null, score: game.inCheck() ? -MATE : 0, terminal: game.inCheck() ? 'mate' : 'stalemate' };
    const r = new Search(game, time).best(depth);
    return { move: r.move, score: r.score, terminal: null };
  }
  function analyzeGame(moves, opts = {}, onProgress) {
    const time = opts.time || 150, depth = opts.depth || 4;
    const game = new global.Chess();
    const plies = [];
    let cur = searchPosition(game, time, depth);   // análisis de la posición inicial
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const mover = game.turn;
      const legal = game.legalMoves().find((l) => l.from === m.from && l.to === m.to && (l.promotion || null) === (m.promotion || null));
      if (!legal) break;
      const bestSan = cur.move ? game._san(cur.move) : null;
      const isBest = !!cur.move && cur.move.from === legal.from && cur.move.to === legal.to && (cur.move.promotion || null) === (legal.promotion || null);
      game.move(legal);
      const next = searchPosition(game, time, depth);        // mejor respuesta del rival
      const playedScore = -next.score;                       // desde el punto de vista de quien movió
      const bestScore = cur.score;
      const loss = Math.max(0, cpClamp(bestScore) - cpClamp(playedScore));
      const cls = next.terminal === 'mate' ? 'best' : classify(loss, isBest);
      const reply = next.move ? { from: next.move.from, to: next.move.to, san: game._san(next.move), captured: next.move.captured || null } : null;
      plies.push({
        color: mover, cls, loss: Math.round(loss),
        best: cur.move ? { from: cur.move.from, to: cur.move.to, san: bestSan } : null,
        bestScore, playedScore, isBest,
        mateBest: bestScore > 90000, mateMissed: bestScore > 90000 && playedScore < 90000,
        delivered: next.terminal,                             // 'mate' | 'stalemate' | null
        reply,
        acc: Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * (winPct(bestScore) - winPct(playedScore))) - 3.1669)),
      });
      cur = next;
      if (onProgress) onProgress(i + 1, moves.length);
    }
    const acc = { w: 0, b: 0 };
    for (const c of ['w', 'b']) {
      const list = plies.filter((p) => p.color === c);
      acc[c] = list.length ? Math.round(list.reduce((a, p) => a + p.acc, 0) / list.length) : 0;
    }
    const counts = { w: {}, b: {} };
    for (const p of plies) counts[p.color][p.cls] = (counts[p.color][p.cls] || 0) + 1;
    return { plies, acc, counts };
  }

  function coachEval(game, opts = {}) {
    const r = searchPosition(game, opts.time || 200, opts.depth || 3);
    return { best: r.move ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion || null, san: game._san(r.move), captured: r.move.captured || null } : null, score: r.score, terminal: r.terminal };
  }
  const AI = { chooseMove, evaluate, LEVELS, analyzeGame, coachEval, classify, cpClamp };
  global.ChessAI = AI;

  /* ---- Modo Web Worker ---- */
  if (typeof importScripts === 'function' && typeof document === 'undefined') {
    importScripts('engine.js');
    self.onmessage = (e) => {
      const { fen, level, id } = e.data;
      if (e.data.coach) {
        const game = new self.Chess().load(e.data.fen);
        const r = searchPosition(game, e.data.time || 200, e.data.depth || 3);
        self.postMessage({ id, coach: true, best: r.move ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion || null, san: game._san(r.move), captured: r.move.captured || null } : null, score: r.score, terminal: r.terminal });
        return;
      }
      if (e.data.analyze) {
        const review = analyzeGame(e.data.moves, e.data.opts || {}, (done, total) => self.postMessage({ id, progress: done, total }));
        self.postMessage({ id, review });
        return;
      }
      const game = new self.Chess().load(fen);
      const r = chooseMove(game, level);
      self.postMessage({ id, move: r ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion || null } : null, nodes: r ? r.nodes : 0 });
    };
  }
})(typeof self !== 'undefined' ? self : this);
