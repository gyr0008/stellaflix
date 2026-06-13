-- 视频源表
create table public.video_sources (
  id uuid default gen_random_uuid() primary key,
  movie_id uuid not null references public.movies(id) on delete cascade,
  name text not null,
  url text not null,
  quality text default 'unknown',
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_video_sources_movie on public.video_sources(movie_id);

alter table public.video_sources enable row level security;

create policy "Anyone can view active video sources" on public.video_sources
  for select using (is_active = true);
create policy "Admins can manage video sources" on public.video_sources
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
