-- =====================================================================
-- StudyPath AI · cloud database setup (Supabase)
--
-- How to use: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. Running it again later is safe: it updates what is already there.
-- Before the app can connect, also turn on anonymous sign-ins:
-- Authentication → Sign In / Providers → "Allow anonymous sign-ins".
--
-- Privacy design
--  • Students sign in anonymously: each one is a random user id. No email,
--    no password, no real name.
--  • Row Level Security: a student can only read and change their own rows.
--  • Research: students who opt in share ONE summary of numbers (no names,
--    no notes, nothing they typed). The app's dashboard only gets totals, and
--    any group smaller than 5 students is hidden.
--  • The "analysis" views are for the project owner, in this SQL editor.
--    That schema is not reachable from the app or the internet.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Students' backups: one row per record (a class, a grade, a test, a
--    study session, a tutor chat, a check-in, a day's plan, settings…)
-- ---------------------------------------------------------------------
create table if not exists public.records (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  coll              text        not null,
  id                text        not null,
  data              jsonb       not null default '{}'::jsonb,
  updated_at        timestamptz not null default now(),          -- when the student made the change
  deleted           boolean     not null default false,
  server_updated_at timestamptz not null default clock_timestamp(), -- when the server got it
  primary key (user_id, coll, id),
  constraint records_coll_ok check (coll in ('profile', 'consent', 'settings', 'program', 'classes', 'grades',
                                             'tests', 'sessions', 'tutor', 'checkins', 'events', 'plans')),
  constraint records_id_ok   check (char_length(id) between 1 and 120),
  constraint records_size_ok check (pg_column_size(data) <= 200000)
);
create index if not exists records_pull_idx on public.records (user_id, server_updated_at);

-- Server time on every write, so another device can ask "what changed since…".
create or replace function public.records_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end
$$;
drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();

alter table public.records enable row level security;
drop policy if exists "records: own rows" on public.records;
create policy "records: own rows" on public.records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.records from public, anon;
grant select, insert, update, delete on public.records to authenticated;

