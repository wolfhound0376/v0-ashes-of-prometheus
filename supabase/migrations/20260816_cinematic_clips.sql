-- Cinematic clips catalogue (PR-4). Applied to ppadxmvvvxmnnejeaoer on
-- 2026-08-16 via MCP; kept here as the schema record.
create table if not exists public.cinematic_clips (
  id uuid primary key default gen_random_uuid(),
  location text not null,
  state text,
  scope text not null default 'party' check (scope in ('solo','party')),
  kind text not null default 'environment' check (kind in ('environment','action','filler')),
  video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cinematic_clips_lookup on public.cinematic_clips (location, state, kind);
alter table public.cinematic_clips enable row level security;
create policy "cinematic_clips_public_read" on public.cinematic_clips
  for select to anon, authenticated using (true);
