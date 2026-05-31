"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Mail,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import type { AuthUser } from "@/shared/types/auth";

type AuthMode = "login" | "register" | "reset";
type AuthStep = "start" | "verify";

type AuthApiResponse = {
  ok?: boolean;
  user?: AuthUser | null;
  message?: string;
  error?: string;
};

const STATUS_PILLS = [
  { label: "ZJU Email", icon: Mail },
  { label: "Verified Access", icon: CheckCircle2 },
];

export function LoginScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [step, setStep] = useState<AuthStep>("start");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isCodeMode = mode !== "login";
  const title = mode === "login" ? "浙大邮箱登录" : mode === "register" ? "浙大邮箱注册" : "重置密码";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        const data = await postAuth("/api/auth/login", { email, password });
        if (data.user) {
          auth.setAuthenticatedUser(data.user);
        }
        return;
      }

      if (step === "start") {
        const path = mode === "register" ? "/api/auth/register/start" : "/api/auth/password-reset/start";
        const data = await postAuth(path, { email });
        setNotice(data.message || "验证码已发送，请查看浙大邮箱。");
        setStep("verify");
        return;
      }

      const path = mode === "register" ? "/api/auth/register/verify" : "/api/auth/password-reset/confirm";
      const data = await postAuth(path, {
        email,
        password,
        code,
        ...(mode === "register" ? { name } : {}),
      });
      if (data.user) {
        auth.setAuthenticatedUser(data.user);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "操作失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setStep("start");
    setCode("");
    setNotice("");
    setError("");
  }

  return (
    <main className="relative h-screen overflow-x-hidden overflow-y-auto bg-[#f6f8f7] text-[var(--foreground)]">
      <BackgroundGlow />

      <div className="relative mx-auto grid min-h-full w-full max-w-[1500px] grid-cols-1 gap-5 px-4 py-4 md:px-6 md:py-6 lg:grid-cols-12">
        <section className="motion-safe:animate-[pageRise_.62s_ease-out_both] flex min-h-[620px] flex-col rounded-[28px] border border-[rgba(181,196,190,0.58)] bg-white/84 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.075)] backdrop-blur-xl md:p-8 lg:col-span-5 lg:min-h-[calc(100vh-3rem)] xl:p-10">
          <BrandHeader />

          <div className="flex flex-1 flex-col justify-center py-8 md:py-10">
            <HeroCopy />
            <h2 className="mt-8 text-lg font-semibold text-slate-950">{title}</h2>

            <form onSubmit={submit} className="mt-4 grid gap-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600" htmlFor="auth-email">
                  浙大邮箱
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@zju.edu.cn"
                  className="w-full rounded-2xl border border-[#d3e0dd] bg-white/84 px-4 py-3 text-sm outline-none transition focus:border-[#006c63] focus:ring-4 focus:ring-[#006c63]/10"
                  required
                />
              </div>

              {mode === "register" && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600" htmlFor="auth-name">
                    昵称
                  </label>
                  <input
                    id="auth-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="用于工作台显示"
                    className="w-full rounded-2xl border border-[#d3e0dd] bg-white/84 px-4 py-3 text-sm outline-none transition focus:border-[#006c63] focus:ring-4 focus:ring-[#006c63]/10"
                  />
                </div>
              )}

              {(mode === "login" || step === "verify") && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600" htmlFor="auth-password">
                    {mode === "reset" ? "新密码" : "密码"}
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="至少 8 位"
                    minLength={mode === "login" ? 1 : 8}
                    className="w-full rounded-2xl border border-[#d3e0dd] bg-white/84 px-4 py-3 text-sm outline-none transition focus:border-[#006c63] focus:ring-4 focus:ring-[#006c63]/10"
                    required
                  />
                </div>
              )}

              {isCodeMode && step === "verify" && (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600" htmlFor="auth-code">
                    邮箱验证码
                  </label>
                  <input
                    id="auth-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="6 位验证码"
                    inputMode="numeric"
                    className="w-full rounded-2xl border border-[#d3e0dd] bg-white/84 px-4 py-3 text-sm outline-none transition focus:border-[#006c63] focus:ring-4 focus:ring-[#006c63]/10"
                    required
                  />
                </div>
              )}

              {notice && <p className="rounded-2xl bg-[#edf8f5] px-4 py-3 text-sm text-[#006c63]">{notice}</p>}
              {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

              <Button type="submit" disabled={submitting} className="mt-1 h-12 justify-center rounded-2xl">
                {submitting ? "处理中..." : mode === "login" ? "登录" : step === "start" ? "发送验证码" : title}
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </form>

            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              <TextAction active={mode === "login"} onClick={() => switchMode("login")}>
                登录
              </TextAction>
              <TextAction active={mode === "register"} onClick={() => switchMode("register")}>
                注册
              </TextAction>
              <TextAction active={mode === "reset"} onClick={() => switchMode("reset")}>
                忘记密码
              </TextAction>
            </div>
          </div>
        </section>

        <section className="motion-safe:animate-[pageRise_.72s_ease-out_both] lg:col-span-7" style={{ animationDelay: "90ms" }}>
          <KnowledgeVisual />
        </section>
      </div>
    </main>
  );
}

