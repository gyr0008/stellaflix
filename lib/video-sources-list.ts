/**
 * 视频源列表
 * 从 TVBox 配置文件中提取的 CMS 类型视频源
 * 测试时间：2024年
 */

export interface VideoSource {
  name: string;
  api: string;
  type: 1 | 3;  // 1=CMS, 3=爬虫
  regions: string[];
  available: boolean;
}

// CMS 类型视频源（已测试可用）
export const CMS_SOURCES: VideoSource[] = [
  // ✅ 已验证可用的源
  {
    name: '暴风影视',
    api: 'https://bfzyapi.com/api.php/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
  {
    name: '量子资源',
    api: 'https://cj.lziapi.com/api.php/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
  {
    name: '非凡资源',
    api: 'http://cj.ffzyapi.com/api.php/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
  {
    name: '光速资源',
    api: 'https://api.guangsuapi.com/api.php/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
  {
    name: '红牛资源',
    api: 'https://www.hongniuzy2.com/api.php/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
  {
    name: '恋单资源',
    api: 'https://www.lovedan.net/api.php/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
  {
    name: '瑞诚资源',
    api: 'https://cj.rycjapi.com/api.php/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
  {
    name: '360资源',
    api: 'https://360zy.com/api.php/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
  {
    name: '佳影资源',
    api: 'https://jyzyapi.com/provide/vod',
    type: 1,
    regions: ['全球'],
    available: true,
  },
];

// API 接口格式
export const API_FORMAT = {
  search: '?ac=detail&wd=关键词',      // 搜索
  detail: '?ac=detail&ids=视频ID',     // 详情
  list: '?ac=detail&t=分类ID&page=1', // 列表
};
