-- StellaFlix 多源视频系统迁移
-- 在 Supabase SQL Editor 中执行

-- ============================================
-- 1. 视频源配置表（核心）
-- ============================================
create table if not exists public.video_source_configs (
  id uuid default gen_random_uuid() primary key,
  name text not null,                          -- 视频源名称（如：资源站A）
  code text unique not null,                   -- 唯一标识（如：source_a）
  type text not null check (type in ('cms', 'api', 'scrape', 'direct')),
                                                -- 类型：CMS接口/自定义API/网页抓取/直接链接
  base_url text not null,                      -- API基础地址
  api_format text default 'json',              -- 返回格式：json/xml
  parser_config jsonb default '{}',            -- 解析器配置
  search_path text,                            -- 搜索路径模板
  detail_path text,                            -- 详情路径模板
  categories jsonb default '["movie", "tv"]',  -- 支持的分类
  priority integer default 0,                  -- 优先级（越大越优先）
  enabled boolean default true,                -- 是否启用
  status text default 'active' check (status in ('active', 'inactive', 'error')),
                                                -- 状态
  last_sync_at timestamptz,                    -- 上次同步时间
  error_message text,                          -- 错误信息
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- 2. 视频源日志表（用于调试）
-- ============================================
create table if not exists public.video_source_logs (
  id uuid default gen_random_uuid() primary key,
  source_id uuid not null references public.video_source_configs(id) on delete cascade,
  action text not null,                        -- 操作类型：search/detail/play
  request_url text,                            -- 请求URL
  response_code integer,                       -- 响应码
  response_time_ms integer,                    -- 响应时间（毫秒）
  error_message text,                          -- 错误信息
  created_at timestamptz default now()
);

-- ============================================
-- 3. 扩展 movies 表，添加多源支持字段
-- ============================================
alter table public.movies add column if not exists source_code text;     -- 来源视频源
alter table public.movies add column if not exists source_id text;       -- 原始ID
alter table public.movies add column if not exists source_url text;      -- 原始链接
alter table public.movies add column if not exists extra_data jsonb;     -- 额外元数据

-- ============================================
-- 4. 扩展 video_sources 表（保留兼容）
-- ============================================
alter table public.video_sources add column if not exists source_config_id uuid references public.video_source_configs(id);
alter table public.video_sources add column if not exists parse_type text default 'direct';

-- ============================================
-- 5. 创建索引
-- ============================================
create index if not exists idx_video_source_configs_code on public.video_source_configs(code);
create index if not exists idx_video_source_configs_enabled on public.video_source_configs(enabled) where enabled = true;
create index if not exists idx_video_source_configs_priority on public.video_source_configs(priority desc);
create index if not exists idx_video_source_logs_source on public.video_source_logs(source_id);
create index if not exists idx_video_source_logs_created on public.video_source_logs(created_at desc);
create index if not exists idx_movies_source on public.movies(source_code, source_id);

-- ============================================
-- 6. 启用 RLS
-- ============================================
alter table public.video_source_configs enable row level security;
alter table public.video_source_logs enable row level security;

-- ============================================
-- 7. RLS 策略
-- ============================================
-- 管理员可以管理视频源配置
create policy "Admins can manage video source configs" on public.video_source_configs
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 所有用户可以查看启用的视频源
create policy "Users can view enabled video sources" on public.video_source_configs
  for select using (enabled = true);

-- 管理员可以查看日志
create policy "Admins can view video source logs" on public.video_source_logs
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 管理员可以插入日志
create policy "Admins can insert video source logs" on public.video_source_logs
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ============================================
-- 8. 自动更新时间戳触发器
-- ============================================
create or replace function public.update_video_source_configs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger video_source_configs_updated_at
  before update on public.video_source_configs
  for each row execute function public.update_video_source_configs_updated_at();

-- ============================================
-- 9. 插入示例视频源配置（可选）
-- ============================================
insert into public.video_source_configs (name, code, type, base_url, search_path, detail_path, categories, priority) values
  ('示例CMS资源站', 'example_cms', 'cms', 'https://api.example.com', '/vod/search.html?wd=', '/vod/detail-.html', '["movie", "tv"]', 10)
on conflict (code) do nothing;
