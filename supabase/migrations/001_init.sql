-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  role text default 'user' check (role in ('user', 'admin')),
  subscription_status text default 'free' check (subscription_status in ('free', 'active', 'cancelled', 'expired')),
  subscription_plan text,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Movies table
create table public.movies (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  poster_url text,
  backdrop_url text,
  video_url text,
  bunny_video_id text,
  trailer_url text,
  duration integer, -- seconds
  year integer,
  genre text[] default '{}',
  rating numeric(3,1) default 0,
  rating_count integer default 0,
  is_premium boolean default false,
  is_published boolean default false,
  director text,
  cast_members text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Watch history
create table public.watch_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  movie_id uuid references public.movies(id) on delete cascade not null,
  progress integer default 0, -- seconds watched
  completed boolean default false,
  last_watched_at timestamptz default now(),
  unique(user_id, movie_id)
);

-- Favorites
create table public.favorites (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  movie_id uuid references public.movies(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, movie_id)
);

-- Payments log
create table public.payments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  stripe_payment_id text unique,
  amount integer not null,
  currency text default 'usd',
  status text not null,
  plan text,
  created_at timestamptz default now()
);

-- Indexes
create index idx_movies_genre on public.movies using gin(genre);
create index idx_movies_year on public.movies(year desc);
create index idx_movies_rating on public.movies(rating desc);
create index idx_movies_published on public.movies(is_published) where is_published = true;
create index idx_watch_history_user on public.watch_history(user_id);
create index idx_favorites_user on public.favorites(user_id);
create index idx_payments_user on public.payments(user_id);

-- RLS
alter table public.profiles enable row level security;
alter table public.movies enable row level security;
alter table public.watch_history enable row level security;
alter table public.favorites enable row level security;
alter table public.payments enable row level security;

-- Profiles policies
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Movies policies
create policy "Anyone can view published movies" on public.movies
  for select using (is_published = true);
create policy "Admins can manage movies" on public.movies
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Watch history policies
create policy "Users can view own watch history" on public.watch_history
  for select using (auth.uid() = user_id);
create policy "Users can manage own watch history" on public.watch_history
  for all using (auth.uid() = user_id);

-- Favorites policies
create policy "Users can view own favorites" on public.favorites
  for select using (auth.uid() = user_id);
create policy "Users can manage own favorites" on public.favorites
  for all using (auth.uid() = user_id);

-- Payments policies
create policy "Users can view own payments" on public.payments
  for select using (auth.uid() = user_id);

-- Function: auto-create profile on signup
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

-- Function: update updated_at
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
