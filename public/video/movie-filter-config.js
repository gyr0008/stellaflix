/*
 * Stellaflix 影视模块 — 电影筛选器 常量与状态层 (T134)
 *
 * 从 movie-filter.js 抽出的纯配置 + 状态层：
 *   - 排序 / 类型 / 地区 选项表
 *   - 年份段动态构造
 *   - 筛选状态工厂与浅拷贝
 *
 * 本文件不依赖 DOM，先于 movie-filter.js 加载，
 * 通过 SFV.movieFilterConfig 暴露给 movie-filter.js。
 */
(function (global) {
  'use strict';
  var SFV = (global.StellaflixVideo = global.StellaflixVideo || {});
  if (SFV.movieFilterConfig) return; // 幂等守卫

  // 排序选项 → TMDB sort_by 值
  var SORT_OPTIONS = [
    { key: 'popularity', label: '热门', sortBy: 'popularity.desc' },
    { key: 'rating',     label: '高评分', sortBy: 'vote_average.desc' },
    { key: 'newest',     label: '最新', sortBy: 'primary_release_date.desc' }
  ];

  // 年份：动态生成最近5年 + 更早分段
  function buildYearOptions() {
    var now = new Date().getFullYear();
    var years = [];
    for (var i = 0; i < 5; i++) years.push(now - i);
    return {
      recent: years,
      earlier: [
        { label: '2021-2019', min: 2019, max: 2021 },
        { label: '2010s',     min: 2010, max: 2019 },
        { label: '2000s',     min: 2000, max: 2009 },
        { label: '经典',      min: 0,   max: 1999 }
      ]
    };
  }

  // 电影类型标签 → TMDB genre_id
  var MOVIE_GENRES = [
    { id: 28,       label: '动作' },
    { id: 35,       label: '喜剧' },
    { id: 878,      label: '科幻' },
    { id: 10749,    label: '爱情' },
    { id: 53,       label: '惊悚' },
    { id: 16,       label: '动画' },
    // 前6个常驻，以下通过"+更多"展示
    { id: 18,       label: '剧情' },
    { id: 27,       label: '恐怖' },
    { id: 9648,     label: '悬疑' },
    { id: 10752,    label: '战争' },
    { id: 14,       label: '奇幻' },
    { id: 99,       label: '纪录片' },   // 电影中的纪录片类别
    { id: 36,       label: '历史' },
    { id: 10402,    label: '音乐' },
    { id: 10751,    label: '家庭' },
    { id: 9801,     label: '运动' },
    { id: 80,       label: '犯罪' }
  ];
  var MOVIE_GENRE_VISIBLE = 6; // 常驻显示数量

  // 纪录片子类标签（TMDB 无细分子类，全部映射 genre=99 + 可选 keyword）
  // 此处用虚拟分类供用户筛选体验，数据层统一用 with_genres=99
  var DOC_GENRES = [
    { id: 'doc_nature',   label: '自然',     keyword: 'nature' },
    { id: 'doc_history',  label: '历史',     keyword: 'history documentary' },
    { id: 'doc_bio',      label: '传记',     keyword: 'biography' },
    { id: 'doc_crime',    label: '真实罪案',  keyword: 'true crime' },
    { id: 'doc_social',   label: '社会',     keyword: 'society' },
    { id: 'doc_science',  label: '科学',     keyword: 'science' },
    // 前6个常驻
    { id: 'doc_space',    label: '太空/宇宙', keyword: 'space universe' },
    { id: 'doc_music',    label: '音乐与艺术', keyword: 'music art' },
    { id: 'doc_food',     label: '美食',     keyword: 'food' },
    { id: 'doc_travel',   label: '旅行',     keyword: 'travel' },
    { id: 'doc_sport',    label: '体育',     keyword: 'sports' },
    { id: 'doc_politics', label: '政治',     keyword: 'politics' },
    { id: 'doc_people',   label: '人物',     keyword: 'people profile' },
    { id: 'doc_war',      label: '战争',     keyword: 'war' }
  ];
  var DOC_GENRE_VISIBLE = 6;

  // 地区选项 → TMDB with_origin_country / with_original_language
  var REGION_OPTIONS = [
    { key: 'cn',   label: '华语', language: 'zh' },
    { key: 'en',   label: '欧美', language: 'en' },
    { key: 'kr',   label: '韩国', language: 'ko' },
    { key: 'jp',   label: '日本', language: 'ja' },
    { key: 'other', label: '其他', language: null }  // 不限语言
  ];

  function createState() {
    return {
      category: 'movie',          // 'movie' | 'documentary'
      sort: 'popularity',         // SORT_OPTIONS key
      years: {},                   // Set semantics: { "2026": true, ... }
      genres: {},                  // Set semantics: { "28": true, ... }
      regions: {},                 // Set semantics: { "cn": true, ... }
      panelOpen: false,
      moreGenresOpen: false,
      earlierOpen: false          // "更早"年份下拉
    };
  }

  // 浅拷贝状态中的 Set 对象
  function cloneSets(st) {
    return {
      years: Object.assign({}, st.years),
      genres: Object.assign({}, st.genres),
      regions: Object.assign({}, st.regions)
    };
  }

  SFV.movieFilterConfig = {
    SORT_OPTIONS: SORT_OPTIONS,
    buildYearOptions: buildYearOptions,
    MOVIE_GENRES: MOVIE_GENRES,
    MOVIE_GENRE_VISIBLE: MOVIE_GENRE_VISIBLE,
    DOC_GENRES: DOC_GENRES,
    DOC_GENRE_VISIBLE: DOC_GENRE_VISIBLE,
    REGION_OPTIONS: REGION_OPTIONS,
    createState: createState,
    cloneSets: cloneSets
  };
})(typeof window !== 'undefined' ? window : this);