async function postAuth(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as AuthApiResponse;
  if (!response.ok) {
    throw new Error(data.error || data.message || "操作失败。");
  }
  return data;
}

function TextAction({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 font-medium transition",
        active
          ? "border-[#006c63] bg-[#f1faf8] text-[#006c63]"
          : "border-[#d8e7e3] bg-white/70 text-slate-500 hover:text-[#006c63]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function BrandHeader() {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#cfe3de] bg-[#f3fbf9] text-[#006c63] shadow-[0_12px_30px_rgba(0,79,73,0.10)]">
          <BookOpenText size={23} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">xyfRAG</h1>
          <p className="mt-0.5 text-sm text-slate-500">可信知识问答平台</p>
        </div>
      </div>
      <span className="hidden rounded-full border border-[#d8e7e3] bg-white/70 px-3 py-1 text-xs font-medium text-[#006c63] shadow-sm backdrop-blur sm:inline-flex">
        ZJU Email
      </span>
    </div>
  );
}

function HeroCopy() {
  return (
    <div className="max-w-[560px]">
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d7e8e4] bg-[#f1faf8] px-3 py-1.5 text-xs font-medium text-[#006c63] shadow-sm">
        <Sparkles size={13} aria-hidden="true" />
        Verified Knowledge Access
      </p>
      <h2 className="text-[clamp(2.2rem,5vw,3.35rem)] font-semibold leading-[1.06] text-slate-950">
        浙大邮箱进入
        <span className="block text-[#006c63]">每次回答都有依据</span>
      </h2>
      <p className="mt-5 max-w-[520px] text-base leading-7 text-slate-600">
        使用 @zju.edu.cn 邮箱注册登录，进入可信问答、引用追溯与知识库管理空间。
      </p>
    </div>
  );
}

function KnowledgeVisual() {
  return (
    <div className="relative min-h-[560px] overflow-hidden rounded-[28px] border border-[rgba(181,196,190,0.56)] bg-white/62 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.075)] backdrop-blur-xl md:p-4 lg:min-h-[calc(100vh-3rem)]">
      <div className="motion-safe:animate-[visualFloat_7s_ease-in-out_infinite] relative h-full min-h-[532px] overflow-hidden rounded-[24px] border border-white/70 bg-[#edf4f2] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] lg:min-h-[calc(100vh-5rem)]">
        <Image
          src="/images/knowledge-intelligence-login.png"
          alt="知识智能检索与引用网络"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 58vw"
          className="object-cover object-center saturate-[0.88]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,252,250,0.18)_0%,rgba(248,252,250,0.04)_42%,rgba(248,252,250,0.28)_100%)]" />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2 md:left-5 md:top-5">
          {STATUS_PILLS.map((pill) => (
            <VisualPill key={pill.label} label={pill.label} icon={pill.icon} />
          ))}
        </div>

        <div className="absolute bottom-4 left-4 right-4 max-w-[380px] rounded-2xl border border-white/74 bg-white/58 px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.10)] backdrop-blur-xl md:bottom-5 md:left-5">
          <p className="text-sm font-semibold text-slate-950">Trusted RAG Portal</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">浙大邮箱验证 · 可信引用 · 知识治理</p>
        </div>
      </div>
    </div>
  );
}

function VisualPill({ label, icon: Icon }: { label: string; icon: typeof Mail }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#d7e6e2] bg-white/72 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur">
      <Icon size={13} className="text-[#006c63]" aria-hidden="true" />
      {label}
    </span>
  );
}

function BackgroundGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="motion-safe:animate-[glowDrift_9s_ease-in-out_infinite] absolute -left-28 top-[-18%] h-80 w-80 rounded-full bg-[rgba(0,108,99,0.10)] blur-3xl" />
      <div className="motion-safe:animate-[glowDrift_11s_ease-in-out_infinite] absolute right-[-12%] top-[16%] h-96 w-96 rounded-full bg-[rgba(15,148,136,0.10)] blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.92),transparent_42%)]" />
    </div>
  );
}
