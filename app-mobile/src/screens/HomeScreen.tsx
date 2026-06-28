/**
 * 首页 - StellaFlix Mobile
 * 显示最新和推荐内容
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE } from '../constants/theme';
import { fetchMovies, Movie } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POSTER_WIDTH = (SCREEN_WIDTH - SPACING.lg * 3) / 2;
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

export default function HomeScreen({ navigation }: any) {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [documentaries, setDocumentaries] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [moviesRes, docsRes] = await Promise.all([
        fetchMovies('movie', undefined, 1, 10),
        fetchMovies('documentary', undefined, 1, 10),
      ]);
      setMovies(moviesRes.data || []);
      setDocumentaries(docsRes.data || []);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 渲染视频卡片
  const renderMovieCard = ({ item }: { item: Movie }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('Player', { id: item.id, title: item.title })}
    >
      <Image
        source={{ uri: item.poster || 'https://via.placeholder.com/300x450' }}
        style={styles.poster}
        resizeMode="cover"
      />
      <View style={styles.cardOverlay}>
        <Ionicons name="play-circle" size={32} color={COLORS.primary} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
      <View style={styles.ratingContainer}>
        <Ionicons name="star" size={12} color={COLORS.warning} />
        <Text style={styles.rating}>{item.rating?.toFixed(1) || 'N/A'}</Text>
      </View>
    </TouchableOpacity>
  );

  // 渲染横滑列表
  const renderSection = (title: string, data: Movie[]) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatList
        data={data}
        renderItem={renderMovieCard}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* 顶部 Logo */}
      <View style={styles.header}>
        <Text style={styles.logo}>StellaFlix</Text>
      </View>

      {/* 推荐区 */}
      {movies.length > 0 && (
        <TouchableOpacity
          style={styles.featuredContainer}
          onPress={() => navigation.navigate('Player', { id: movies[0].id, title: movies[0].title })}
        >
          <Image
            source={{ uri: movies[0].backdrop || movies[0].poster }}
            style={styles.featuredImage}
            resizeMode="cover"
          />
          <View style={styles.featuredOverlay}>
            <Text style={styles.featuredTitle}>{movies[0].title}</Text>
            <View style={styles.featuredButtons}>
              <TouchableOpacity style={styles.playButton}>
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.playButtonText}>播放</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.infoButton}>
                <Ionicons name="information-circle" size={20} color="#fff" />
                <Text style={styles.infoButtonText}>详情</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* 电影列表 */}
      {renderSection('热门电影', movies)}

      {/* 纪录片列表 */}
      {renderSection('纪录片', documentaries)}

      <View style={styles.bottomSpacer} />
    </ScrollView>
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
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  logo: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 1,
  },

  // 推荐区
  featuredContainer: {
    width: SCREEN_WIDTH - SPACING.lg * 2,
    marginHorizontal: SPACING.lg,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
  },
  featuredImage: {
    width: '100%',
    height: 200,
  },
  featuredOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.lg,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  featuredTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  featuredButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    gap: SPACING.xs,
  },
  playButtonText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    gap: SPACING.xs,
  },
  infoButtonText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
  },

  // 横滑列表
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    color: COLORS.text,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },

  // 视频卡片
  card: {
    width: POSTER_WIDTH,
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
  },
  cardOverlay: {
    position: 'absolute',
    top: POSTER_HEIGHT / 2 - 16,
    left: POSTER_WIDTH / 2 - 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.8,
  },
  cardTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  rating: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
  },

  bottomSpacer: {
    height: 100,
  },
});
