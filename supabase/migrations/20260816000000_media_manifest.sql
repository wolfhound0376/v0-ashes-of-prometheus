-- media_manifest: single catalog of every runtime media asset.
--
-- Bytes live in Vercel Blob (private, served via /api/file, or public blob URLs).
-- This table is the canonical index the app reads from: which asset belongs to
-- which pool/slot, its public URL, and enough bookkeeping (pathname + checksum)
-- for the local upload script to be idempotent.
--
-- Per repo convention (see AGENTS.md §3) migrations here do NOT run on deploy;
-- paste this into the Supabase SQL Editor, or apply it via the Supabase MCP.

create extension if not exists "pgcrypto";

create table if not exists public.media_manifest (
  id           uuid primary key default gen_random_uuid(),

  -- 'music' | 'npc_face' | 'npc_idle' | 'npc_talking' | 'scene' | 'voice'
  -- | 'item_icon' | 'fog'  (extend as needed)
  kind         text not null,

  -- music: location pool label (e.g. 'underdark', 'village', 'combat_default')
  -- npc_*:  npc slug
  -- scene:  location slug
  pool         text,

  -- music: 'base' | 'tense' | 'combat'  (which mood slot inside the pool)
  slot         text,

  name         text not null,
  url          text not null,            -- public URL or /api/file?pathname=... proxy path
  pathname     text not null,            -- Blob pathname; idempotency key for re-uploads

  content_type text,
  size         bigint,
  checksum     text,                     -- sha256 of the bytes (re-upload dedupe)

  mood         text[] not null default '{}',
  metadata     jsonb  not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (pathname)
);

create index if not exists media_manifest_kind_pool_idx
  on public.media_manifest (kind, pool);

create index if not exists media_manifest_kind_pool_slot_idx
  on public.media_manifest (kind, pool, slot);

-- keep updated_at fresh
create or replace function public.media_manifest_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists media_manifest_set_updated_at on public.media_manifest;
create trigger media_manifest_set_updated_at
  before update on public.media_manifest
  for each row execute function public.media_manifest_touch_updated_at();

-- RLS: the manifest is a public read-only catalog (URLs only, no secrets).
-- Writes are service-role only (service role bypasses RLS; no anon write policy).
alter table public.media_manifest enable row level security;

drop policy if exists media_manifest_read on public.media_manifest;
create policy media_manifest_read
  on public.media_manifest for select
  using (true);
