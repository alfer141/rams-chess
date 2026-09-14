/* ============================================================
   api/tts.js — Voz del entrenador con Gemini TTS (función de Vercel)
   GET /api/tts?t=<texto>&v=<voz>   →   audio/wav (24 kHz, mono, 16 bit)

   La clave vive en la variable de entorno GEMINI_API_KEY (Vercel →
   Settings → Environment Variables). Sin clave responde 501 y el
   navegador usa su propia voz. Las respuestas se cachean en la CDN
   de Vercel por texto+voz, así cada comentario se genera una sola vez.
   ============================================================ */
const MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICES = new Set(['Kore', 'Puck', 'Charon', 'Aoede', 'Zephyr', 'Fenrir', 'Leda', 'Orus', 'Sulafat', 'Achird', 'Gacrux', 'Vindemiatrix', 'Sadaltager', 'Iapetus', 'Algieba', 'Schedar']);
const MAX_CHARS = 400;

/* Envuelve PCM (16 bit, mono) en un contenedor WAV */
function wav(pcm, rate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);        // tamaño del bloque fmt
  header.writeUInt16LE(1, 20);         // PCM
  header.writeUInt16LE(1, 22);         // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);  // bytes por segundo
  header.writeUInt16LE(2, 32);         // bytes por muestra
  header.writeUInt16LE(16, 34);        // bits por muestra
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function rateFrom(mime) {
  const m = /rate=(\d+)/.exec(mime || '');
  return m ? parseInt(m[1], 10) : 24000;
}

/* Modelos 2.5: generateContent con salida de audio */
async function viaGenerateContent(key, text, voice, style) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: `${style} ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  const r = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}`), { status: r.status, detail: await r.text() });
  const json = await r.json();
  const part = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  const audio = part.find((p) => p.inlineData && p.inlineData.data);
  if (!audio) throw Object.assign(new Error('Sin audio en la respuesta'), { status: 502 });
  return { pcm: Buffer.from(audio.inlineData.data, 'base64'), rate: rateFrom(audio.inlineData.mimeType) };
}

/* Modelos 3.x: API de interacciones */
async function viaInteractions(key, text, voice, style) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/interactions';
  const body = { model: MODEL, input: `${style} ${text}`, response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } };
  const r = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error(`Gemini ${r.status}`), { status: r.status, detail: await r.text() });
  const json = await r.json();
  const out = json.output_audio || (json.interaction && json.interaction.output_audio) || {};
  if (!out.data) throw Object.assign(new Error('Sin audio en la respuesta'), { status: 502 });
  return { pcm: Buffer.from(out.data, 'base64'), rate: rateFrom(out.mime_type || out.mimeType) };
}

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(501).json({ error: 'GEMINI_API_KEY no configurada' }); return; }
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const text = String((req.query && req.query.t) || '').trim().slice(0, MAX_CHARS);
  const voice = VOICES.has(req.query && req.query.v) ? req.query.v : 'Kore';
  const lang = (req.query && req.query.l) === 'en' ? 'en' : 'es';
  if (!text) { res.status(400).json({ error: 'Falta el texto (t)' }); return; }

  const style = lang === 'es'
    ? 'Habla en español, con voz tranquila y clara de profesor de ajedrez, ritmo pausado. Di solo esta frase:'
    : 'Speak in English, calm and clear like a chess coach, unhurried pace. Say only this sentence:';

  try {
    const gen = /gemini-3/.test(MODEL) ? viaInteractions : viaGenerateContent;
    const { pcm, rate } = await gen(key, text, voice, style);
    const out = wav(pcm, rate);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(out.length));
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=31536000, immutable');
    res.setHeader('X-TTS-Model', MODEL);
    res.status(200).send(out);
  } catch (err) {
    const status = err.status === 429 ? 429 : (err.status >= 400 && err.status < 600 ? err.status : 502);
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({ error: err.message, detail: (err.detail || '').slice(0, 300) });
  }
};
