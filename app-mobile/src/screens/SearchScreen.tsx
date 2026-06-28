/**
 * 搜索页 - StellaFlix Mobile
 * 支持关键词搜索和实时结果显示
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE } from '../constants/theme';
import { searchMovies, Movie } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POSTER_WIDTH = (SCREEN_WIDTH - SPACING.lg * 3) / 2;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

export default function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // 防抖搜索
  const handleSearch = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    try {
      setLoading(true);
      setSearched(true);
      const response = await searchMovies(text.trim());
      setResults(response.data || []);
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 输入变化处理（带简单防抖）
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const onChangeText = (text: string) => {
    setQuery(text);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      handleSearch(text);
    }, 500);

    setDebounceTimer(timer);
  };

  // 渲染搜索结果卡片
  const renderResultItem = ({ item }: { item: Movie }) => (
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
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMeta}>
          {item.rating > 0 && (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color={COLORS.warning} />
              <Text style={styles.cardRating}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          {item.release_year > 0 && (
            <Text style={styles.cardYear}>{item.release_year}</Text>
          )}
        </View>
        {item.genre && item.genre.length > 0 && (
          <Text style={styles.cardGenre} numberOfLines={1}>
            {item.genre.slice(0, 3).join(' / ')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* 搜索框 */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索电影、纪录片..."
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={onChangeText}
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* 搜索结果 */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>搜索中...</Text>
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          renderItem={renderResultItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.resultsContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
        />
      ) : searched ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>没有找到相关内容</Text>
          <Text style={styles.emptyHint}>试试其他关键词？</Text>
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="film" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>搜索你想看的内容</Text>
          <Text style={styles.emptyHint}>支持电影名、演员名搜索</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // 搜索框
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },

  // 加载状态
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.md,
  },

  // 搜索结果
  resultsContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: 100,
  },
  columnWrapper: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  // 卡片
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
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardRating: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
  },
  cardYear: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  cardGenre: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // 空状态
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  emptyText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.lg,
    fontWeight: '500',
  },
  emptyHint: {
    marginTop: SPACING.xs,
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.md,
  },
});
