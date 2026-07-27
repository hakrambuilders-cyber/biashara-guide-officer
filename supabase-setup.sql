-- Biashara Guide — anonymized guidance events
-- Run this once in the Supabase SQL Editor after creating the project.
--
-- Design: citizens can INSERT an anonymized event (no name, no NIDA, no
-- phone, no free text) but can never SELECT — the raw table is not
-- readable by anyone from the client. The officer console reads only
-- through get_guidance_overview() / get_guidance_breakdowns(), which
-- return counts and percentages, never a row. This mirrors
-- docs/FUNCTIONAL_SPEC.md's "aggregate access by default" rule as an
-- actual database constraint, not just a UI convention.

create table if not exists public.guidance_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sector text,
  stage text,
  sales_bucket text,
  has_tin boolean not null default false,
  has_business_registration boolean not null default false,
  has_licence boolean not null default false,
  keeps_records boolean not null default false,
  filed_return boolean not null default false,
  compliance_score int,
  risk_level text,
  next_action_key text,
  language text,
  channel text not null default 'web'
);

alter table public.guidance_events enable row level security;

-- Anonymous clients (the citizen app) may insert, never select.
drop policy if exists "anon can insert guidance events" on public.guidance_events;
create policy "anon can insert guidance events"
  on public.guidance_events
  for insert
  to anon
  with check (true);

-- Aggregate-only read surface for the officer console. SECURITY DEFINER
-- means it runs with the table owner's privileges, so it can read the raw
-- rows internally even though anon has no SELECT grant on the table itself
-- — the function is the only door, and it only ever returns aggregates.
create or replace function public.get_guidance_overview()
returns table (
  total bigint,
  avg_compliance_score numeric,
  high_risk_share numeric
)
language sql
security definer
set search_path = public
as $$
  select
    count(*) as total,
    round(avg(compliance_score), 0) as avg_compliance_score,
    round(100.0 * count(*) filter (where risk_level = 'high') / greatest(count(*), 1), 0) as high_risk_share
  from public.guidance_events;
$$;

create or replace function public.get_guidance_breakdowns()
returns table (
  dimension text,
  key text,
  count bigint,
  pct numeric
)
language sql
security definer
set search_path = public
as $$
  with total as (select count(*)::numeric as n from public.guidance_events)
  select 'sector', sector, count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where sector is not null group by sector
  union all
  select 'risk_level', risk_level, count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where risk_level is not null group by risk_level
  union all
  select 'next_action', next_action_key, count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where next_action_key is not null group by next_action_key
  union all
  select 'language', language, count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where language is not null group by language
  union all
  select 'channel', channel, count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where channel is not null group by channel
  union all
  select 'gap_tin', 'missing', count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where has_tin = false
  union all
  select 'gap_business_registration', 'missing', count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where has_business_registration = false
  union all
  select 'gap_licence', 'missing', count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where has_licence = false
  union all
  select 'gap_records', 'missing', count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where keeps_records = false
  union all
  select 'gap_filed_return', 'missing', count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.guidance_events where filed_return = false;
$$;

grant execute on function public.get_guidance_overview() to anon;
grant execute on function public.get_guidance_breakdowns() to anon;

-- ---------------------------------------------------------------------------
-- Chat events — one row per "Ask Anything" message sent in the citizen app,
-- topic only (see engine/core.js#classifyChatTopic there), never the
-- message text. Same access pattern as guidance_events: anon can insert,
-- never select; the officer console reads only the aggregate function.
-- ---------------------------------------------------------------------------

create table if not exists public.chat_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  topic text not null,
  language text
);

alter table public.chat_events enable row level security;

drop policy if exists "anon can insert chat events" on public.chat_events;
create policy "anon can insert chat events"
  on public.chat_events
  for insert
  to anon
  with check (true);

create or replace function public.get_chat_topic_breakdown()
returns table (topic text, count bigint, pct numeric)
language sql
security definer
set search_path = public
as $$
  with total as (select count(*)::numeric as n from public.chat_events)
  select topic, count(*), round(100.0 * count(*) / greatest((select n from total), 1), 0)
  from public.chat_events
  group by topic
  order by count(*) desc;
$$;

grant execute on function public.get_chat_topic_breakdown() to anon;
