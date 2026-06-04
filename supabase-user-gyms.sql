create table if not exists public.user_gyms (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gyms jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_gyms enable row level security;

drop policy if exists "Users can read their own gyms" on public.user_gyms;
create policy "Users can read their own gyms"
  on public.user_gyms
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own gyms" on public.user_gyms;
create policy "Users can insert their own gyms"
  on public.user_gyms
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own gyms" on public.user_gyms;
create policy "Users can update their own gyms"
  on public.user_gyms
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
