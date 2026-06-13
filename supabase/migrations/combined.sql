-- ============================================
-- CineStream 完整数据库迁移（合并版）
-- 在 Supabase SQL Editor 中一次性执行
-- ============================================

-- 1. 用户资料表
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. 电影表
create table public.movies (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  poster_url text,
  backdrop_url text,
  video_url text,
  bunny_video_id text,
  trailer_url text,
  duration integer,
  year integer,
  genre text[] default '{}',
  rating numeric(3,1) default 0,
  rating_count integer default 0,
  is_premium boolean default false,
  is_published boolean default false,
  type text not null default 'movie' check (type in ('movie', 'documentary')),
  director text,
  cast_members text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. 收藏表
create table public.favorites (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references public.movies(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, movie_id)
);

-- 4. 观影进度表（跨设备续播）
create table public.watch_progress (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references public.movies(id) on delete cascade,
  position_seconds numeric not null default 0,
  duration_seconds numeric not null default 0,
  completed boolean default false,
  updated_at timestamptz default now(),
  unique(user_id, movie_id)
);

-- 5. 索引
create index idx_movies_genre on public.movies using gin(genre);
create index idx_movies_year on public.movies(year desc);
create index idx_movies_rating on public.movies(rating desc);
create index idx_movies_published on public.movies(is_published) where is_published = true;
create index idx_movies_type on public.movies(type);
create index idx_favorites_user on public.favorites(user_id);
create index idx_favorites_movie on public.favorites(movie_id);
create index idx_watch_progress_user on public.watch_progress(user_id);
create index idx_watch_progress_movie on public.watch_progress(movie_id);

-- 6. RLS
alter table public.profiles enable row level security;
alter table public.movies enable row level security;
alter table public.favorites enable row level security;
alter table public.watch_progress enable row level security;

-- Profiles 策略
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Movies 策略
create policy "Anyone can view published movies" on public.movies
  for select using (is_published = true);
create policy "Admins can manage movies" on public.movies
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Favorites 策略
create policy "Users can view own favorites" on public.favorites
  for select using (auth.uid() = user_id);
create policy "Users can insert own favorites" on public.favorites
  for insert with check (auth.uid() = user_id);
create policy "Users can delete own favorites" on public.favorites
  for delete using (auth.uid() = user_id);

-- Watch progress 策略
create policy "Users can view own progress" on public.watch_progress
  for select using (auth.uid() = user_id);
create policy "Users can upsert own progress" on public.watch_progress
  for insert with check (auth.uid() = user_id);
create policy "Users can update own progress" on public.watch_progress
  for update using (auth.uid() = user_id);

-- 7. 自动创建用户资料的触发器
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8. 自动更新 updated_at 的触发器
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();
create trigger movies_updated_at before update on public.movies
  for each row execute function public.update_updated_at();