-- The app sends its changes here in batches. The newest edit of a record wins,
-- so a phone that was offline can't overwrite newer changes made on a laptop.
create or replace function public.sync_push(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  stored integer;
  changed integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(rows) > 500 then
    raise exception 'Too many rows in one call (500 at most)' using errcode = '54000';
  end if;
  select count(*) into stored from public.records where user_id = me;
  if stored > 20000 then
    raise exception 'Storage limit reached for this student' using errcode = '54000';
  end if;

  insert into public.records as r (user_id, coll, id, data, updated_at, deleted)
  select distinct on (x.coll, x.id)
         me, x.coll, x.id, coalesce(x.data, '{}'::jsonb), coalesce(x.updated_at, now()), coalesce(x.deleted, false)
  from jsonb_to_recordset(rows) as x (coll text, id text, data jsonb, updated_at timestamptz, deleted boolean)
  where x.coll is not null and x.id is not null
  order by x.coll, x.id, x.updated_at desc nulls last
  on conflict (user_id, coll, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted
    where r.updated_at <= excluded.updated_at;

  get diagnostics changed = row_count;
  return changed;
end
$$;
revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 2. Research: one summary of numbers per student who opted in
-- ---------------------------------------------------------------------
create table if not exists public.research_summaries (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint research_size_ok check (pg_column_size(data) <= 20000)
);
-- every summary needs its list of weeks (up to 10)
alter table public.research_summaries drop constraint if exists research_shape_ok;
alter table public.research_summaries add constraint research_shape_ok
  check (coalesce(jsonb_typeof(data -> 'weeks') = 'array' and jsonb_array_length(data -> 'weeks') <= 10, false));

alter table public.research_summaries enable row level security;
drop policy if exists "research: own summary" on public.research_summaries;
create policy "research: own summary" on public.research_summaries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.research_summaries from public, anon;
grant select, insert, update, delete on public.research_summaries to authenticated;


-- ---------------------------------------------------------------------
-- 3. Totals for the research dashboard (the same numbers the app shows)
-- ---------------------------------------------------------------------
create schema if not exists analysis;
revoke all on schema analysis from public, anon, authenticated;

-- A number from the summary, or null when it is missing or out of range
-- (so one broken or made-up summary can't break or skew the totals).
create or replace function analysis.num(v jsonb, lo numeric, hi numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(v) = 'number' and (v::text)::numeric between lo and hi then (v::text)::numeric
  end
$$;

create or replace function analysis.research_totals(k integer default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n_students integer;
  weeks_json jsonb;
  change_json jsonb;
  dose_json  jsonb := '[]'::jsonb;
  n_paired   integer;
begin
  select count(*) into n_students from public.research_summaries;

  if n_students < k then
    return jsonb_build_object('source', 'cloud', 'students', n_students, 'tooFew', true, 'minGroup', k,
                              'weeks', '[]'::jsonb, 'dose', '[]'::jsonb, 'change', null, 'generatedAt', now());
  end if;

  -- one row per student and week
  with w as (
    select distinct on (s.user_id, analysis.num(x -> 'week', 1, 10))
      analysis.num(x -> 'week', 1, 10)            as week,
      analysis.num(x -> 'avg', 0, 100)            as avg_grade,
      analysis.num(x -> 'minutes', 0, 10080)      as minutes,
      analysis.num(x -> 'sessions', 0, 500)       as sessions,
      analysis.num(x -> 'planPct', 0, 100)        as plan_pct,
      analysis.num(x -> 'hints', 0, 50)           as hints,
      analysis.num(x -> 'tutorMsgs', 0, 5000)     as tutor_msgs,
      coalesce(analysis.num(x -> 'reminders', 0, 1000), 0) as reminders,
      coalesce(analysis.num(x -> 'opened', 0, 1000), 0)    as opened,
      analysis.num(x -> 'mood', 1, 5)             as mood,
      analysis.num(x -> 'confidence', 1, 5)       as confidence,
      analysis.num(x -> 'stress', 1, 5)           as stress,
      coalesce(analysis.num(x -> 'challenge', 0, 1), 0) as challenge,
      coalesce(analysis.num(x -> 'lesson', 0, 1), 0)    as lesson
    from public.research_summaries s
    cross join lateral jsonb_array_elements(s.data -> 'weeks') as x
    where analysis.num(x -> 'week', 1, 10) is not null
    order by s.user_id, analysis.num(x -> 'week', 1, 10)
  ),
  g as (
    select week::int as week,
           count(*) as n,
           round(avg(avg_grade), 1)   as avg_grade,
           round(avg(minutes), 1)     as avg_minutes,
           round(avg(sessions), 1)    as avg_sessions,
           round(avg(plan_pct), 1)    as avg_plan_pct,
           round(avg(hints), 1)       as avg_hints,
           round(avg(tutor_msgs), 1)  as avg_tutor_msgs,
           round(avg(mood), 1)        as avg_mood,
           round(avg(confidence), 1)  as avg_confidence,
           round(avg(stress), 1)      as avg_stress,
           round(100.0 * sum(challenge) / count(*)) as challenge_pct,
           round(100.0 * sum(lesson) / count(*))    as lesson_pct,
           case when sum(reminders) >= 10 then round(least(100.0, 100.0 * sum(opened) / sum(reminders))) end as open_rate
    from w
    group by week
    having count(*) >= k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'week', week, 'n', n,
           'avgGrade', avg_grade, 'avgMinutes', avg_minutes, 'avgSessions', avg_sessions,
           'avgPlanPct', avg_plan_pct, 'avgHints', avg_hints, 'avgTutorMsgs', avg_tutor_msgs,
           'avgMood', avg_mood, 'avgConfidence', avg_confidence, 'avgStress', avg_stress,
           'challengePct', challenge_pct, 'lessonPct', lesson_pct, 'openRate', open_rate
         ) order by week), '[]'::jsonb)
  into weeks_json
  from g;

  -- grade change from week 1 to now, for students with at least two weeks
  with p as (
    select analysis.num(data -> 'startAvg', 0, 100) as start_avg,
           analysis.num(data -> 'nowAvg', 0, 100)   as now_avg,
           coalesce(analysis.num(data -> 'avgWeeklyMinutes', 0, 10080), 0) as weekly_minutes
    from public.research_summaries
    where jsonb_array_length(data -> 'weeks') >= 2
  ),
  paired as (
    select start_avg, now_avg, now_avg - start_avg as delta, weekly_minutes
    from p
    where start_avg is not null and now_avg is not null
  )
  select count(*),
         case when count(*) >= k then jsonb_build_object(
           'n', count(*),
           'avgStart', round(avg(start_avg), 1),
           'avgNow', round(avg(now_avg), 1),
           'avgDelta', round(avg(delta), 1),
           'improvedPct', round(100.0 * count(*) filter (where delta > 0) / count(*))
         ) end
  into n_paired, change_json
  from paired;

  if n_paired >= k then
    with p as (
      select analysis.num(data -> 'nowAvg', 0, 100) - analysis.num(data -> 'startAvg', 0, 100) as delta,
             coalesce(analysis.num(data -> 'avgWeeklyMinutes', 0, 10080), 0) as weekly_minutes
      from public.research_summaries
      where jsonb_array_length(data -> 'weeks') >= 2
    ),
    bands(ord, key, label, lo, hi) as (
      values (1, 'low', 'Under 60 min/week', 0::numeric, 60::numeric),
             (2, 'mid', '60–119 min/week', 60::numeric, 120::numeric),
             (3, 'high', '120+ min/week', 120::numeric, 1e9::numeric)
    ),
    b as (
      select bands.ord, bands.key, bands.label,
             count(p.delta) as n,
             round(avg(p.delta), 1) as avg_delta
      from bands
      left join p on p.delta is not null and p.weekly_minutes >= bands.lo and p.weekly_minutes < bands.hi
      group by bands.ord, bands.key, bands.label
    )
    select jsonb_agg(jsonb_build_object('key', key, 'label', label, 'n', n,
                                        'avgDelta', case when n >= k then avg_delta end) order by ord)
    into dose_json
    from b;
  end if;

  return jsonb_build_object('source', 'cloud', 'students', n_students, 'tooFew', false, 'minGroup', k,
                            'weeks', weeks_json, 'dose', coalesce(dose_json, '[]'::jsonb),
                            'change', change_json, 'generatedAt', now());
end
$$;
revoke all on function analysis.research_totals(integer) from public, anon, authenticated;
revoke all on function analysis.num(jsonb, numeric, numeric) from public, anon, authenticated;

-- What the app calls. Signed-in students get totals only (never anyone's summary).
create or replace function public.research_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return analysis.research_totals(5);
end
$$;
revoke all on function public.research_dashboard() from public, anon;
grant execute on function public.research_dashboard() to authenticated;

-- Tables for the SQL editor and Google Sheets (Download CSV in the results).
create or replace view analysis.weekly_totals as
select *
from jsonb_to_recordset(analysis.research_totals() -> 'weeks') as t (
  week int, n int, "avgGrade" numeric, "avgMinutes" numeric, "avgSessions" numeric, "avgPlanPct" numeric,
  "avgHints" numeric, "avgTutorMsgs" numeric, "openRate" numeric, "avgMood" numeric,
  "avgConfidence" numeric, "avgStress" numeric, "challengePct" numeric, "lessonPct" numeric
);

create or replace view analysis.grade_change as
select (analysis.research_totals() ->> 'students')::int as students_sharing,
       c.*
from jsonb_to_record(analysis.research_totals() -> 'change') as c (
  n int, "avgStart" numeric, "avgNow" numeric, "avgDelta" numeric, "improvedPct" numeric
);

create or replace view analysis.study_time_vs_change as
select *
from jsonb_to_recordset(analysis.research_totals() -> 'dose') as d (key text, label text, n int, "avgDelta" numeric);

-- How many students share, by grade level (groups under 5 are shown as "fewer than 5").
create or replace view analysis.participation as
select coalesce(nullif(data ->> 'gradeLevel', ''), 'not set') as grade_level,
       case when count(*) >= 5 then count(*)::text else 'fewer than 5' end as students
from public.research_summaries
group by 1
order by 1;

revoke all on all tables in schema analysis from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Optional: reminders sent by the server while the app is closed
--    (Web Push). The app works without this; see the guide.
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint   text        primary key,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  keys       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint push_endpoint_ok check (endpoint like 'https://%' and char_length(endpoint) <= 1000)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push: own devices" on public.push_subscriptions;
create policy "push: own devices" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from public, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.reminders (
  user_id uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key     text        not null,
  at      timestamptz not null,
  title   text        not null,
  body    text        not null default '',
  url     text        not null default '#today',
  type    text        not null default 'info',
  sent_at timestamptz,
  primary key (user_id, key),
  constraint reminders_text_ok check (char_length(title) <= 200 and char_length(body) <= 500 and char_length(url) <= 200)
);
create index if not exists reminders_due_idx on public.reminders (at) where sent_at is null;
alter table public.reminders enable row level security;
drop policy if exists "reminders: own rows" on public.reminders;
create policy "reminders: own rows" on public.reminders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.reminders from public, anon;
grant select, insert, update, delete on public.reminders to authenticated;

-- The app sends its next 7 days of reminders; unsent ones are replaced.
create or replace function public.replace_reminders(items jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  changed integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 100 then
    raise exception 'items must be a JSON array (100 at most)' using errcode = '22023';
  end if;
  delete from public.reminders where user_id = me and sent_at is null;
  insert into public.reminders (user_id, key, at, title, body, url, type)
  select distinct on (x.key) me, left(x.key, 120), x.at, left(x.title, 200), left(coalesce(x.body, ''), 500),
         left(coalesce(x.url, '#today'), 200), left(coalesce(x.type, 'info'), 30)
  from jsonb_to_recordset(items) as x (key text, at timestamptz, title text, body text, url text, type text)
  where x.key is not null and x.at is not null and x.title is not null
  order by x.key
  on conflict (user_id, key) do nothing;   -- already sent: keep it
  get diagnostics changed = row_count;
  return changed;
end
$$;
revoke all on function public.replace_reminders(jsonb) from public, anon;
grant execute on function public.replace_reminders(jsonb) to authenticated;

-- Done. Check it worked: Table Editor should now show records, research_summaries,
-- push_subscriptions and reminders, each with "RLS enabled".
