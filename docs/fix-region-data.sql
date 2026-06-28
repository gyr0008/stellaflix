-- 修复地区和语言数据
-- 根据电影真实信息手动更新

-- 重置所有数据
UPDATE movies SET region = NULL, language = NULL;

-- 美国电影
UPDATE movies SET region = '美国', language = '英语' WHERE title IN (
  '肖申克的救赎', '阿甘正传', '星际穿越', '泰坦尼克号', '教父',
  '盗梦空间', '黑客帝国', '忠犬八公的故事', '触不可及', '楚门的世界',
  '放牛班的春天', '美丽人生', '辛德勒的名单', '阿凡达', '复仇者联盟',
  '肖申克', '拯救大兵瑞恩', '狮子王', '阿丽塔：战斗天使', '勇敢的心',
  '飞屋环游记', '寻梦环游记', '头脑特工队', '疯狂动物城', '超能陆战队',
  '冰雪奇缘', '功夫熊猫', '怪物史瑞克', '汽车总动员', '海底总动员'
);

-- 日本电影
UPDATE movies SET region = '日本', language = '日语' WHERE title IN (
  '千与千寻', '你的名字', '龙猫', '天空之城', '幽灵公主',
  '风之谷', '萤火虫之墓', '借东西的小人阿莉埃蒂', '悬崖上的金鱼姬',
  '起风了', '辉夜姬物语', '回忆中的玛妮', '红海龟', '未来的未来'
);

-- 中国电影
UPDATE movies SET region = '中国大陆', language = '汉语' WHERE title IN (
  '霸王别姬', '活着', '红高粱', '大红灯笼高高挂', '秋菊打官司',
  '一个都不能少', '英雄', '十面埋伏', '满城尽带黄金甲', '长城',
  '战狼', '流浪地球', '哪吒之魔童降世', '唐人街探案', '你好，李焕英'
);

-- 韩国电影
UPDATE movies SET region = '韩国', language = '韩语' WHERE title IN (
  '寄生虫', '熔炉', '素媛', '辩护人', '杀人回忆',
  '汉江怪物', '雪国列车', '釜山行', '王国', '甜蜜蜜'
);

-- 英国电影
UPDATE movies SET region = '英国', language = '英语' WHERE title IN (
  '国王的演讲', '憨豆先生', '哈利波特', '指环王', '1984'
);

-- 法国电影
UPDATE movies SET region = '法国', language = '法语' WHERE title IN (
  '这个杀手不太冷', '天使爱美丽', '放牛班的春天', '触不可及'
);

-- 德国电影
UPDATE movies SET region = '德国', language = '德语' WHERE title IN (
  '窃听风暴', '浪潮', '斯大林格勒'
);

-- 验证结果
SELECT region, COUNT(*) as count FROM movies WHERE region IS NOT NULL GROUP BY region ORDER BY count DESC;
SELECT language, COUNT(*) as count FROM movies WHERE language IS NOT NULL GROUP BY language ORDER BY count DESC;
