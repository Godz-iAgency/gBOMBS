-- Apply before deploying ai-generate or publishing the new frontend.
-- No chat text, prompts, replies, tokens or credentials are stored here.
begin;

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('coach', 'generation', 'validation')),
  state text not null default 'pending' check (state in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  usage_day date not null default ((now() at time zone 'UTC')::date),
  expires_at timestamptz not null default (now() + interval '180 seconds')
);
create index ai_requests_user_time_idx on public.ai_requests (user_id, created_at);
create index ai_requests_user_day_idx on public.ai_requests (user_id, usage_day, bucket);
alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from public, anon, authenticated;
grant all on public.ai_requests to service_role;

create function public.get_ai_usage(p_user_id uuid, p_bucket text, p_limit integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used', count(*), 'limit', p_limit,
    'remaining', greatest(0, p_limit - count(*)),
    'resetsAt', (((now() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC')
  )
  from public.ai_requests
  where user_id = p_user_id and bucket = p_bucket
    and usage_day = (now() at time zone 'UTC')::date
    and (state = 'succeeded' or (state = 'pending' and expires_at > now()));
$$;

create function public.reserve_ai_request(p_user_id uuid, p_bucket text, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_usage jsonb;
  v_id uuid;
  v_code text;
begin
  if p_user_id is null or p_bucket is null or p_limit is null
    or not ((p_bucket = 'coach' and p_limit in (20,50))
      or (p_bucket = 'generation' and p_limit in (100,200))
      or (p_bucket = 'validation' and p_limit = 20)) then
    raise exception 'Invalid AI allowance';
  end if;
  -- Serializes reservations across tabs/devices and Edge Function workers.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  delete from public.ai_requests where user_id = p_user_id and created_at < now() - interval '30 days';
  v_usage := public.get_ai_usage(p_user_id, p_bucket, p_limit);
  if (v_usage->>'remaining')::integer <= 0 then
    v_code := 'daily_limit';
  elsif (select count(*) from public.ai_requests where user_id = p_user_id
      and created_at > now() - interval '1 minute') >= 10 then
    -- Includes failed attempts; retries inside one reservation do not recount.
    v_code := 'rate_limit';
  elsif (select count(*) from public.ai_requests where user_id = p_user_id
      and state = 'pending' and expires_at > now()) >= 3 then
    v_code := 'busy';
  end if;
  if v_code is not null then
    return jsonb_build_object('allowed', false, 'code', v_code, 'usage', v_usage);
  end if;
  insert into public.ai_requests (user_id, bucket) values (p_user_id, p_bucket) returning id into v_id;
  return jsonb_build_object('allowed', true, 'requestId', v_id,
    'usage', public.get_ai_usage(p_user_id, p_bucket, p_limit));
end;
$$;

create function public.finish_ai_request(p_request_id uuid, p_success boolean)
returns void language sql security definer set search_path = '' as $$
  update public.ai_requests set state = case when p_success then 'succeeded' else 'failed' end
  where id = p_request_id and state = 'pending';
$$;

-- Functions are inaccessible even to logged-in clients. Only ai-generate's
-- private service-role client can reserve, finalize or read these counters.
revoke all on function public.get_ai_usage(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.reserve_ai_request(uuid,text,integer) from public, anon, authenticated;
revoke all on function public.finish_ai_request(uuid,boolean) from public, anon, authenticated;
grant execute on function public.get_ai_usage(uuid,text,integer) to service_role;
grant execute on function public.reserve_ai_request(uuid,text,integer) to service_role;
grant execute on function public.finish_ai_request(uuid,boolean) to service_role;
commit;
