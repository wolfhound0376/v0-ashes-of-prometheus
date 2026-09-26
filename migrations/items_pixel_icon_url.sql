-- Pixel-art icon for an item, drawn on the battle board (ground items).
-- The painted icon_url stays the inventory's picture; this is the board's.
-- Applied 2026-09-26 through the Supabase MCP; kept here for the record.
alter table public.items add column if not exists pixel_icon_url text;
