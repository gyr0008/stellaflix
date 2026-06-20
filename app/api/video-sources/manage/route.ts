/**
 * 视频源管理 API
 *
 * GET    - 获取视频源列表
 * POST   - 创建视频源
 * PUT    - 更新视频源
 * DELETE - 删除视频源
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createParser, getSupportedTypes } from '@/lib/video-sources';
import type { VideoSourceConfig } from '@/lib/video-sources';

/**
 * 获取视频源列表
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 检查用户权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '无管理权限' }, { status: 403 });
    }

    // 获取视频源列表
    const { data, error } = await supabase
      .from('video_source_configs')
      .select('*')
      .order('priority', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      supported_types: getSupportedTypes(),
    });
  } catch (error) {
    console.error('Get video sources error:', error);
    return NextResponse.json(
      { success: false, error: '获取视频源列表失败' },
      { status: 500 }
    );
  }
}

/**
 * 创建视频源
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 检查用户权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '无管理权限' }, { status: 403 });
    }

    // 解析请求体
    const body = await request.json();
    const { name, code, type, base_url, search_path, detail_path, categories, priority } = body;

    // 验证必填字段
    if (!name || !code || !type || !base_url) {
      return NextResponse.json(
        { error: '缺少必填字段：name, code, type, base_url' },
        { status: 400 }
      );
    }

    // 验证类型
    if (!getSupportedTypes().includes(type)) {
      return NextResponse.json(
        { error: `不支持的类型: ${type}，支持的类型: ${getSupportedTypes().join(', ')}` },
        { status: 400 }
      );
    }

    // 检查 code 唯一性
    const { data: existing } = await supabase
      .from('video_source_configs')
      .select('id')
      .eq('code', code)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: `视频源代码 "${code}" 已存在` },
        { status: 400 }
      );
    }

    // 创建视频源
    const { data, error } = await supabase
      .from('video_source_configs')
      .insert({
        name,
        code,
        type,
        base_url,
        search_path,
        detail_path,
        categories: categories || ['movie', 'tv'],
        priority: priority || 0,
        enabled: true,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
      message: '视频源创建成功',
    }, { status: 201 });
  } catch (error) {
    console.error('Create video source error:', error);
    return NextResponse.json(
      { success: false, error: '创建视频源失败' },
      { status: 500 }
    );
  }
}

/**
 * 更新视频源
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 检查用户权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '无管理权限' }, { status: 403 });
    }

    // 解析请求体
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少 id 字段' }, { status: 400 });
    }

    // 更新视频源
    const { data, error } = await supabase
      .from('video_source_configs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data,
      message: '视频源更新成功',
    });
  } catch (error) {
    console.error('Update video source error:', error);
    return NextResponse.json(
      { success: false, error: '更新视频源失败' },
      { status: 500 }
    );
  }
}

/**
 * 删除视频源
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 检查用户权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '无管理权限' }, { status: 403 });
    }

    // 解析请求体
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: '缺少 id 字段' }, { status: 400 });
    }

    // 删除视频源
    const { error } = await supabase
      .from('video_source_configs')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: '视频源已删除',
    });
  } catch (error) {
    console.error('Delete video source error:', error);
    return NextResponse.json(
      { success: false, error: '删除视频源失败' },
      { status: 500 }
    );
  }
}
