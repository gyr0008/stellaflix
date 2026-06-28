/**
 * 电影列表页 - StellaFlix Mobile
 * 支持分类筛选和无限滚动
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE } from '../constants/theme';
import { fetchMovies, Movie } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_COUNT = 2;
const POSTER_WIDTH = (SCREEN_WIDTH - SPACING.lg * (COLUMN_COUNT + 1)) / COLUMN_COUNT;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

// 预设分类标签
const GENRES = ['全部', '动作', '喜剧', '爱情', '科幻', '恐怖', '剧情', '动画', '悬疑', '犯罪'];

export default function MoviesScreen({ navigation }: any) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedGenre, setSelectedGenre] = useState('全部');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // 加载数据
  const loadMovies = async (pageNum: number, genre: string, reset: boolean = false) => {
    try {
      const genreParam = genre === '全部' ? undefined : genre;
      const response = await fetchMovies('movie', genreParam, pageNum, 20);

      if (reset) {
        setMovies(response.data || []);
      } else {
        setMovies(prev => [...prev, ...(response.data || [])]);
      }

      setHasMore(response.hasMore);
    } catch (error) {
      console.error('加载电影失败:', error);
    }
  };

  // 初始加载
  useEffect(() => {
    setLoading(true);
    loadMovies(1, selectedGenre, true).finally(() => setLoading(false));
  }, [selectedGenre]);

  // 切换分类
  const handleGenreChange = (genre: string) => {
    setSelectedGenre(genre);
    setPage(1);
    setHasMore(true);
  };

  // 加载更多
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      const nextPage = page + 1;
      setPage(nextPage);
      loadMovies(nextPage, selectedGenre).finally(() => setLoadingMore(false));
    }
  };

  // 渲染分类标签
  const renderGenreTag = (genre: string) => (
    <TouchableOpacity
      key={genre}
      style={[
        styles.genreTag,
        selectedGenre === genre && styles.genreTagActive,
      ]}
      onPress={() => handleGenreChange(genre)}
    >
      <Text
        style={[
          styles.genreTagText,
          selectedGenre === genre && styles.genreTagTextActive,
        ]}
      >
        {genre}
      </Text>
    </TouchableOpacity>
  );

  // 渲染视频卡片
  const renderMovieItem = ({ item }: { item: Movie }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('Player', { id: item.id, title: item.title })}
    >
      <Image
        source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
        style={styles.poster}
        resizeMode="cover"
      />
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.cardMeta}>
          <Ionicons name="star" size={12} color={COLORS.warning} />
          <Text style={styles.cardRating}>{item.rating?.toFixed(1) || 'N/A'}</Text>
          <Text style={styles.cardYear}>{item.release_year}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  // 底部加载指示器
  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 分类筛选标签 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.genreContainer}
        contentContainerStyle={styles.genreContent}
      >
        {GENRES.map(renderGenreTag)}
      </ScrollView>

      {/* 电影列表 */}
      <FlatList
        data={movies}
        renderItem={renderMovieItem}
        keyExtractor={(item) => item.id}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="film" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>暂无该分类的电影</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.md,
  },

  // 分类筛选
  genreContainer: {
    maxHeight: 50,
    backgroundColor: COLORS.surface,
  },
  genreContent: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  genreTag: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceLight,
  },
  genreTagActive: {
    backgroundColor: COLORS.primary,
  },
  genreTagText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  genreTagTextActive: {
    color: COLORS.text,
    fontWeight: '600',
  },

  // 电影列表
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: 100,
  },
  columnWrapper: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  // 电影卡片
  card: {
    width: POSTER_WIDTH,
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  cardInfo: {
    marginTop: SPACING.xs,
  },
  cardTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: '500',
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 2,
  },
  cardRating: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
  },
  cardYear: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },

  // 空状态
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    marginTop: SPACING.md,
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.md,
  },

  // 底部加载
  footer: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
});
