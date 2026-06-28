/**
 * 播放器页 - StellaFlix Mobile
 * 视频播放和详情展示
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE } from '../constants/theme';
import { getMovieDetail, Movie } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  route: {
    params: {
      id: string;
      title: string;
    };
  };
  navigation: any;
}

export default function PlayerScreen({ route, navigation }: Props) {
  const { id, title } = route.params;
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovieDetail();
  }, [id]);

  const loadMovieDetail = async () => {
    try {
      setLoading(true);
      const data = await getMovieDetail(id);
      setMovie(data);
    } catch (error) {
      console.error('加载详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!movie) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color={COLORS.textMuted} />
        <Text style={styles.errorText}>无法加载视频详情</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadMovieDetail}>
          <Text style={styles.retryButtonText}>重试</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* 视频播放区域 */}
      <View style={styles.playerContainer}>
        <Image
          source={{ uri: movie.backdrop || movie.poster }}
          style={styles.playerPlaceholder}
          resizeMode="cover"
        />
        <View style={styles.playerOverlay}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.playButtonContainer}>
            <TouchableOpacity style={styles.playButton}>
              <Ionicons name="play" size={48} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 视频信息 */}
      <ScrollView style={styles.infoContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{movie.title}</Text>

        {/* 元信息 */}
        <View style={styles.metaRow}>
          {movie.rating > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={16} color={COLORS.warning} />
              <Text style={styles.metaText}>{movie.rating.toFixed(1)}</Text>
            </View>
          )}
          {movie.release_year > 0 && (
            <View style={styles.metaItem}>
              <Text style={styles.metaText}>{movie.release_year}</Text>
            </View>
          )}
          {movie.duration > 0 && (
            <View style={styles.metaItem}>
              <Text style={styles.metaText}>{movie.duration}分钟</Text>
            </View>
          )}
        </View>

        {/* 分类标签 */}
        {movie.genre && movie.genre.length > 0 && (
          <View style={styles.genreRow}>
            {movie.genre.map((g, index) => (
              <View key={index} style={styles.genreTag}>
                <Text style={styles.genreTagText}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 简介 */}
        {movie.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>简介</Text>
            <Text style={styles.description}>{movie.description}</Text>
          </View>
        ) : null}

        {/* 播放按钮 */}
        <TouchableOpacity style={styles.watchButton}>
          <Ionicons name="play-circle" size={24} color="#fff" />
          <Text style={styles.watchButtonText}>立即播放</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.lg,
  },
  retryButton: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
  },

  // 播放器
  playerContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 9 / 16,
    backgroundColor: COLORS.surface,
  },
  playerPlaceholder: {
    width: '100%',
    height: '100%',
  },
  playerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'space-between',
  },
  backButton: {
    marginTop: SPACING.xl,
    marginLeft: SPACING.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.9,
  },

  // 信息区
  infoContainer: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },

  // 元信息
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  metaText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },

  // 分类
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  genreTag: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 16,
  },
  genreTagText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },

  // 简介
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  description: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },

  // 播放按钮
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.xl,
  },
  watchButtonText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: '#fff',
  },

  bottomSpacer: {
    height: 100,
  },
});
