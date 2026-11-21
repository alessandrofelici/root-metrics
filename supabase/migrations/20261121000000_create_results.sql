-- rootclock game results (payload contract v1), one row per game_id.
-- The app writes and reads this table only from the server (Vercel Function or the Node server)
-- with the secret / service_role key. Browsers never talk to Supabase directly.

create table if not exists public.results (
  game_id  text primary key check (char_length(game_id) between 1 and 32),
  saved_at timestamptz not null default now(),
  -- insert order, the tie-breaker when two saved_at values are equal
  seq      bigint generated always as identity,
  warnings jsonb not null default '[]'::jsonb,
  result   jsonb not null
);

create index if not exists results_saved_at_seq_idx on public.results (saved_at desc, seq desc);

-- Row level security with no policies: the anon and authenticated roles (the publishable /
-- anon keys) can neither read nor write. The service_role bypasses RLS.
alter table public.results enable row level security;
revoke all on table public.results from anon, authenticated;

-- Explicit, in case the project does not grant new tables to the Data API automatically.
grant select, insert on table public.results to service_role;
