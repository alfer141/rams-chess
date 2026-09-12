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

  const AI = { chooseMove, evaluate, LEVELS };
  global.ChessAI = AI;

  /* ---- Modo Web Worker ---- */
  if (typeof importScripts === 'function' && typeof document === 'undefined') {
    importScripts('engine.js');
    self.onmessage = (e) => {
      const { fen, level, id } = e.data;
      const game = new self.Chess().load(fen);
      const r = chooseMove(game, level);
      self.postMessage({ id, move: r ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion || null } : null, nodes: r ? r.nodes : 0 });
    };
  }
})(typeof self !== 'undefined' ? self : this);
