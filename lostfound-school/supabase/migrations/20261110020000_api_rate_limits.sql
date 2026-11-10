-- Apply after 20261110010000_staging_hardening.sql. No hosted changes are automatic.
begin;
create table private.api_rate_limits (
 user_id uuid not null references auth.users(id) on delete cascade,
 scope text not null check (scope in ('read','write')),
 window_start timestamptz not null,
 hits integer not null check (hits between 1 and 120),
 primary key(user_id,scope)
);
alter table private.api_rate_limits enable row level security;
revoke all on private.api_rate_limits from public,anon,authenticated;

-- Definer access is narrowly necessary to update private counters. No caller
-- can supply a user id, time, or quota. Only consume their own fixed budget.
create function private.consume_api_rate_limit(p_scope text) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid := auth.uid();
 v_window timestamptz := date_trunc('minute',statement_timestamp());
 v_limit integer;
 v_hits integer;
begin
 if v_user is null or not private.is_member() then
  raise exception 'school membership required' using errcode='42501';
 end if;
 if p_scope is null or p_scope not in ('read','write') then
  raise exception 'invalid rate limit scope' using errcode='22023';
 end if;
 v_limit := case when p_scope='write' then 20 else 120 end;
 insert into private.api_rate_limits as counters(user_id,scope,window_start,hits)
 values(v_user,p_scope,v_window,1)
 on conflict(user_id,scope) do update
 set window_start=v_window,
     hits=case when counters.window_start=v_window then counters.hits+1 else 1 end
 where counters.window_start<>v_window or counters.hits<v_limit
 returning hits into v_hits;
 return v_hits is not null;
end;
$$;
create function public.consume_api_rate_limit(p_scope text) returns boolean
language sql security invoker set search_path='' as $$
 select private.consume_api_rate_limit(p_scope)
$$;
revoke all on function private.consume_api_rate_limit(text),public.consume_api_rate_limit(text) from public,anon;
grant execute on function private.consume_api_rate_limit(text),public.consume_api_rate_limit(text) to authenticated;
notify pgrst, 'reload schema';
commit;
