-- 1. 添加 type 字段到 movies 表
ALTER TABLE movies ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'movie'
  CHECK (type IN ('movie', 'documentary'));

-- 2. 创建收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, movie_id)
);

-- 3. 创建观影进度表
CREATE TABLE IF NOT EXISTS watch_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  position_seconds NUMERIC NOT NULL DEFAULT 0,
  duration_seconds NUMERIC NOT NULL DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, movie_id)
);

-- 4. RLS 策略
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_progress ENABLE ROW LEVEL SECURITY;

-- favorites: 用户只能操作自己的收藏
CREATE POLICY "Users can view own favorites" ON favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE USING (auth.uid() = user_id);

-- watch_progress: 用户只能操作自己的进度
CREATE POLICY "Users can view own progress" ON watch_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert own progress" ON watch_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON watch_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- 5. 索引
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_movie ON favorites(movie_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_user ON watch_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_progress_movie ON watch_progress(movie_id);
CREATE INDEX IF NOT EXISTS idx_movies_type ON movies(type);
