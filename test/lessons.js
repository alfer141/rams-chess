// Comprueba que cada etapa de cada lección tiene solución.
global.window = global; global.self = global;
require('../js/engine.js'); require('../js/lessons.js');
const { Chess, ChessUtil: { fromAlg, toAlg } } = global;
const restoreTurn = (g, c) => { g.turn = c; g._legalCache = null; };
function solve(g, color, goal, depth) {           // DFS con rival estático
  if (goal(g)) return true;
  if (depth === 0) return false;
  for (const m of g.legalMoves()) {
    g._apply(m); restoreTurn(g, color);
    const ok = solve(g, color, goal, depth - 1);
    g._revert(); restoreTurn(g, color);
    if (ok) return true;
  }
  return false;
}
let fails = 0;
for (const les of LESSONS.lessons) les.stages.forEach((st, i) => {
  const g = new Chess().load(st.fen); const color = st.color || 'w';
  let ok = false, why = '';
  const moves = g.legalMoves();
  switch (st.type) {
    case 'stars': {
      const stars = new Set(st.stars.map(fromAlg));
      // meta: visitar todas las estrellas; seguimos las visitas por historial
      const visited = () => new Set(g.history.map((h) => h.move.to));
      ok = solve(g, color, (gg) => [...stars].every((s) => visited().has(s)), st.par);
      why = 'estrellas no alcanzables en ' + st.par; break;
    }
    case 'capture':
      ok = solve(g, color, (gg) => !gg.board.some((p) => p && p.color !== color), st.par); why = 'no se capturan todas en ' + st.par; break;
    case 'check': ok = moves.some((m) => { g._apply(m); const c = g.inCheck(); g._revert(); return c; }); why = 'sin jaque'; break;
    case 'mate': ok = moves.some((m) => { g._apply(m); const c = g.isCheckmate(); g._revert(); return c; }); why = 'sin mate'; break;
    case 'escape': ok = g.inCheck() && moves.length > 0; why = 'no está en jaque o no hay escape'; break;
    case 'castle': ok = moves.some((m) => m.castle); why = 'sin enroque'; break;
    case 'enpassant': ok = moves.some((m) => m.enPassant); why = 'sin al paso'; break;
    case 'promote': ok = moves.some((m) => m.promotion); why = 'sin coronación'; break;
    case 'safe': { const t = fromAlg(st.target); const opp = color === 'w' ? 'b' : 'w';
      ok = g.isAttacked(t, opp) && moves.some((m) => m.from === t && !(() => { g._apply(m); const a = g.isAttacked(m.to, opp); g._revert(); return a; })()); why = 'pieza no atacada o sin casilla segura'; break; }
    case 'value': ok = moves.some((m) => m.captured === st.target); why = 'no se puede capturar ' + st.target; break;
  }
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${les.id} etapa ${i + 1} (${st.type})${ok ? '' : ' — ' + why}`);
  if (!ok) fails++;
});
process.exit(fails ? 1 : 0);
