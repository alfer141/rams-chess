# Rams Chess

Ajedrez para **aprender a jugar**, con un diseño inspirado en Dieter Rams: pocos colores, formas claras y un solo acento.
No usa frameworks ni dependencias: HTML, CSS y JavaScript puros. Funciona en cualquier navegador moderno.

## Jugar

- **En línea:** **https://rams-chess.vercel.app**
- **En tu ordenador:** clona el repositorio y abre `index.html`, o sirve la carpeta con cualquier servidor estático:

```bash
git clone https://github.com/alfer141/rams-chess.git
cd rams-chess
python3 -m http.server 8765
# abre http://localhost:8765
```

> Con un servidor local la máquina piensa en un *Web Worker* y la interfaz nunca se bloquea.
> Si abres `index.html` directamente (`file://`) el juego también funciona: la máquina calcula en el hilo principal.

## Funciones

| Función | Detalle |
| --- | --- |
| **Navegación global** | Barra superior con dos secciones, *Jugar* y *Aprender*, y un botón de ajustes (ayudas, tema, sonido, idioma, borrar progreso). |
| **Aprender** | 15 lecciones interactivas inspiradas en lichess.org/learn: las piezas, fundamentos (capturar, poner a salvo, jaque, salir del jaque, mate en uno), intermedio (enroque, al paso, evitar el ahogado) y avanzado (valor de las piezas, mates típicos). El progreso se guarda. |
| **Máquina vs Usuario** | Cinco niveles: Principiante, Fácil, Medio, Difícil y Experto. Puedes elegir blancas, negras o al azar. |
| **Usuario vs Usuario** | Dos personas en el mismo dispositivo. |
| **Mostrar movimientos posibles** | Interruptor que marca las casillas a las que puede ir la pieza seleccionada y explica cómo se mueve. |
| **Deshacer** | Revierte la última jugada (en modo máquina revierte también la respuesta de la máquina). También con `Ctrl/Cmd + Z`. |
| **Reloj** | Sin reloj, 5, 10 o 15 minutos por jugador. |
| **Pausa y rendirse** | Botones circulares como en el diseño original. |
| **Temas** | Crema (claro) y grafito (oscuro), los dos diseños de referencia. |
| **Idiomas** | Español e inglés. |
| **Reglas completas** | Enroque, captura al paso, coronación, jaque mate, ahogado, triple repetición, regla de 50 movimientos y material insuficiente. |

Todo se guarda en `localStorage` (tema, idioma, ayudas, nivel), así que la próxima visita empieza con tus ajustes.

## Estructura

```
index.html      Marcado y símbolos SVG de las piezas
css/style.css   Estilo: temas, tablero, panel, botones, diálogos
js/engine.js    Reglas del ajedrez (generación de movimientos legales, SAN, FEN, fin de partida)
js/ai.js        Motor de la máquina (negamax + alfa-beta + tablas de posición + quiescence)
js/i18n.js      Textos en español e inglés
js/lessons.js   Lecciones de la sección Aprender (posiciones FEN, tipo de reto, textos)
js/app.js       Interfaz: vistas Jugar/Aprender, relojes, arrastrar y soltar, diálogos
test/perft.js   Pruebas del motor (perft contra posiciones estándar)
test/lessons.js Comprueba que todas las etapas de las lecciones tienen solución
```

## Pruebas

```bash
node test/perft.js && node test/lessons.js
```

La primera compara el número de nodos generados con los valores conocidos de posiciones de referencia
(posición inicial, *Kiwipete*, etc.) y comprueba que la máquina encuentra un mate en uno.
La segunda resuelve cada etapa de cada lección para asegurar que el reto es alcanzable.

## Desplegar en Vercel

El proyecto es 100 % estático y ya está conectado a Vercel: cada `git push` a `main` publica una nueva versión
en https://rams-chess.vercel.app. Para desplegar tu propia copia, importa el repositorio en [Vercel](https://vercel.com/new)
sin comando de *build*, o usa la CLI:

```bash
npx vercel
```

## Créditos

Diseño original de Alex Fernández, inspirado en los principios de Dieter Rams. Código bajo licencia MIT.
