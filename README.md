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
| **Navegación global** | Barra superior con dos secciones, *Jugar* y *Aprender*, y un botón de ajustes (ayudas, tema, sonido, color de acento, idioma, borrar progreso). |
| **Color de acento** | Cinco pastillas al estilo Braun: amarillo, naranja, rojo, oliva y azul. Cambia botones, interruptores, estrellas y marcas. |
| **Aprender** | 15 lecciones interactivas inspiradas en lichess.org/learn: las piezas, fundamentos (capturar, poner a salvo, jaque, salir del jaque, mate en uno), intermedio (enroque, al paso, evitar el ahogado) y avanzado (valor de las piezas, mates típicos). El progreso se guarda. |
| **Partidas** | Historial con reproducción jugada a jugada (Inicio / Anterior / Siguiente). Se guarda en el navegador y, con cuenta, en la nube. |
| **Entrenador (revisión de partida)** | Como el *Game Review* de chess.com pero con el motor local: clasifica cada jugada (mejor, excelente, buena, imprecisión, error, error grave), calcula la precisión por bando y comenta qué era mejor. Sin API ni coste. |
| **Voz del entrenador** | Voz neuronal de Gemini TTS (gratuita en el nivel gratuito de Google AI Studio) a través de `api/tts.js`, con caché en la CDN y en el navegador. Sin clave o sin cuota, cae automáticamente a la voz del navegador (Web Speech API). Timbre elegible en Ajustes. |
| **Cuenta sin contraseña** | Correo + código de seis dígitos (Supabase Auth). Sincroniza avance, experiencia e historial entre dispositivos. Opcional: sin configurar, todo se guarda en local. |
| **Experiencia** | Cada etapa superada por primera vez da 10 XP (+5 si se resuelve en el mínimo de jugadas). Los XP suben de rango: Peón, Caballo, Alfil, Torre, Dama y Rey. |
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
js/app.js       Interfaz: vistas Jugar/Aprender/Partidas, relojes, arrastrar y soltar, diálogos, cuenta
js/auth.js      Cuenta sin contraseña y sincronización (Supabase)
api/tts.js      Función de Vercel: texto → audio WAV con Gemini TTS (clave en GEMINI_API_KEY)
js/config.js    URL y clave pública (anon) del proyecto Supabase — vacías por defecto
supabase/       schema.sql: tablas, índices y políticas RLS
audio/          Sonido de interacción de la interfaz (Mixkit, licencia libre)
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

## Cuenta en la nube (Supabase)

El juego funciona sin cuenta. Para activar el inicio de sesión sin contraseña y guardar el avance y el historial:

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com) y ejecuta `supabase/schema.sql` en **SQL Editor**.
2. En **Authentication → Providers → Email** deja activado el proveedor de correo.
3. En **Authentication → Email Templates → Magic Link** añade el código a la plantilla, por ejemplo
   `<p>Tu código: <b>{{ .Token }}</b></p>` (el enlace `{{ .ConfirmationURL }}` también sirve).
4. En **Authentication → URL Configuration** pon la URL pública del juego como *Site URL*.
5. Opcional pero recomendado: **Project Settings → Auth → SMTP Settings** con tu proveedor de correo
   (por ejemplo Resend: host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = tu API key,
   remitente en un dominio verificado). Sin SMTP propio, Supabase limita a unos pocos correos por hora.
6. Copia la **Project URL** y la clave **anon public** (*Project Settings → API*) en `js/config.js`.

La clave *anon* es pública por diseño; las políticas RLS del esquema garantizan que cada persona solo lee y escribe sus filas.

## Voz del entrenador con Gemini (opcional)

1. Crea una clave en [Google AI Studio](https://aistudio.google.com/apikey) (no hace falta tarjeta; el modelo `gemini-2.5-flash-preview-tts` está en el nivel gratuito).
2. En Vercel → Project → Settings → Environment Variables añade `GEMINI_API_KEY` con esa clave (todos los entornos) y vuelve a desplegar.
3. Opcional: `GEMINI_TTS_MODEL` para cambiar de modelo (por ejemplo `gemini-3.1-flash-tts-preview`).

Cada frase se genera una sola vez: la respuesta se cachea por texto y timbre en la CDN de Vercel y en el navegador. Si la cuota gratuita se agota, el juego sigue hablando con la voz del navegador.

En local, `vercel dev --listen 8766` sirve la función; con `python3 -m http.server` solo se usa la voz del navegador.

## Desplegar en Vercel

El proyecto es 100 % estático y ya está conectado a Vercel: cada `git push` a `main` publica una nueva versión
en https://rams-chess.vercel.app. Para desplegar tu propia copia, importa el repositorio en [Vercel](https://vercel.com/new)
sin comando de *build*, o usa la CLI:

```bash
npx vercel
```

## Créditos

Diseño original de Alex Fernández, inspirado en los principios de Dieter Rams. Código bajo licencia MIT.
Sonido de interfaz: "Modern technology select" de [Mixkit](https://mixkit.co/free-sound-effects/) (licencia Mixkit).
