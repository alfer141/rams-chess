/* ============================================================
   auth.js — Cuenta sin contraseña (Supabase: código por correo)
   y sincronización de progreso e historial de partidas.
   Se carga supabase-js desde CDN solo si hay configuración.
   ============================================================ */
(function (global) {
  'use strict';

  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  let client = null;
  let user = null;
  let onChange = () => {};
  let saveTimer = null;

  const cfg = () => global.RAMS_CONFIG || {};
  const configured = () => !!(cfg().supabaseUrl && cfg().supabaseAnonKey);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function init(handler) {
    onChange = handler || onChange;
    if (!configured()) return false;
    await loadScript(CDN);
    client = global.supabase.createClient(cfg().supabaseUrl, cfg().supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data } = await client.auth.getSession();
    user = data.session ? data.session.user : null;
    client.auth.onAuthStateChange((_event, session) => {
      const next = session ? session.user : null;
      const changed = (next && next.id) !== (user && user.id);
      user = next;
      if (changed) onChange(user);
    });
    onChange(user);
    return true;
  }

  /* ---- Autenticación ---- */
  async function sendCode(email) {
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }
  async function verify(email, token) {
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  }
  async function signOut() {
    if (client) await client.auth.signOut();
  }

  /* ---- Progreso (una fila por usuario) ---- */
  async function getProfile() {
    const { data, error } = await client.from('profiles').select('progress, xp, updated_at').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function saveProgress(progress) {
    if (!user) return;
    const row = { id: user.id, progress, xp: progress._xp || 0, updated_at: new Date().toISOString() };
    const { error } = await client.from('profiles').upsert(row);
    if (error) throw error;
  }
  function saveProgressDebounced(progress) {
    if (!user) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProgress(progress).catch(() => { /* reintenta en el siguiente cambio */ }), 1500);
  }

  /* ---- Historial de partidas ---- */
  async function addGame(g) {
    if (!user) return null;
    const row = {
      user_id: user.id, client_id: g.id, played_at: g.date, mode: g.mode, level: g.level || null,
      color: g.color || null, result: g.result, reason: g.reason, plies: g.moves.length, moves: g.moves,
    };
    const { error } = await client.from('games').upsert(row, { onConflict: 'user_id,client_id' });
    if (error) throw error;
    return true;
  }
  async function listGames(limit = 100) {
    const { data, error } = await client.from('games')
      .select('client_id, played_at, mode, level, color, result, reason, plies, moves')
      .eq('user_id', user.id).order('played_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.client_id, date: r.played_at, mode: r.mode, level: r.level, color: r.color,
      result: r.result, reason: r.reason, moves: r.moves || [],
    }));
  }

  global.Account = {
    init, configured, sendCode, verify, signOut,
    getProfile, saveProgress, saveProgressDebounced, addGame, listGames,
    get user() { return user; },
  };
})(window);
