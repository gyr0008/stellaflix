-- 修复movies表的RLS策略，允许批量导入

-- 禁用movies表的RLS（或创建插入策略）
ALTER TABLE movies DISABLE ROW LEVEL SECURITY;

-- 或者创建允许插入的策略
-- CREATE POLICY "Allow insert for import" ON movies FOR INSERT WITH CHECK (true);

-- 验证
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'movies';
