/**
 * useAuth Hook
 *
 * 用途: 提供 Supabase 认证功能的 React Hook
 * 依赖:
 *   - @supabase/supabase-js: 用户类型
 *   - lib/supabase/client: Supabase 客户端
 * 架构: 封装认证状态和操作方法
 *
 * 功能:
 * - 获取当前用户状态
 * - 监听认证状态变化
 * - 登录/注册/登出操作
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * 认证 Hook 返回类型
 */
interface UseAuthReturn {
  /** 当前用户（未登录时为 null） */
  user: User | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 密码登录 */
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** 注册 */
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  /** 登出 */
  signOut: () => Promise<void>;
}

/**
 * 认证 Hook
 *
 * 做什么: 提供用户认证状态和操作方法
 * 参数: 无
 * 返回值: UseAuthReturn - 认证状态和操作方法
 */
export function useAuth(): UseAuthReturn {
  /** 当前用户 */
  const [user, setUser] = useState<User | null>(null);

  /** 加载状态 */
  const [loading, setLoading] = useState(true);

  /** Supabase 客户端 */
  const supabase = createClient();

  /**
   * 初始化用户状态并监听变化
   */
  useEffect(() => {
    /**
     * 获取当前用户
     */
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();

    /**
     * 监听认证状态变化
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  /**
   * 密码登录
   *
   * 做什么: 使用邮箱和密码登录
   * 参数:
   *   - email: 邮箱地址
   *   - password: 密码
   * 返回值: { error: Error | null } - 错误信息
   */
  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    [supabase.auth]
  );

  /**
   * 注册
   *
   * 做什么: 使用邮箱、密码和姓名注册新用户
   * 参数:
   *   - email: 邮箱地址
   *   - password: 密码
   *   - name: 用户姓名
   * 返回值: { error: Error | null } - 错误信息
   */
  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      return { error };
    },
    [supabase.auth]
  );

  /**
   * 登出
   *
   * 做什么: 登出当前用户并清除状态
   */
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, [supabase.auth]);

  return { user, loading, signIn, signUp, signOut };
}
