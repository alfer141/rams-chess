/* ============================================================
   lessons.js — Lecciones interactivas (inspiradas en lichess.org/learn)
   Cada lección tiene etapas. En cada etapa el rival no mueve: el
   alumno resuelve un pequeño reto sobre el tablero.

   Tipos de etapa:
     stars      recoge todas las estrellas con tu pieza
     capture    captura todas las piezas negras
     check      da jaque en una jugada
     mate       da jaque mate en una jugada
     escape     sal del jaque
     castle     enroca
     enpassant  captura al paso
     promote    corona el peón
     safe       pon a salvo la pieza atacada (target = casilla de la pieza)
     value      captura la pieza más valiosa (target = tipo de pieza)
   ============================================================ */
(function (global) {
  'use strict';

  const L = (es, en) => ({ es, en });

  const GROUPS = [
    { id: 'pieces', title: L('Las piezas', 'The pieces') },
    { id: 'fundamentals', title: L('Fundamentos', 'Fundamentals') },
    { id: 'intermediate', title: L('Intermedio', 'Intermediate') },
    { id: 'openings', title: L('Aperturas', 'Openings') },
    { id: 'endings', title: L('Finales', 'Endgames') },
    { id: 'advanced', title: L('Avanzado', 'Advanced') },
  ];

  /* Tipos nuevos:
     line   sigue una línea de apertura: el alumno juega su color y el rival responde solo.
            line: [{ san, note }] alternando desde el color que mueve; note es opcional.
     play   juega contra el motor hasta cumplir el objetivo (goal: 'mate' | 'promote')
            en un máximo de jugadas propias (maxMoves). Ahogado o tablas = fallo. */

  const LESSONS = [
    /* ---------------- Las piezas ---------------- */
    {
      id: 'rook', group: 'pieces', piece: 'r',
      title: L('La torre', 'The rook'),
      intro: L('Se mueve en línea recta, horizontal o vertical, tantas casillas como quiera.', 'It moves in straight lines, horizontally or vertically, as far as it wants.'),
      stages: [
        { type: 'stars', fen: '8/8/8/8/8/8/8/R7 w - - 0 1', stars: ['e1', 'e8'], par: 2, text: L('Lleva la torre a las estrellas.', 'Take the rook to the stars.') },
        { type: 'stars', fen: '8/8/8/8/3R4/8/8/8 w - - 0 1', stars: ['d8', 'h8', 'h4'], par: 3, text: L('Recoge todas las estrellas con el menor número de jugadas.', 'Collect every star in as few moves as possible.') },
        { type: 'capture', fen: '8/8/8/3p3p/8/8/3p4/7R w - - 0 1', par: 3, text: L('Captura todos los peones.', 'Capture all the pawns.') },
      ],
    },
    {
      id: 'bishop', group: 'pieces', piece: 'b',
      title: L('El alfil', 'The bishop'),
      intro: L('Se mueve en diagonal. Cada alfil vive siempre en casillas del mismo color.', 'It moves diagonally. Each bishop always stays on squares of one colour.'),
      stages: [
        { type: 'stars', fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', stars: ['f4', 'h6'], par: 2, text: L('Lleva el alfil a las estrellas.', 'Take the bishop to the stars.') },
        { type: 'stars', fen: '8/8/8/8/4B3/8/8/8 w - - 0 1', stars: ['a8', 'h1'], par: 2, text: L('Cruza el tablero de esquina a esquina.', 'Cross the board from corner to corner.') },
        { type: 'capture', fen: '8/6p1/8/8/3p4/8/8/B7 w - - 0 1', par: 2, text: L('Captura los dos peones.', 'Capture both pawns.') },
      ],
    },
    {
      id: 'queen', group: 'pieces', piece: 'q',
      title: L('La dama', 'The queen'),
      intro: L('Torre y alfil a la vez: se mueve en cualquier dirección. Es la pieza más poderosa.', 'Rook and bishop combined: it moves in any direction. The most powerful piece.'),
      stages: [
        { type: 'stars', fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', stars: ['d7', 'h7', 'h1'], par: 3, text: L('Recoge las estrellas con la dama.', 'Collect the stars with the queen.') },
        { type: 'capture', fen: '8/1p2p3/8/8/4Q2p/8/8/8 w - - 0 1', par: 3, text: L('Captura los tres peones en tres jugadas.', 'Capture the three pawns in three moves.') },
      ],
    },
    {
      id: 'king', group: 'pieces', piece: 'k',
      title: L('El rey', 'The king'),
      intro: L('Se mueve una sola casilla en cualquier dirección. Es la pieza más importante: si lo pierdes, pierdes.', 'It moves one square in any direction. The most important piece: lose it and you lose.'),
      stages: [
        { type: 'stars', fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', stars: ['e2', 'f3'], par: 2, text: L('Lleva al rey a las estrellas, paso a paso.', 'Walk the king to the stars, one step at a time.') },
        { type: 'capture', fen: '8/8/8/3p4/3K4/2p5/8/8 w - - 0 1', par: 3, text: L('Captura los peones. Ojo: el rey nunca puede pisar una casilla atacada.', 'Capture the pawns. Careful: the king can never step onto an attacked square.') },
      ],
    },
    {
      id: 'knight', group: 'pieces', piece: 'n',
      title: L('El caballo', 'The knight'),
      intro: L('Se mueve en "L": dos casillas en una dirección y una en perpendicular. Es la única pieza que salta.', 'It moves in an "L": two squares one way and one square sideways. The only piece that jumps.'),
      stages: [
        { type: 'stars', fen: '8/8/8/8/8/8/8/1N6 w - - 0 1', stars: ['c3', 'd5'], par: 2, text: L('Salta hasta las estrellas.', 'Jump to the stars.') },
        { type: 'stars', fen: '8/8/8/8/4N3/8/8/8 w - - 0 1', stars: ['f6', 'g8'], par: 2, text: L('Dos saltos en "L".', 'Two "L" jumps.') },
        { type: 'capture', fen: '8/3p4/8/4p3/8/5p2/8/6N1 w - - 0 1', par: 3, text: L('Captura los peones uno tras otro.', 'Capture the pawns one after another.') },
      ],
    },
    {
      id: 'pawn', group: 'pieces', piece: 'p',
      title: L('El peón', 'The pawn'),
      intro: L('Avanza una casilla (dos desde su posición inicial), pero captura en diagonal. Nunca retrocede.', 'It moves one square forward (two from its start) but captures diagonally. It never goes back.'),
      stages: [
        { type: 'stars', fen: '8/8/8/8/8/8/4P3/8 w - - 0 1', stars: ['e4', 'e5'], par: 2, text: L('Avanza hasta las estrellas. Desde la casilla inicial puede saltar dos.', 'Advance to the stars. From its starting square it may move two.') },
        { type: 'capture', fen: '8/8/8/8/5p2/4p3/3P4/8 w - - 0 1', par: 2, text: L('Los peones capturan en diagonal.', 'Pawns capture diagonally.') },
        { type: 'promote', fen: '8/4P3/8/8/8/8/8/8 w - - 0 1', par: 1, text: L('Si un peón llega a la última fila, se convierte en otra pieza. ¡Corona!', 'A pawn reaching the last rank becomes another piece. Promote!') },
      ],
    },

    /* ---------------- Fundamentos ---------------- */
    {
      id: 'capture', group: 'fundamentals', piece: 'q',
      title: L('Capturar', 'Capture'),
      intro: L('Toma las piezas del rival moviendo la tuya a su casilla.', 'Take enemy pieces by moving your piece onto their square.'),
      stages: [
        { type: 'capture', fen: '8/8/3r4/8/8/8/7p/3Q4 w - - 0 1', par: 2, text: L('Captura la torre y el peón.', 'Capture the rook and the pawn.') },
        { type: 'capture', fen: 'R7/8/8/8/8/8/n6b/8 w - - 0 1', par: 2, text: L('Captura el caballo y el alfil.', 'Capture the knight and the bishop.') },
        { type: 'capture', fen: '8/8/5p2/8/4p3/2p5/8/1N6 w - - 0 1', par: 3, text: L('Con el caballo: planifica la ruta.', 'With the knight: plan your route.') },
      ],
    },
    {
      id: 'protect', group: 'fundamentals', piece: 'n',
      title: L('Poner a salvo', 'Get to safety'),
      intro: L('Tu pieza está atacada. Muévela a una casilla que el rival no controle.', 'Your piece is attacked. Move it to a square the enemy does not control.'),
      stages: [
        { type: 'safe', fen: '6b1/8/8/4p3/3N4/8/8/1r6 w - - 0 1', target: 'd4', par: 1, text: L('El peón ataca a tu caballo. Llévalo a una casilla segura.', 'The pawn attacks your knight. Take it to a safe square.') },
        { type: 'safe', fen: '8/8/8/8/8/2n5/8/3R2b1 w - - 0 1', target: 'd1', par: 1, text: L('El caballo ataca a tu torre. ¿A dónde puede ir sin peligro?', 'The knight attacks your rook. Where can it go safely?') },
      ],
    },
    {
      id: 'check1', group: 'fundamentals', piece: 'r',
      title: L('Jaque en uno', 'Check in one'),
      intro: L('Dar jaque es atacar al rey rival. El rival estará obligado a responder.', 'Giving check means attacking the enemy king. The opponent must respond.'),
      stages: [
        { type: 'check', fen: '4k3/8/8/8/8/8/8/R7 w - - 0 1', par: 1, text: L('Da jaque con la torre.', 'Give check with the rook.') },
        { type: 'check', fen: '8/8/3k4/8/8/8/8/2B5 w - - 0 1', par: 1, text: L('Da jaque con el alfil.', 'Give check with the bishop.') },
        { type: 'check', fen: '8/8/8/8/8/8/8/N3k3 w - - 0 1', par: 1, text: L('Da jaque con el caballo.', 'Give check with the knight.') },
      ],
    },
    {
      id: 'escape', group: 'fundamentals', piece: 'k',
      title: L('Salir del jaque', 'Out of check'),
      intro: L('Si tu rey está en jaque debes resolverlo: moverlo, bloquear o capturar la pieza que ataca.', 'If your king is in check you must fix it: move it, block, or capture the attacker.'),
      stages: [
        { type: 'escape', fen: '4r3/8/8/8/8/8/8/4K3 w - - 0 1', par: 1, text: L('La torre da jaque. Mueve el rey a una casilla segura.', 'The rook gives check. Move the king to a safe square.') },
        { type: 'escape', fen: '8/8/8/8/b7/8/8/3K3R w - - 0 1', par: 1, text: L('El alfil da jaque. Escapa.', 'The bishop gives check. Escape.') },
        { type: 'escape', fen: '3r4/8/8/8/8/8/R7/3K4 w - - 0 1', par: 1, text: L('También puedes capturar la pieza que da jaque o interponer otra.', 'You can also capture the checking piece or block it.') },
      ],
    },
    {
      id: 'mate1', group: 'fundamentals', piece: 'q',
      title: L('Mate en uno', 'Mate in one'),
      intro: L('Jaque mate: el rey está en jaque y no tiene escapatoria. Fin de la partida.', 'Checkmate: the king is in check and has no escape. Game over.'),
      stages: [
        { type: 'mate', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', par: 1, text: L('Mate del pasillo: el rey está encerrado por sus propios peones.', 'Back-rank mate: the king is trapped by its own pawns.') },
        { type: 'mate', fen: '3k4/8/3K4/8/8/8/8/7Q w - - 0 1', par: 1, text: L('Con la dama y la ayuda del rey.', 'With the queen and the king\'s help.') },
        { type: 'mate', fen: '7k/1R6/8/8/8/8/8/R6K w - - 0 1', par: 1, text: L('Dos torres: una corta la fila, la otra remata.', 'Two rooks: one cuts off a rank, the other finishes.') },
      ],
    },

    /* ---------------- Intermedio ---------------- */
    {
      id: 'castle', group: 'intermediate', piece: 'k',
      title: L('El enroque', 'Castling'),
      intro: L('El rey se mueve dos casillas hacia la torre y la torre salta al otro lado. Solo si ninguno se ha movido, no hay piezas en medio y el rey no pasa por jaque.', 'The king moves two squares toward the rook and the rook jumps over. Only if neither has moved, nothing is in between and the king does not pass through check.'),
      stages: [
        { type: 'castle', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', par: 1, text: L('Enroca: mueve el rey dos casillas hacia una torre.', 'Castle: move the king two squares toward a rook.') },
        { type: 'castle', fen: 'r3k2r/8/8/8/8/8/8/R3K1NR w KQkq - 0 1', par: 1, text: L('El caballo estorba en un lado. Enroca por el otro.', 'The knight is in the way on one side. Castle on the other.') },
      ],
    },
    {
      id: 'enpassant', group: 'intermediate', piece: 'p',
      title: L('Captura al paso', 'En passant'),
      intro: L('Si un peón rival avanza dos casillas y queda junto al tuyo, puedes capturarlo como si solo hubiera avanzado una. Solo en la jugada inmediata.', 'If an enemy pawn advances two squares and lands beside yours, you may capture it as if it had moved one. Only on the very next move.'),
      stages: [
        { type: 'enpassant', fen: 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', par: 1, text: L('El peón negro acaba de avanzar dos casillas. Captúralo al paso.', 'The black pawn just advanced two squares. Capture it en passant.') },
        { type: 'enpassant', fen: 'rnbqkbnr/pp1ppppp/8/8/2pP4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 3', par: 1, text: L('Ahora con negras: tu peón de c4 puede capturar al paso.', 'Now as Black: your c4 pawn can capture en passant.'), color: 'b' },
      ],
    },
    {
      id: 'stalemate', group: 'intermediate', piece: 'q',
      title: L('Evitar el ahogado', 'Avoid stalemate'),
      intro: L('Ahogado: el rival no está en jaque pero no tiene jugadas legales. Son tablas. Cuando vas ganando, ¡evítalo!', 'Stalemate: the opponent is not in check but has no legal moves. It is a draw. When you are winning, avoid it!'),
      stages: [
        { type: 'mate', fen: '7k/8/6K1/8/8/8/8/5Q2 w - - 0 1', par: 1, text: L('Da mate en una. Cuidado: hay una jugada de dama que ahoga al rey en vez de rematar.', 'Mate in one. Careful: one queen move stalemates the king instead of finishing.') },
        { type: 'mate', fen: 'k7/8/1K6/8/8/8/8/3R4 w - - 0 1', par: 1, text: L('Rey y torre contra rey: remata sin ahogar.', 'King and rook versus king: finish without stalemating.') },
      ],
    },

    /* ---------------- Aperturas ---------------- */
    {
      id: 'op_principles', group: 'openings', piece: 'p',
      title: L('Principios de apertura', 'Opening principles'),
      intro: L('Tres ideas para las primeras jugadas: ocupa el centro, saca caballos y alfiles, y enroca. No muevas la misma pieza dos veces sin motivo.', 'Three ideas for the first moves: take the centre, bring out knights and bishops, and castle. Do not move the same piece twice without reason.'),
      stages: [
        { type: 'line', fen: 'start', color: 'w', par: 4, text: L('Juega una apertura sana: peón al centro, caballo, alfil y enroque.', 'Play a healthy opening: centre pawn, knight, bishop and castle.'),
          line: [
            { san: 'e4', note: L('El peón de rey ocupa el centro y abre paso al alfil y a la dama.', 'The king pawn takes the centre and frees the bishop and queen.') },
            { san: 'e5' },
            { san: 'Nf3', note: L('El caballo se desarrolla atacando el peón de e5.', 'The knight develops and attacks the e5 pawn.') },
            { san: 'Nc6' },
            { san: 'Bc4', note: L('El alfil apunta a f7, la casilla más débil de las negras.', 'The bishop aims at f7, the weakest black square.') },
            { san: 'Bc5' },
            { san: 'O-O', note: L('Enroque: el rey a salvo y la torre lista para actuar.', 'Castling: the king is safe and the rook is ready.') },
          ] },
      ],
    },
    {
      id: 'op_italian', group: 'openings', piece: 'b',
      title: L('Apertura Italiana', 'Italian Game'),
      intro: L('1.e4 e5 2.Cf3 Cc6 3.Ac4. Desarrollo rápido y presión sobre f7. Una de las aperturas más antiguas y más claras para aprender.', '1.e4 e5 2.Nf3 Nc6 3.Bc4. Quick development and pressure on f7. One of the oldest and clearest openings to learn.'),
      stages: [
        { type: 'line', fen: 'start', color: 'w', par: 3, text: L('Juega la Italiana con blancas.', 'Play the Italian as White.'),
          line: [
            { san: 'e4', note: L('Centro y diagonales abiertas.', 'Centre and open diagonals.') },
            { san: 'e5' },
            { san: 'Nf3', note: L('Ataca e5 y prepara el enroque corto.', 'Attacks e5 and prepares castling.') },
            { san: 'Nc6' },
            { san: 'Bc4', note: L('La Italiana: el alfil mira a f7 y controla d5.', 'The Italian: the bishop eyes f7 and controls d5.') },
            { san: 'Bc5' },
            { san: 'c3', note: L('Prepara d4 para ganar el centro y molestar al alfil de c5.', 'Prepares d4 to take the centre and harass the c5 bishop.') },
          ] },
      ],
    },
    {
      id: 'op_spanish', group: 'openings', piece: 'b',
      title: L('Apertura Española', 'Ruy López'),
      intro: L('1.e4 e5 2.Cf3 Cc6 3.Ab5. El alfil presiona al caballo que defiende e5. La apertura favorita de los campeones desde hace siglos.', '1.e4 e5 2.Nf3 Nc6 3.Bb5. The bishop pressures the knight that defends e5. A favourite of champions for centuries.'),
      stages: [
        { type: 'line', fen: 'start', color: 'w', par: 4, text: L('Juega la Española con blancas.', 'Play the Ruy López as White.'),
          line: [
            { san: 'e4' }, { san: 'e5' },
            { san: 'Nf3', note: L('Desarrollo con amenaza sobre e5.', 'Development with a threat on e5.') },
            { san: 'Nc6' },
            { san: 'Bb5', note: L('La Española: presiona al defensor de e5.', 'The Ruy López: pressure on the defender of e5.') },
            { san: 'a6' },
            { san: 'Ba4', note: L('El alfil se retira sin perder la presión.', 'The bishop retreats without losing the pressure.') },
            { san: 'Nf6' },
            { san: 'O-O', note: L('Rey a salvo; e4 queda defendido tácticamente.', 'King safe; e4 is tactically defended.') },
          ] },
      ],
    },
    {
      id: 'op_queens_gambit', group: 'openings', piece: 'q',
      title: L('Gambito de Dama', 'Queen Gambit'),
      intro: L('1.d4 d5 2.c4. Ofreces un peón para desviar el de d5 y dominar el centro. Si lo toman, casi siempre lo recuperas.', '1.d4 d5 2.c4. You offer a pawn to deflect d5 and dominate the centre. If they take it, you almost always win it back.'),
      stages: [
        { type: 'line', fen: 'start', color: 'w', par: 4, text: L('Juega el Gambito de Dama.', 'Play the Queen Gambit.'),
          line: [
            { san: 'd4', note: L('El peón de dama: centro sólido, protegido por la dama.', 'The queen pawn: solid centre, protected by the queen.') },
            { san: 'd5' },
            { san: 'c4', note: L('El gambito: desafía el centro negro.', 'The gambit: challenges the black centre.') },
            { san: 'e6' },
            { san: 'Nc3', note: L('Más presión sobre d5.', 'More pressure on d5.') },
            { san: 'Nf6' },
            { san: 'Bg5', note: L('Clava el caballo de f6, defensor de d5.', 'Pins the f6 knight, defender of d5.') },
          ] },
      ],
    },
    {
      id: 'op_sicilian', group: 'openings', piece: 'p',
      title: L('Defensa Siciliana', 'Sicilian Defence'),
      intro: L('Con negras: 1.e4 c5. Luchas por el centro desde el flanco y evitas la simetría. La respuesta más combativa contra 1.e4.', 'As Black: 1.e4 c5. You fight for the centre from the flank and avoid symmetry. The most combative reply to 1.e4.'),
      stages: [
        { type: 'line', fen: 'start', color: 'b', par: 4, text: L('Juega la Siciliana con negras.', 'Play the Sicilian as Black.'),
          line: [
            { san: 'e4' },
            { san: 'c5', note: L('La Siciliana: controla d4 sin ocupar e5.', 'The Sicilian: controls d4 without occupying e5.') },
            { san: 'Nf3' },
            { san: 'd6', note: L('Protege e5 y abre el alfil de c8.', 'Protects e5 and opens the c8 bishop.') },
            { san: 'd4' },
            { san: 'cxd4', note: L('Cambias el peón de flanco por el central: buena transacción.', 'You trade a flank pawn for a centre pawn: a good deal.') },
            { san: 'Nxd4' },
            { san: 'Nf6', note: L('Desarrollo atacando e4.', 'Development attacking e4.') },
          ] },
      ],
    },
    {
      id: 'op_french', group: 'openings', piece: 'p',
      title: L('Defensa Francesa', 'French Defence'),
      intro: L('Con negras: 1.e4 e6 2.d4 d5. Una cadena de peones sólida; a cambio, el alfil de c8 queda encerrado un tiempo.', 'As Black: 1.e4 e6 2.d4 d5. A solid pawn chain; in return, the c8 bishop is shut in for a while.'),
      stages: [
        { type: 'line', fen: 'start', color: 'b', par: 3, text: L('Juega la Francesa con negras.', 'Play the French as Black.'),
          line: [
            { san: 'e4' },
            { san: 'e6', note: L('Prepara d5 con apoyo.', 'Prepares d5 with support.') },
            { san: 'd4' },
            { san: 'd5', note: L('Desafía el centro: e4 debe decidir.', 'Challenges the centre: e4 must decide.') },
            { san: 'Nc3' },
            { san: 'Nf6', note: L('Presión sobre e4 con desarrollo.', 'Pressure on e4 with development.') },
          ] },
      ],
    },

    /* ---------------- Finales ---------------- */
    {
      id: 'end_queen', group: 'endings', piece: 'q',
      title: L('Mate con dama', 'Queen mate'),
      intro: L('Rey y dama contra rey. La dama encierra al rey en un borde como si fuera una caja cada vez más pequeña; el rey ayuda a rematar. Cuidado con el ahogado.', 'King and queen versus king. The queen boxes the king in against an edge with an ever-smaller box; your king helps finish. Beware stalemate.'),
      stages: [
        { type: 'play', fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1', goal: 'mate', maxMoves: 20, par: 12, text: L('Da mate en menos de 20 jugadas. El motor defiende.', 'Mate in under 20 moves. The engine defends.') },
      ],
    },
    {
      id: 'end_rook', group: 'endings', piece: 'r',
      title: L('Mate con torre', 'Rook mate'),
      intro: L('Rey y torre contra rey. La torre corta filas y el rey empuja de frente hasta el borde. Usa la oposición y remata en la última fila.', 'King and rook versus king. The rook cuts off ranks and your king pushes head-on to the edge. Use the opposition and mate on the last rank.'),
      stages: [
        { type: 'play', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', goal: 'mate', maxMoves: 30, par: 18, text: L('Da mate en menos de 30 jugadas.', 'Mate in under 30 moves.') },
      ],
    },
    {
      id: 'end_two_rooks', group: 'endings', piece: 'r',
      title: L('La escalera', 'The ladder mate'),
      intro: L('Dos torres contra rey: una corta una fila, la otra da jaque en la siguiente, y así suben como una escalera hasta el borde.', 'Two rooks versus king: one cuts off a rank, the other checks on the next, and they climb like a ladder to the edge.'),
      stages: [
        { type: 'play', fen: '8/8/8/4k3/8/8/8/R2K3R w - - 0 1', goal: 'mate', maxMoves: 12, par: 7, text: L('Mate en escalera en menos de 12 jugadas.', 'Ladder mate in under 12 moves.') },
      ],
    },
    {
      id: 'end_pawn', group: 'endings', piece: 'p',
      title: L('Rey y peón: la oposición', 'King and pawn: the opposition'),
      intro: L('Con el rey delante del peón se gana si consigues la oposición: los reyes enfrentados y el rival obligado a ceder paso. Corona el peón.', 'With your king in front of the pawn you win if you get the opposition: kings facing and the opponent forced to give way. Promote the pawn.'),
      stages: [
        { type: 'play', fen: '8/8/4k3/8/4K3/8/4P3/8 w - - 0 1', goal: 'promote', maxMoves: 25, par: 14, text: L('Corona el peón. El motor intenta bloquearlo.', 'Promote the pawn. The engine tries to block it.') },
      ],
    },

    /* ---------------- Avanzado ---------------- */
    {
      id: 'value', group: 'advanced', piece: 'q',
      title: L('Valor de las piezas', 'Piece value'),
      intro: L('Peón 1, caballo 3, alfil 3, torre 5, dama 9. Cuando puedas elegir, captura lo más valioso.', 'Pawn 1, knight 3, bishop 3, rook 5, queen 9. When you can choose, capture the most valuable piece.'),
      stages: [
        { type: 'value', fen: '8/8/8/7r/p2n4/8/8/3Q4 w - - 0 1', target: 'r', par: 1, text: L('¿Peón, caballo o torre? Captura la pieza más valiosa.', 'Pawn, knight or rook? Capture the most valuable piece.') },
        { type: 'value', fen: '8/8/7q/8/8/r7/8/2B5 w - - 0 1', target: 'q', par: 1, text: L('Torre o dama: elige bien.', 'Rook or queen: choose well.') },
        { type: 'value', fen: '8/2n5/8/8/8/2b5/8/2R5 w - - 0 1', target: 'b', par: 1, text: L('Caballo y alfil valen lo mismo, pero solo uno está a tu alcance en una jugada.', 'Knight and bishop are worth the same, but only one is reachable in one move.') },
      ],
    },
    {
      id: 'mate_in_two', group: 'advanced', piece: 'q',
      title: L('Mate en dos', 'Mate in two'),
      intro: L('Primera jugada tuya, mejor defensa del rival, y remate. Piensa en jaques que obligan y en piezas que desvían al defensor.', 'Your first move, the best defence, then the finish. Think about forcing checks and pieces that deflect the defender.'),
      stages: [
        { type: 'play', fen: '6k1/5ppp/8/8/8/8/2q2PPP/R5K1 w - - 0 1', goal: 'mate', maxMoves: 2, par: 2, text: L('Mate en dos: jaque en la última fila; la dama solo puede interponerse.', 'Mate in two: back-rank check; the queen can only interpose.') },
        { type: 'play', fen: 'r6k/6pp/8/4N3/8/1B6/8/6QK w - - 0 1', goal: 'mate', maxMoves: 2, par: 2, text: L('Mate en dos: sacrificio de dama y mate de la coz.', 'Mate in two: queen sacrifice and smothered mate.') },
        { type: 'play', fen: '6k1/3q1ppp/8/8/8/8/5PPP/1R4K1 w - - 0 1', goal: 'mate', maxMoves: 2, par: 2, text: L('Mate en dos: obliga a la dama a bloquear y captúrala con mate.', 'Mate in two: force the queen to block, then capture it with mate.') },
      ],
    },
    {
      id: 'mate2', group: 'advanced', piece: 'r',
      title: L('Mates típicos', 'Typical mates'),
      intro: L('Patrones que se repiten en muchas partidas. Reconócelos y los verás llegar.', 'Patterns that repeat in countless games. Recognise them and you will see them coming.'),
      stages: [
        { type: 'mate', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4', par: 1, text: L('Mate del pastor: la dama y el alfil apuntan a f7.', 'Scholar\'s mate: queen and bishop aim at f7.') },
        { type: 'mate', fen: '6rk/6pp/8/4N3/8/8/8/6K1 w - - 0 1', par: 1, text: L('Mate de la coz: el rey está ahogado por sus propias piezas y el caballo remata.', 'Smothered mate: the king is boxed in by its own pieces and the knight finishes.') },
        { type: 'mate', fen: '6k1/5ppp/8/8/8/8/1B4Q1/6K1 w - - 0 1', par: 1, text: L('Batería de dama y alfil en la gran diagonal.', 'Queen and bishop battery on the long diagonal.') },
      ],
    },
  ];

  global.LESSONS = { groups: GROUPS, lessons: LESSONS };
})(window);
