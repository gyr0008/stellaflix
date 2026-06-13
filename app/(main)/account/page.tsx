"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/Header";
import { User, Crown, Mail, Calendar, Loader2, CreditCard, LogOut } from "lucide-react";

interface Profile {
  full_name: string;
  subscription_status: string;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
  created_at: string;
}

export default function AccountPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, subscription_status, subscription_plan, subscription_expires_at, created_at")
        .eq("id", user.id)
        .single();
      setProfile(data);
      setLoading(false);
    };

    loadProfile();
  }, [user, supabase]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const statusLabels: Record<string, { label: string; color: string }> = {
    free: { label: "免费版", color: "text-gray-400 bg-gray-800" },
    active: { label: "会员中", color: "text-green-400 bg-green-500/20" },
    cancelled: { label: "已取消", color: "text-yellow-400 bg-yellow-500/20" },
    expired: { label: "已过期", color: "text-red-400 bg-red-500/20" },
  };

  const status = statusLabels[profile?.subscription_status || "free"];

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <h1 className="text-3xl font-bold text-white mb-8">个人中心</h1>

        {/* Profile Card */}
        <div className="bg-gray-900/60 backdrop-blur rounded-2xl border border-gray-800 p-8 mb-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {profile?.full_name || "用户"}
              </h2>
              <div className="flex items-center gap-2 text-gray-400 text-sm mt-1">
                <Mail className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-gray-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Crown className="w-4 h-4" />
                <span>会员状态</span>
              </div>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
                {status.label}
              </span>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <CreditCard className="w-4 h-4" />
                <span>当前方案</span>
              </div>
              <p className="text-white font-medium">
                {profile?.subscription_plan || "免费版"}
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <Calendar className="w-4 h-4" />
                <span>注册时间</span>
              </div>
              <p className="text-white font-medium">
                {profile?.created_at
                  ? new Date(profile.created_at).toLocaleDateString("zh-CN")
                  : "未知"}
              </p>
            </div>

            {profile?.subscription_expires_at && (
              <div className="bg-gray-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <Calendar className="w-4 h-4" />
                  <span>到期时间</span>
                </div>
                <p className="text-white font-medium">
                  {new Date(profile.subscription_expires_at).toLocaleDateString("zh-CN")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <a
            href="/pricing"
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            升级会员
          </a>
          <button
            onClick={signOut}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
