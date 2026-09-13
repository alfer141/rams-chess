-- ============================================================
-- Rams Chess — esquema para Supabase
-- Ejecuta este archivo en: Supabase → SQL Editor → New query
-- ============================================================

-- Progreso y experiencia (una fila por usuario)
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  progress    jsonb        not null default '{}'::jsonb,
  xp          integer      not null default 0,
  updated_at  timestamptz  not null default now()
);

-- Historial de partidas
create table if not exists public.games (
  id          bigint generated always as identity primary key,
  user_id     uuid         not null references auth.users (id) on delete cascade,
  client_id   text         not null,               -- id generado en el navegador (evita duplicados)
  played_at   timestamptz  not null default now(),
  mode        text,                                 -- 'ai' | 'pvp'
  level       integer,                              -- nivel de la máquina (1-5)
  color       text,                                 -- color del jugador humano en modo máquina
  result      text,                                 -- '1-0' | '0-1' | '1/2-1/2'
  reason      text,                                 -- checkmate, stalemate, resign, time…
  plies       integer      not null default 0,
  moves       jsonb        not null default '[]'::jsonb,
  unique (user_id, client_id)
);
create index if not exists games_user_played_idx on public.games (user_id, played_at desc);

-- Seguridad: cada usuario solo ve y escribe sus propias filas
alter table public.profiles enable row level security;
alter table public.games    enable row level security;

drop policy if exists "profiles: own rows" on public.profiles;
create policy "profiles: own rows" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "games: own rows" on public.games;
create policy "games: own rows" on public.games
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Autenticación sin contraseña (código de 6 dígitos por correo)
-- 1. Authentication → Providers → Email: activado. "Confirm email" puede quedar activado.
-- 2. Authentication → Email Templates → "Magic Link": añade el código a la plantilla,
--    por ejemplo:  <p>Tu código: <b>{{ .Token }}</b></p>
--    (el enlace {{ .ConfirmationURL }} también funciona si el usuario prefiere hacer clic).
-- 3. Authentication → URL Configuration → Site URL: https://rams-chess.vercel.app
-- ============================================================
