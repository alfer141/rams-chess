const { Chess } = require('../js/engine.js');
const AI = require('../js/ai.js').ChessAI;
function perft(g, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of g.legalMoves()) { g._apply(m); n += perft(g, d - 1); g._revert(); }
  return n;
}
const cases = [
  ['start', null, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
let ok = true;
for (const [name, fen, expected] of cases) {
  const g = new Chess(); if (fen) g.load(fen);
  expected.forEach((e, i) => {
    const t = Date.now(); const n = perft(g, i + 1);
    const pass = n === e; ok = ok && pass;
    console.log(`${pass ? 'OK ' : 'FAIL'} ${name} d${i + 1} = ${n} (esperado ${e}) ${Date.now() - t}ms`);
  });
}
// SAN + mate
const g = new Chess();
for (const s of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]) {
  const { fromAlg } = require('../js/engine.js').ChessUtil;
  const m = g.move({ from: fromAlg(s[0]), to: fromAlg(s[1]) }); process.stdout.write(m.san + ' ');
}
console.log('| status:', JSON.stringify(g.status()));
g.undo(); console.log('undo ->', g.status().over === false ? 'OK' : 'FAIL', g.fen());
// IA
const g2 = new Chess(); let t = Date.now();
for (const lvl of [2,3,4,5]) { const r = AI.chooseMove(g2, lvl); console.log(`nivel ${lvl}: nodos ${r.nodes} en ${Date.now()-t}ms`); t = Date.now(); }
// IA debe encontrar mate en 1
const g3 = new Chess().load('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
const r = AI.chooseMove(g3, 4); console.log('mate en 1:', r.move.from === 56 && r.move.to === 0 ? 'OK Ra8#' : 'FAIL ' + JSON.stringify(r.move));
process.exit(ok ? 0 : 1);
