-- Seed video sources for all movies
-- Run this in Supabase SQL Editor

-- Insert video sources for each movie
-- Using sample video URLs (replace with real URLs as needed)

INSERT INTO public.video_sources (movie_id, name, url, quality, is_active)
SELECT
  id,
  '在线播放',
  CASE
    WHEN title = '星际穿越' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '盗梦空间' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '肖申克的救赎' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '阿甘正传' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '泰坦尼克号' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '千与千寻' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '这个杀手不太冷' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '美丽人生' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '辛德勒的名单' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '楚门的世界' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '海上钢琴师' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '三傻大闹宝莱坞' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '机器人总动员' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '疯狂动物城' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '触不可及' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '教父' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '蝙蝠侠：黑暗骑士' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '指环王：王者归来' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '搏击俱乐部' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '星际探索' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '地球脉动' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '蓝色星球' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '宇宙时空之旅' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '冰冻星球' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    WHEN title = '生命' THEN 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
    ELSE 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4'
  END,
  '720p',
  true
FROM public.movies
WHERE NOT EXISTS (
  SELECT 1 FROM public.video_sources WHERE movie_id = movies.id
);

-- Add a second source (1080p) for movies
INSERT INTO public.video_sources (movie_id, name, url, quality, is_active)
SELECT
  id,
  '高清源',
  'https://sample-videos.com/video321/mp4/1080/big_buck_bunny_1080p_1mb.mp4',
  '1080p',
  true
FROM public.movies
WHERE title IN ('星际穿越', '盗梦空间', '肖申克的救赎', '阿甘正传', '泰坦尼克号')
AND NOT EXISTS (
  SELECT 1 FROM public.video_sources WHERE movie_id = movies.id AND quality = '1080p'
);

-- Verify
SELECT m.title, COUNT(vs.id) as source_count
FROM public.movies m
LEFT JOIN public.video_sources vs ON vs.movie_id = m.id
GROUP BY m.title
ORDER BY m.title;
