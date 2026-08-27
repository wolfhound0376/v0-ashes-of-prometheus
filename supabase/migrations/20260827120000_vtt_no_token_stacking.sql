-- Two tokens must never share a square.
--
-- Kenta ended up invisible, buried inside Prince Derendil's cell, because
-- nothing stopped a second miniature landing on an occupied square. The board
-- guards the DM's own click-to-move, but NPCs are moved by the AI and a square
-- can be written by any hand — so the invariant belongs at the database, where
-- it holds for every writer at once.
--
-- On a colliding write we RELOCATE rather than reject: the move still happens,
-- just to the nearest free square, so an AI move never errors and never stacks.

create or replace function public.vtt_prevent_token_stack()
returns trigger
language plpgsql
as $$
declare
  gw int;
  gh int;
  ring int;
  dx int;
  dy int;
  cx int;
  cy int;
  is_taken boolean;
begin
  -- Only guard a visible token that actually holds a square.
  if NEW.is_visible is not true or NEW.grid_x is null or NEW.grid_y is null then
    return NEW;
  end if;

  -- If no OTHER visible token holds the target square, nothing to do.
  if not exists (
    select 1 from public.vtt_tokens t
    where t.map_id = NEW.map_id
      and t.id <> NEW.id
      and t.is_visible is true
      and t.grid_x = NEW.grid_x
      and t.grid_y = NEW.grid_y
  ) then
    return NEW;
  end if;

  -- Occupied. Relocate to the nearest free square, searching outward ring by ring.
  select grid_width, grid_height into gw, gh
  from public.vtt_maps where id = NEW.map_id;
  if gw is null or gh is null then
    return NEW; -- bounds unknown: let the write through rather than block it
  end if;

  ring := 1;
  while ring < gw + gh loop
    dx := -ring;
    while dx <= ring loop
      dy := -ring;
      while dy <= ring loop
        if abs(dx) = ring or abs(dy) = ring then  -- perimeter of this ring only
          cx := NEW.grid_x + dx;
          cy := NEW.grid_y + dy;
          if cx >= 0 and cy >= 0 and cx < gw and cy < gh then
            select exists (
              select 1 from public.vtt_tokens t
              where t.map_id = NEW.map_id
                and t.id <> NEW.id
                and t.is_visible is true
                and t.grid_x = cx
                and t.grid_y = cy
            ) into is_taken;
            if not is_taken then
              NEW.grid_x := cx;
              NEW.grid_y := cy;
              return NEW;
            end if;
          end if;
        end if;
        dy := dy + 1;
      end loop;
      dx := dx + 1;
    end loop;
    ring := ring + 1;
  end loop;

  return NEW;  -- board somehow full: keep the write rather than lose it
end;
$$;

drop trigger if exists vtt_tokens_no_stack on public.vtt_tokens;
create trigger vtt_tokens_no_stack
  before insert or update of grid_x, grid_y, is_visible on public.vtt_tokens
  for each row execute function public.vtt_prevent_token_stack();
