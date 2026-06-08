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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'beta-videos',
  'beta-videos',
  true,
  104857600,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read beta videos" on storage.objects;
create policy "Anyone can read beta videos"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'beta-videos');

drop policy if exists "Users can upload their own beta videos" on storage.objects;
create policy "Users can upload their own beta videos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'beta-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own beta videos" on storage.objects;
create policy "Users can update their own beta videos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'beta-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'beta-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own beta videos" on storage.objects;
create policy "Users can delete their own beta videos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'beta-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists public.public_gyms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id text not null,
  gym_name text not null,
  gym_area text not null default '未填写',
  image_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, gym_id)
);

alter table public.public_gyms enable row level security;

drop policy if exists "Anyone can read public gyms" on public.public_gyms;
create policy "Anyone can read public gyms"
  on public.public_gyms
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can publish their own gyms" on public.public_gyms;
create policy "Users can publish their own gyms"
  on public.public_gyms
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own gyms in public directory" on public.public_gyms;
create policy "Users can update their own gyms in public directory"
  on public.public_gyms
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own gyms from public directory" on public.public_gyms;
create policy "Users can delete their own gyms from public directory"
  on public.public_gyms
  for delete
  to authenticated
  using (auth.uid() = user_id);

insert into public.public_gyms (
  user_id,
  gym_id,
  gym_name,
  gym_area,
  image_url,
  updated_at
)
select
  user_gyms.user_id,
  coalesce(gym ->> 'id', gym ->> 'name'),
  coalesce(nullif(gym ->> 'name', ''), '未命名岩馆'),
  coalesce(nullif(gym ->> 'area', ''), '未填写'),
  coalesce(gym ->> 'imageUrl', ''),
  now()
from public.user_gyms
cross join lateral jsonb_array_elements(user_gyms.gyms) as gym
where coalesce(gym ->> 'id', gym ->> 'name') is not null
on conflict (user_id, gym_id)
do update set
  gym_name = excluded.gym_name,
  gym_area = excluded.gym_area,
  image_url = excluded.image_url,
  updated_at = excluded.updated_at;

create table if not exists public.public_route_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_label text not null default '匿名用户',
  gym_id text not null,
  gym_name text not null,
  gym_area text not null default '未填写',
  route_id text not null,
  route_name text not null,
  grade text not null default '未定级',
  sent_at date,
  route_image_url text not null,
  beta_video_url text not null default '',
  notes text not null default '',
  discussion_prompt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, route_id)
);

alter table public.public_route_posts enable row level security;

drop policy if exists "Anyone can read public route posts" on public.public_route_posts;
create policy "Anyone can read public route posts"
  on public.public_route_posts
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can publish their own route posts" on public.public_route_posts;
create policy "Users can publish their own route posts"
  on public.public_route_posts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own route posts" on public.public_route_posts;
create policy "Users can update their own route posts"
  on public.public_route_posts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own route posts" on public.public_route_posts;
create policy "Users can delete their own route posts"
  on public.public_route_posts
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.public_route_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.public_route_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_label text not null default '匿名用户',
  content text not null check (length(trim(content)) between 1 and 1200),
  created_at timestamptz not null default now()
);

alter table public.public_route_comments enable row level security;

drop policy if exists "Anyone can read public route comments" on public.public_route_comments;
create policy "Anyone can read public route comments"
  on public.public_route_comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can comment as themselves" on public.public_route_comments;
create policy "Users can comment as themselves"
  on public.public_route_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own comments" on public.public_route_comments;
create policy "Users can delete their own comments"
  on public.public_route_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);
