"use client";

import Image from "next/image";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "@/features/auth/auth-provider";
import type { UserRole } from "@/shared/types/auth";

const LOGIN_OPTIONS: Array<{
  role: UserRole;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    role: "admin",
    title: "管理员入口",
    description: "管理知识库、配置检索策略、查看质量表现。",
    icon: ShieldCheck,
  },
  {
    role: "user",
    title: "用户入口",
    description: "使用可信问答、查看引用来源、延续历史会话。",
    icon: UserRound,
  },
];

const STATUS_PILLS: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Secure Access", icon: ShieldCheck },
  { label: "Citation Ready", icon: CheckCircle2 },
];

export function LoginScreen() {
  const auth = useAuth();

  return (
    <main className="relative h-screen overflow-x-hidden overflow-y-auto bg-[#f6f8f7] text-[var(--foreground)]">
      <BackgroundGlow />

      <div className="relative mx-auto grid min-h-full w-full max-w-[1500px] grid-cols-1 gap-5 px-4 py-4 md:px-6 md:py-6 lg:grid-cols-12">
        <section className="motion-safe:animate-[pageRise_.62s_ease-out_both] flex min-h-[620px] flex-col rounded-[28px] border border-[rgba(181,196,190,0.58)] bg-white/84 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.075)] backdrop-blur-xl md:p-8 lg:col-span-5 lg:min-h-[calc(100vh-3rem)] xl:p-10">
          <BrandHeader />

          <div className="flex flex-1 flex-col justify-center py-9 md:py-12">
            <HeroCopy />

            <div className="mt-10 grid gap-3.5">
              {LOGIN_OPTIONS.map((option) => (
                <PortalCard key={option.role} option={option} onSelect={() => auth.signIn(option.role)} />
              ))}
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
        Trusted RAG
      </span>
    </div>
  );
}

function HeroCopy() {
  return (
    <div className="max-w-[560px]">
      <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d7e8e4] bg-[#f1faf8] px-3 py-1.5 text-xs font-medium text-[#006c63] shadow-sm">
        <Sparkles size={13} aria-hidden="true" />
        Enterprise Knowledge
      </p>
      <h2 className="text-[clamp(2.35rem,5vw,3.5rem)] font-semibold leading-[1.06] text-slate-950">
        可信知识入口
        <span className="block text-[#006c63]">每次回答都有依据</span>
      </h2>
      <p className="mt-5 max-w-[520px] text-base leading-7 text-slate-600">
        面向组织的 RAG 工作台。安全进入知识问答、引用追溯与知识库管理空间。
      </p>
    </div>
  );
}

function PortalCard({
  option,
  onSelect,
}: {
  option: (typeof LOGIN_OPTIONS)[number];
  onSelect: () => void;
}) {
  const Icon = option.icon;
  const isAdmin = option.role === "admin";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "group flex w-full items-center justify-between gap-4 rounded-2xl border bg-white/82 p-4 text-left shadow-[0_12px_34px_rgba(15,23,42,0.06)] backdrop-blur transition-all duration-500 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(15,23,42,0.10)]",
        isAdmin
          ? "border-[#d3e0dd] hover:border-[#004f49] hover:bg-white"
          : "border-[#d3e0dd] hover:border-[#0c9288] hover:bg-[#f7fffd]",
      ].join(" ")}
    >
      <span className="flex min-w-0 items-center gap-4">
        <span
          className={[
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-white text-[#006c63] shadow-sm transition-all duration-500 ease-out",
            isAdmin ? "border-[#d3e0dd] group-hover:border-[#004f49]" : "border-[#d3e0dd] group-hover:border-[#0c9288]",
          ].join(" ")}
        >
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-semibold text-slate-950">{option.title}</span>
          <span className="mt-1.5 block text-sm leading-5 text-slate-500">{option.description}</span>
        </span>
      </span>
      <ArrowRight
        size={18}
        className={[
          "shrink-0 text-slate-400 transition-all duration-500 ease-out group-hover:translate-x-1.5",
          isAdmin ? "group-hover:text-[#004f49]" : "group-hover:text-[#0c9288]",
        ].join(" ")}
        aria-hidden="true"
      />
    </button>
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
            <FeaturePill key={pill.label} label={pill.label} icon={pill.icon} />
          ))}
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 md:bottom-5 md:left-5 md:right-5">
          <div className="max-w-[360px] rounded-2xl border border-white/74 bg-white/58 px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.10)] backdrop-blur-xl">
            <p className="text-sm font-semibold text-slate-950">Trusted RAG Portal</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">安全访问 · 可信引用 · 知识治理</p>
          </div>
          <span className="hidden rounded-full border border-white/72 bg-white/60 px-3 py-1.5 text-xs font-medium text-[#006c63] shadow-sm backdrop-blur-xl sm:inline-flex">
            Online
          </span>
        </div>
      </div>
    </div>
  );
}

function FeaturePill({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
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
