/**
 * 刮削器配置 API
 *
 * GET /api/scraper/config - 获取刮削器配置状态
 * POST /api/scraper/config - 更新刮削器配置（需要管理员权限）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupportedScrapers } from '@/lib/scraper';

// TMDB API Key（从环境变量读取）
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

/**
 * 获取刮削器配置状态
 */
export async function GET() {
  try {
    const supportedScrapers = getSupportedScrapers();

    return NextResponse.json({
      success: true,
      data: {
        scrapers: supportedScrapers,
        config: {
          tmdb: {
            configured: !!TMDB_API_KEY,
            api_key_set: TMDB_API_KEY ? '***' + TMDB_API_KEY.slice(-4) : null,
          },
        },
        environment_variable: 'TMDB_API_KEY',
        setup_guide: 'https://developer.themoviedb.org/docs/getting-started',
      },
    });
  } catch (error) {
    console.error('Scraper config error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取配置失败',
      },
      { status: 500 }
    );
  }
}
