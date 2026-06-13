"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { Check, Loader2, Crown, Zap, Star } from "lucide-react";

const plans = [
  {
    name: "基础版",
    price: 9.99,
    period: "月",
    priceId: "price_basic_monthly",
    icon: Star,
    features: ["720p 高清画质", "同时1台设备", "每月10部电影", "基础内容库"],
    popular: false,
  },
  {
    name: "标准版",
    price: 14.99,
    period: "月",
    priceId: "price_standard_monthly",
    icon: Zap,
    features: ["1080p 全高清", "同时2台设备", "无限观看", "完整内容库", "离线下载"],
    popular: true,
  },
  {
    name: "高级版",
    price: 19.99,
    period: "月",
    priceId: "price_premium_monthly",
    icon: Crown,
    features: ["4K 超高清 + HDR", "同时4台设备", "无限观看", "完整内容库", "离线下载", "优先客服", "抢先看新片"],
    popular: false,
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubscribe = async (priceId: string) => {
    if (!user) {
      router.push("/login?redirect=/pricing");
      return;
    }

    setLoading(priceId);
    try {
      const res = await fetch("/api/payment/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      alert("创建支付会话失败，请重试");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            选择您的方案
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            灵活的会员方案，满足不同需求。随时可以升级或取消。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.priceId}
                className={`relative rounded-2xl border ${
                  plan.popular
                    ? "border-red-600 bg-gray-900/80"
                    : "border-gray-800 bg-gray-900/40"
                } p-8 flex flex-col`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-red-600 text-white text-sm font-semibold px-4 py-1 rounded-full">
                      最受欢迎
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                </div>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  <span className="text-gray-400">/{plan.period}</span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-gray-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.priceId)}
                  disabled={loading === plan.priceId}
                  className={`w-full py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
                    plan.popular
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-gray-800 hover:bg-gray-700 text-white"
                  } disabled:opacity-50`}
                >
                  {loading === plan.priceId ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : null}
                  {loading === plan.priceId ? "处理中..." : "立即订阅"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-gray-500 text-sm mt-8">
          所有方案均可随时取消。付款由 Stripe 安全处理。
        </p>
      </div>
    </div>
  );
}
