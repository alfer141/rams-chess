/* ============================================================
   engine.js — Reglas del ajedrez (sin dependencias)
   Tablero: array de 64 casillas. Índice 0 = a8 … 63 = h1.
   Pieza: { color: 'w'|'b', type: 'p'|'n'|'b'|'r'|'q'|'k' } o null.
   ============================================================ */
(function (global) {
  'use strict';

  const FILES = 'abcdefgh';
  const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  const idx = (file, rank) => (7 - rank) * 8 + file;       // file 0-7, rank 0-7 (rank 0 = fila 1)
  const fileOf = (i) => i % 8;
  const rankOf = (i) => 7 - Math.floor(i / 8);
  const toAlg = (i) => FILES[fileOf(i)] + (rankOf(i) + 1);
  const fromAlg = (s) => idx(FILES.indexOf(s[0]), parseInt(s[1], 10) - 1);
  const inBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

  const KNIGHT_D = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KING_D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const BISHOP_D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ROOK_D = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  class Chess {
    constructor() { this.reset(); }

    reset() {
      this.board = new Array(64).fill(null);
      const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
      for (let f = 0; f < 8; f++) {
        this.board[idx(f, 7)] = { color: 'b', type: back[f] };
        this.board[idx(f, 6)] = { color: 'b', type: 'p' };
        this.board[idx(f, 1)] = { color: 'w', type: 'p' };
        this.board[idx(f, 0)] = { color: 'w', type: back[f] };
      }
      this.turn = 'w';
      this.castling = { wK: true, wQ: true, bK: true, bQ: true };
      this.ep = -1;            // casilla de captura al paso, -1 si no hay
      this.halfmove = 0;
      this.fullmove = 1;
      this.history = [];       // pila para deshacer
      this.positions = {};     // repetición de posiciones
      this._legalCache = null;
      this._countPosition();
    }

    /* ---------- utilidades ---------- */
    get(i) { return this.board[i]; }
    opponent(c) { return c === 'w' ? 'b' : 'w'; }

    kingSquare(color) {
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (p && p.type === 'k' && p.color === color) return i;
      }
      return -1;
    }

    /* ¿La casilla i está atacada por el color `by`? */
    isAttacked(i, by) {
      const f = fileOf(i), r = rankOf(i);
      // peones
      const pr = by === 'w' ? r - 1 : r + 1;
      for (const df of [-1, 1]) {
        if (inBoard(f + df, pr)) {
          const p = this.board[idx(f + df, pr)];
          if (p && p.color === by && p.type === 'p') return true;
        }
      }
      // caballos
      for (const [df, dr] of KNIGHT_D) {
        if (inBoard(f + df, r + dr)) {
          const p = this.board[idx(f + df, r + dr)];
          if (p && p.color === by && p.type === 'n') return true;
        }
      }
      // rey
      for (const [df, dr] of KING_D) {
        if (inBoard(f + df, r + dr)) {
          const p = this.board[idx(f + df, r + dr)];
          if (p && p.color === by && p.type === 'k') return true;
        }
      }
      // deslizantes
      for (const [df, dr] of BISHOP_D) {
        let nf = f + df, nr = r + dr;
        while (inBoard(nf, nr)) {
          const p = this.board[idx(nf, nr)];
          if (p) { if (p.color === by && (p.type === 'b' || p.type === 'q')) return true; break; }
          nf += df; nr += dr;
        }
      }
      for (const [df, dr] of ROOK_D) {
        let nf = f + df, nr = r + dr;
        while (inBoard(nf, nr)) {
          const p = this.board[idx(nf, nr)];
          if (p) { if (p.color === by && (p.type === 'r' || p.type === 'q')) return true; break; }
          nf += df; nr += dr;
        }
      }
      return false;
    }

    inCheck(color = this.turn) {
      const k = this.kingSquare(color);
      return k >= 0 && this.isAttacked(k, this.opponent(color));
    }

    /* ---------- generación de movimientos ---------- */
    pseudoMoves(color = this.turn) {
      const moves = [];
      const add = (from, to, extra = {}) => moves.push(Object.assign({ from, to, piece: this.board[from].type, captured: this.board[to] ? this.board[to].type : null }, extra));

      for (let from = 0; from < 64; from++) {
        const p = this.board[from];
        if (!p || p.color !== color) continue;
        const f = fileOf(from), r = rankOf(from);

        if (p.type === 'p') {
          const dir = color === 'w' ? 1 : -1;
          const startRank = color === 'w' ? 1 : 6;
          const promoRank = color === 'w' ? 7 : 0;
          const pushPawn = (to, cap) => {
            if (rankOf(to) === promoRank) {
              for (const promotion of ['q', 'r', 'b', 'n']) add(from, to, { promotion, captured: cap });
            } else add(from, to, { captured: cap });
          };
          if (inBoard(f, r + dir) && !this.board[idx(f, r + dir)]) {
            pushPawn(idx(f, r + dir), null);
            if (r === startRank && !this.board[idx(f, r + 2 * dir)]) add(from, idx(f, r + 2 * dir), { double: true });
          }
          for (const df of [-1, 1]) {
            if (!inBoard(f + df, r + dir)) continue;
            const to = idx(f + df, r + dir);
            const t = this.board[to];
            if (t && t.color !== color) pushPawn(to, t.type);
            else if (to === this.ep) add(from, to, { enPassant: true, captured: 'p' });
          }
        } else if (p.type === 'n' || p.type === 'k') {
          const D = p.type === 'n' ? KNIGHT_D : KING_D;
          for (const [df, dr] of D) {
            if (!inBoard(f + df, r + dr)) continue;
            const to = idx(f + df, r + dr);
            const t = this.board[to];
            if (!t || t.color !== color) add(from, to);
          }
          if (p.type === 'k') this._castleMoves(color, from, moves);
        } else {
          const D = p.type === 'b' ? BISHOP_D : p.type === 'r' ? ROOK_D : KING_D;
          for (const [df, dr] of D) {
            let nf = f + df, nr = r + dr;
            while (inBoard(nf, nr)) {
              const to = idx(nf, nr);
              const t = this.board[to];
              if (!t) add(from, to);
              else { if (t.color !== color) add(from, to); break; }
              nf += df; nr += dr;
            }
          }
        }
      }
      return moves;
    }

    _castleMoves(color, from, moves) {
      const rank = color === 'w' ? 0 : 7;
      if (from !== idx(4, rank)) return;
      const opp = this.opponent(color);
      if (this.isAttacked(from, opp)) return;
      const empty = (...fs) => fs.every((f) => !this.board[idx(f, rank)]);
      const safe = (...fs) => fs.every((f) => !this.isAttacked(idx(f, rank), opp));
      const rookAt = (f) => { const p = this.board[idx(f, rank)]; return p && p.type === 'r' && p.color === color; };
      if (this.castling[color + 'K'] && rookAt(7) && empty(5, 6) && safe(5, 6))
        moves.push({ from, to: idx(6, rank), piece: 'k', captured: null, castle: 'K' });
      if (this.castling[color + 'Q'] && rookAt(0) && empty(1, 2, 3) && safe(2, 3))
        moves.push({ from, to: idx(2, rank), piece: 'k', captured: null, castle: 'Q' });
    }

    legalMoves() {
      if (this._legalCache) return this._legalCache;
      const color = this.turn;
      const out = [];
      for (const m of this.pseudoMoves(color)) {
        this._apply(m);
        if (!this.inCheck(color)) out.push(m);
        this._revert();
      }
      this._legalCache = out;
      return out;
    }

    movesFrom(square) { return this.legalMoves().filter((m) => m.from === square); }

    /* ---------- aplicar / revertir ---------- */
    _apply(m) {
      const color = this.turn;
      const snapshot = {
        move: m,
        captured: this.board[m.to],
        castling: Object.assign({}, this.castling),
        ep: this.ep,
        halfmove: this.halfmove,
        fullmove: this.fullmove,
        epCaptured: null,
      };
      const piece = this.board[m.from];
      this.board[m.to] = m.promotion ? { color, type: m.promotion } : piece;
      this.board[m.from] = null;

      if (m.enPassant) {
        const capSq = idx(fileOf(m.to), rankOf(m.from));
        snapshot.epCaptured = this.board[capSq];
        this.board[capSq] = null;
      }
      if (m.castle) {
        const rank = rankOf(m.from);
        const rf = m.castle === 'K' ? 7 : 0, rt = m.castle === 'K' ? 5 : 3;
        this.board[idx(rt, rank)] = this.board[idx(rf, rank)];
        this.board[idx(rf, rank)] = null;
      }
      // derechos de enroque
      if (piece.type === 'k') { this.castling[color + 'K'] = false; this.castling[color + 'Q'] = false; }
      const rookLoss = (sq) => {
        if (sq === idx(0, 0)) this.castling.wQ = false;
        if (sq === idx(7, 0)) this.castling.wK = false;
        if (sq === idx(0, 7)) this.castling.bQ = false;
        if (sq === idx(7, 7)) this.castling.bK = false;
      };
      rookLoss(m.from); rookLoss(m.to);

      this.ep = m.double ? idx(fileOf(m.from), (rankOf(m.from) + rankOf(m.to)) / 2) : -1;
      this.halfmove = (piece.type === 'p' || m.captured) ? 0 : this.halfmove + 1;
      if (color === 'b') this.fullmove++;
      this.turn = this.opponent(color);
      this.history.push(snapshot);
      this._legalCache = null;
    }

    _revert() {
      const s = this.history.pop();
      if (!s) return null;
      const m = s.move;
      this.turn = this.opponent(this.turn);
      const color = this.turn;
      this.board[m.from] = m.promotion ? { color, type: 'p' } : this.board[m.to];
      this.board[m.to] = s.captured;
      if (m.enPassant) this.board[idx(fileOf(m.to), rankOf(m.from))] = s.epCaptured;
      if (m.castle) {
        const rank = rankOf(m.from);
        const rf = m.castle === 'K' ? 7 : 0, rt = m.castle === 'K' ? 5 : 3;
        this.board[idx(rf, rank)] = this.board[idx(rt, rank)];
        this.board[idx(rt, rank)] = null;
      }
      this.castling = s.castling;
      this.ep = s.ep;
      this.halfmove = s.halfmove;
      this.fullmove = s.fullmove;
      this._legalCache = null;
      return m;
    }

    /* Movimiento "oficial" (con SAN y registro de repetición) */
    move(m) {
      const legal = this.legalMoves().find((l) => l.from === m.from && l.to === m.to && (l.promotion || null) === (m.promotion || null));
      if (!legal) return null;
      const san = this._san(legal);
      const color = this.turn;
      this._apply(legal);
      legal.san = san + (this.isCheckmate() ? '#' : this.inCheck() ? '+' : '');
      legal.color = color;
      this._countPosition(1);
      return legal;
    }

    undo() {
      if (!this.history.length) return null;
      this._countPosition(-1);
      return this._revert();
    }

    _san(m) {
      if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
      const P = m.piece.toUpperCase();
      let s = '';
      if (m.piece === 'p') {
        if (m.captured) s += FILES[fileOf(m.from)] + 'x';
      } else {
        s += P;
        // desambiguación
        const others = this.legalMoves().filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
        if (others.length) {
          const sameFile = others.some((o) => fileOf(o.from) === fileOf(m.from));
          const sameRank = others.some((o) => rankOf(o.from) === rankOf(m.from));
          if (!sameFile) s += FILES[fileOf(m.from)];
          else if (!sameRank) s += (rankOf(m.from) + 1);
          else s += toAlg(m.from);
        }
        if (m.captured) s += 'x';
      }
      s += toAlg(m.to);
      if (m.promotion) s += '=' + m.promotion.toUpperCase();
      return s;
    }

    /* ---------- estado de la partida ---------- */
    _key() {
      let k = '';
      for (let i = 0; i < 64; i++) { const p = this.board[i]; k += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.'; }
      return k + this.turn + (this.castling.wK ? 'K' : '') + (this.castling.wQ ? 'Q' : '') + (this.castling.bK ? 'k' : '') + (this.castling.bQ ? 'q' : '') + this.ep;
    }
    _countPosition(delta = 1) {
      const k = this._key();
      this.positions[k] = (this.positions[k] || 0) + delta;
    }

    isCheckmate() { return this.inCheck() && this.legalMoves().length === 0; }
    isStalemate() { return !this.inCheck() && this.legalMoves().length === 0; }
    isThreefold() { return (this.positions[this._key()] || 0) >= 3; }
    isFiftyMoves() { return this.halfmove >= 100; }
    isInsufficientMaterial() {
      const pieces = this.board.filter(Boolean).filter((p) => p.type !== 'k');
      if (pieces.length === 0) return true;
      if (pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b')) return true;
      if (pieces.length === 2 && pieces.every((p) => p.type === 'b') && pieces[0].color !== pieces[1].color) {
        // dos alfiles de distinto color sobre casillas del mismo color
        const sqColor = (i) => (fileOf(i) + rankOf(i)) % 2;
        const bs = []; for (let i = 0; i < 64; i++) if (this.board[i] && this.board[i].type === 'b') bs.push(sqColor(i));
        return bs[0] === bs[1];
      }
      return false;
    }

    /* { over: bool, result: '1-0'|'0-1'|'1/2-1/2'|null, reason: string|null } */
    status() {
      if (this.isCheckmate()) return { over: true, result: this.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
      if (this.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' };
      if (this.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'material' };
      if (this.isThreefold()) return { over: true, result: '1/2-1/2', reason: 'repetition' };
      if (this.isFiftyMoves()) return { over: true, result: '1/2-1/2', reason: 'fifty' };
      return { over: false, result: null, reason: null };
    }

    /* Piezas capturadas por cada color, ordenadas por valor */
    captured() {
      const out = { w: [], b: [] }; // out.w = piezas negras que capturó el blanco
      for (const s of this.history) {
        const m = s.move;
        if (m.captured) {
          const victim = s.captured || s.epCaptured;
          if (victim) out[victim.color === 'w' ? 'b' : 'w'].push(victim.type);
        }
      }
      const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
      out.w.sort((a, b) => order[a] - order[b]);
      out.b.sort((a, b) => order[a] - order[b]);
      return out;
    }

    materialBalance() {
      let s = 0;
      for (const p of this.board) if (p) s += (p.color === 'w' ? 1 : -1) * PIECE_VALUE[p.type];
      return s;
    }

    load(fen) {
      const [rows, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
      this.board = new Array(64).fill(null);
      rows.split('/').forEach((row, ri) => {
        let f = 0;
        for (const ch of row) {
          if (/\d/.test(ch)) { f += parseInt(ch, 10); continue; }
          this.board[idx(f, 7 - ri)] = { color: ch === ch.toUpperCase() ? 'w' : 'b', type: ch.toLowerCase() };
          f++;
        }
      });
      this.turn = turn || 'w';
      const c = castling || '-';
      this.castling = { wK: c.includes('K'), wQ: c.includes('Q'), bK: c.includes('k'), bQ: c.includes('q') };
      this.ep = ep && ep !== '-' ? fromAlg(ep) : -1;
      this.halfmove = parseInt(half || '0', 10);
      this.fullmove = parseInt(full || '1', 10);
      this.history = [];
      this.positions = {};
      this._legalCache = null;
      this._countPosition();
      return this;
    }

    fen() {
      let rows = [];
      for (let r = 7; r >= 0; r--) {
        let row = '', empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.board[idx(f, r)];
          if (!p) { empty++; continue; }
          if (empty) { row += empty; empty = 0; }
          row += p.color === 'w' ? p.type.toUpperCase() : p.type;
        }
        if (empty) row += empty;
        rows.push(row);
      }
      const c = (this.castling.wK ? 'K' : '') + (this.castling.wQ ? 'Q' : '') + (this.castling.bK ? 'k' : '') + (this.castling.bQ ? 'q' : '');
      return `${rows.join('/')} ${this.turn} ${c || '-'} ${this.ep >= 0 ? toAlg(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
    }
  }

  global.Chess = Chess;
  global.ChessUtil = { idx, fileOf, rankOf, toAlg, fromAlg, FILES, PIECE_VALUE };
})(typeof self !== "undefined" ? self : this);
