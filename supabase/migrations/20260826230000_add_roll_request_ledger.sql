-- A roll request is an authoritative, character-bound handoff between a DM
-- turn and the shared dice engine. Public clients cannot read or mutate this
-- ledger; server routes use the service role and expose only the active request.

create table if not exists public.roll_requests (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null default gen_random_uuid() unique,
  session_id uuid references public.sessions(id) on delete set null,
  character_id uuid not null references public.characters(id) on delete cascade,
  requested_expression text not null,
  die_sides integer not null check (die_sides between 2 and 100),
  dice_count integer not null check (dice_count between 1 and 20),
  modifier integer not null default 0 check (modifier between -100 and 100),
  purpose text,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'consumed', 'rejected')),
  result jsonb,
  resolved_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists roll_requests_one_pending_per_character
  on public.roll_requests(character_id) where status = 'pending';
create index if not exists roll_requests_session_created_idx
  on public.roll_requests(session_id, created_at desc);

create table if not exists public.roll_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.roll_requests(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  outcome text not null check (outcome in ('accepted', 'rejected', 'duplicate', 'conflict')),
  submitted_result jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists roll_attempts_request_created_idx
  on public.roll_attempts(request_id, created_at);

alter table public.roll_requests enable row level security;
alter table public.roll_attempts enable row level security;

comment on table public.roll_requests is
  'Server-only ledger binding a Malachar roll request to one character and one accepted result.';
comment on table public.roll_attempts is
  'Immutable audit trail for accepted, rejected, duplicate, and conflicting roll submissions.';

-- Validate and commit under a row lock so two browser retries can never both
-- become the authoritative result. This function is callable by service_role
-- only; character claim verification remains the API route's responsibility.
create or replace function public.resolve_roll_request(
  p_request_id uuid,
  p_character_id uuid,
  p_die text,
  p_rolls integer[],
  p_modifier integer,
  p_total integer,
  p_label text default null,
  p_roll_mode text default 'normal'
)
returns table(outcome text, correlation_id uuid, status text, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_request public.roll_requests%rowtype;
  v_result jsonb;
  v_reason text;
  v_sum integer;
begin
  select * into v_request from public.roll_requests
  where id = p_request_id and character_id = p_character_id
  for update;

  if not found then
    return query select 'rejected'::text, null::uuid, 'rejected'::text, 'request_not_found'::text;
    return;
  end if;

  v_result := jsonb_build_object(
    'die', lower(p_die), 'rolls', to_jsonb(p_rolls), 'modifier', p_modifier,
    'total', p_total, 'label', p_label, 'rollMode', coalesce(p_roll_mode, 'normal')
  );

  if v_request.status in ('resolved', 'consumed') then
    if v_request.result = v_result then
      insert into public.roll_attempts(request_id, character_id, outcome, submitted_result, reason)
      values (v_request.id, p_character_id, 'duplicate', v_result, 'same_result_replayed');
      return query select 'duplicate'::text, v_request.correlation_id, v_request.status, null::text;
    else
      insert into public.roll_attempts(request_id, character_id, outcome, submitted_result, reason)
      values (v_request.id, p_character_id, 'conflict', v_result, 'different_result_after_commit');
      return query select 'conflict'::text, v_request.correlation_id, v_request.status, 'result_already_committed'::text;
    end if;
    return;
  end if;

  if v_request.status <> 'pending' then v_reason := 'request_not_pending';
  elsif lower(p_die) <> ('d' || v_request.die_sides::text) then v_reason := 'wrong_die';
  elsif coalesce(p_roll_mode, 'normal') <> 'normal' then v_reason := 'wrong_roll_mode';
  elsif coalesce(array_length(p_rolls, 1), 0) <> v_request.dice_count then v_reason := 'wrong_dice_count';
  elsif p_modifier <> v_request.modifier then v_reason := 'wrong_modifier';
  elsif exists (select 1 from unnest(p_rolls) roll where roll < 1 or roll > v_request.die_sides) then v_reason := 'roll_out_of_range';
  else
    select coalesce(sum(roll), 0) into v_sum from unnest(p_rolls) roll;
    if p_total <> v_sum + p_modifier then v_reason := 'wrong_total'; end if;
  end if;

  if v_reason is not null then
    insert into public.roll_attempts(request_id, character_id, outcome, submitted_result, reason)
    values (v_request.id, p_character_id, 'rejected', v_result, v_reason);
    return query select 'rejected'::text, v_request.correlation_id, v_request.status, v_reason;
    return;
  end if;

  update public.roll_requests set
    status = 'resolved', result = v_result, resolved_at = now(), updated_at = now()
  where id = v_request.id;
  insert into public.roll_attempts(request_id, character_id, outcome, submitted_result)
  values (v_request.id, p_character_id, 'accepted', v_result);
  return query select 'accepted'::text, v_request.correlation_id, 'resolved'::text, null::text;
end;
$function$;

revoke all on function public.resolve_roll_request(uuid, uuid, text, integer[], integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.resolve_roll_request(uuid, uuid, text, integer[], integer, integer, text, text) to service_role;
