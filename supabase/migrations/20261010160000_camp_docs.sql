-- Saved state for the camp pages that came over from claude.ai artifacts
-- (public/camp/fire = "Camp at the Fire", public/camp/scenes = "Underdark
-- Scenes"). In the artifact they kept a small document store; here the same
-- documents live in this table, reached through /api/camp/docs.
--
--   app         'fire' | 'scenes' - which page owns the document
--   collection  e.g. 'notes', 'tuning', 'layouts', 'found'
--   doc_id      the document's id inside its collection
--   data        the document itself
--
-- Anyone may read (the pages render for players and the DM alike). Writes go
-- through the server route with the service role, which decides who may write
-- what (see app/api/camp/docs/route.ts).

create table if not exists public.camp_docs (
  app text not null check (app in ('fire', 'scenes')),
  collection text not null check (collection ~ '^[a-z_]{1,40}$'),
  doc_id text not null check (char_length(doc_id) between 1 and 200),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app, collection, doc_id)
);

alter table public.camp_docs enable row level security;
create policy camp_docs_read on public.camp_docs for select using (true);
