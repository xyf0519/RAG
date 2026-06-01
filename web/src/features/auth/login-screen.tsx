"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "@/features/auth/auth-provider";
import { cn } from "@/shared/lib/utils";
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
  { label: "Verified Access", icon: ShieldCheck },
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
  const [showPassword, setShowPassword] = useState(false);

  const title = mode === "login" ? "浙大邮箱登录" : mode === "register" ? "浙大邮箱注册" : "重置密码";
  const buttonLabel = submitting ? "处理中..." : mode === "login" ? "登录" : step === "start" ? "发送验证码" : title;
  const dense = mode !== "login" && step === "verify";

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
        void auth.refreshSession();
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
    setShowPassword(false);
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#f7f9f8] text-[#0f172a]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.98),transparent_36%),radial-gradient(circle_at_82%_88%,rgba(0,108,99,0.10),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-white/80 blur-2xl" />

      <div className="relative mx-auto flex h-screen w-full max-w-[1760px] items-center px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid h-[calc(100svh-2rem)] min-h-0 w-full overflow-hidden rounded-[32px] border border-white/80 bg-white/72 shadow-[0_32px_100px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl sm:rounded-[40px] lg:grid-cols-[minmax(390px,0.78fr)_minmax(560px,1.22fr)]">
          <section
            className={cn(
              "flex min-h-0 flex-col px-6 sm:px-9",
              dense
                ? "py-3 lg:px-[clamp(2rem,3.2vw,3.8rem)] lg:py-4"
                : "py-5 sm:py-7 lg:px-[clamp(2.2rem,3.8vw,4.4rem)] lg:py-[clamp(1rem,2.4vh,2.5rem)]",
            )}
          >
            <BrandHeader compact={dense} />

            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                dense ? "justify-start pt-2" : "justify-center py-[clamp(0.4rem,1.4vh,1.4rem)]",
              )}
            >
              <div className="max-w-[620px]">
                <div
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border border-[#dce9e6] bg-white/72 font-semibold text-[#16736d] shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl",
                    dense ? "mb-2 h-8 px-3 text-xs" : "mb-[clamp(0.5rem,1.1vh,0.9rem)] h-9 px-3.5 text-sm",
                  )}
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  浙大邮箱验证
                </div>

                <h2 className={cn(
                  "font-semibold leading-[1.02] tracking-normal text-[#060b1a]",
                  dense ? "text-[clamp(1.8rem,2.7vw,2.85rem)]" : "text-[clamp(2.25rem,3.7vw,4.05rem)]",
                )}>
                  {title}
                </h2>
                <p className={cn(
                  "max-w-[580px] text-[clamp(0.95rem,1vw,1.08rem)] leading-7 text-[#58667a]",
                  dense ? "mt-1.5 line-clamp-1 text-sm leading-5" : "mt-[clamp(0.65rem,1.4vh,1rem)]",
                )}>
                  使用 @zju.edu.cn 邮箱登录，进入可信问答与知识库管理空间。
                </p>

                <form
                  onSubmit={submit}
                  className={cn(
                    "max-w-[580px] rounded-[24px] border border-white/80 bg-white/78 shadow-[0_24px_70px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl",
                    dense ? "mt-3 p-4" : "mt-[clamp(1rem,2vh,1.75rem)] p-[clamp(1rem,1.85vw,1.5rem)]",
                  )}
                >
                  <div className={cn("grid", dense ? "gap-2.5" : "gap-[clamp(0.7rem,1.4vh,1rem)]")}>
                    <Field
                      id="auth-email"
                      label="浙大邮箱"
                      icon={Mail}
                      compact={dense}
                      type="email"
                      value={email}
                      onChange={setEmail}
                      placeholder="name@zju.edu.cn"
                      autoComplete="email"
                      required
                    />

                    {mode === "register" && (
                      <Field
                        id="auth-name"
                        label="昵称"
                        icon={BookOpenText}
                        compact={dense}
                        value={name}
                        onChange={setName}
                        placeholder="用于工作台显示"
                        autoComplete="name"
                      />
                    )}

                    {(mode === "login" || step === "verify") && (
                      <Field
                        id="auth-password"
                        label={mode === "reset" ? "新密码" : "密码"}
                        icon={Lock}
                        compact={dense}
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={setPassword}
                        placeholder="请输入密码"
                        minLength={mode === "login" ? 1 : 8}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        action={
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            className="text-[#718196] transition hover:text-[#16736d]"
                            aria-label={showPassword ? "隐藏密码" : "显示密码"}
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        }
                        required
                      />
                    )}

                    {mode !== "login" && step === "verify" && (
                      <Field
                        id="auth-code"
                        label="邮箱验证码"
                        icon={CheckCircle2}
                        compact={dense}
                        value={code}
                        onChange={setCode}
                        placeholder="6 位验证码"
                        inputMode="numeric"
                        required
                      />
                    )}

                    {mode !== "login" && step === "verify" && (
                      <p className="text-xs leading-4 text-[#6b7789]">至少 8 位</p>
                    )}

                    {notice && (
                      <p className={cn(
                        "rounded-[18px] border border-[#cae4df] bg-[#edf8f5] px-4 text-sm font-medium text-[#16736d]",
                        dense ? "py-2" : "py-3",
                      )}>
                        {notice}
                      </p>
                    )}
                    {error && (
                      <p className={cn(
                        "rounded-[18px] border border-red-100 bg-red-50 px-4 text-sm font-medium text-red-700",
                        dense ? "py-2" : "py-3",
                      )}>
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className={cn(
                        "group relative mt-1 flex items-center justify-center overflow-hidden rounded-[17px] bg-[#1b8279] px-6 font-semibold text-white shadow-[0_18px_45px_rgba(22,115,109,0.30),inset_0_1px_0_rgba(255,255,255,0.28)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#15746d] disabled:pointer-events-none disabled:opacity-60",
                        dense ? "h-12 text-base" : "h-[clamp(3rem,5.2vh,3.6rem)] text-lg",
                      )}
                    >
                      <span className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.22),transparent_34%,rgba(255,255,255,0.16)_72%,transparent)] opacity-0 transition duration-500 group-hover:opacity-100" />
                      <span className="relative inline-flex items-center gap-8">
                        {buttonLabel}
                        <ArrowRight size={22} aria-hidden="true" />
                      </span>
                    </button>
                  </div>

                  {!dense && (
                    <>
                      <div className="my-[clamp(0.75rem,1.8vh,1.35rem)] grid grid-cols-[1fr_auto_1fr] items-center gap-5 text-sm text-[#7a8796]">
                        <span className="h-px bg-gradient-to-r from-transparent to-[#dfe7e6]" />
                        <span>或</span>
                        <span className="h-px bg-gradient-to-l from-transparent to-[#dfe7e6]" />
                      </div>

                      <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-[16px] border border-[#dce8e5] bg-white/62">
                        <ModeAction active={mode === "register"} onClick={() => switchMode("register")}>
                          注册
                        </ModeAction>
                        <ModeAction active={mode === "reset"} onClick={() => switchMode("reset")}>
                          忘记密码
                        </ModeAction>
                      </div>
                    </>
                  )}

                  {mode !== "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="mt-3 w-full text-center text-sm font-semibold text-[#16736d] transition hover:text-[#0d5f59]"
                    >
                      返回登录
                    </button>
                  )}
                </form>
              </div>
            </div>
          </section>

          <KnowledgeVisual />
        </div>
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

function Field({
  id,
  label,
  icon: Icon,
  compact = false,
  value,
  onChange,
  action,
  ...inputProps
}: {
  id: string;
  label: string;
  icon: typeof Mail;
  compact?: boolean;
  value: string;
  onChange: (value: string) => void;
  action?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange">) {
  return (
    <div>
      <label className={cn("block font-semibold text-[#111827]", compact ? "mb-1 text-xs" : "mb-2 text-sm")} htmlFor={id}>
        {label}
      </label>
      <div
        className={cn(
          "group flex items-center gap-3 rounded-[14px] border border-[#d8e0df] bg-white/72 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition focus-within:border-[#78aaa5] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(22,115,109,0.09),inset_0_1px_0_rgba(255,255,255,0.95)]",
          compact ? "h-11" : "h-[clamp(3rem,5.6vh,3.5rem)]",
        )}
      >
        <Icon size={18} className="shrink-0 text-[#8793a2] transition group-focus-within:text-[#16736d]" aria-hidden="true" />
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="auth-input min-w-0 flex-1 border-0 bg-transparent text-base font-medium text-[#101827] outline-none placeholder:text-[#9aa4b2]"
          {...inputProps}
        />
        {action}
      </div>
    </div>
  );
}

function ModeAction({
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
        "h-[clamp(3rem,5.6vh,3.5rem)] text-base font-semibold transition",
        active ? "bg-[#eff8f6] text-[#16736d]" : "bg-white/40 text-[#16736d] hover:bg-white/80",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-4 sm:gap-5", compact && "gap-3 sm:gap-4")}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[16px] bg-[#1b8279] text-white shadow-[0_16px_36px_rgba(22,115,109,0.28),inset_0_1px_0_rgba(255,255,255,0.26)] sm:rounded-[18px]",
          compact
            ? "h-[clamp(2.6rem,5vh,3.25rem)] w-[clamp(2.6rem,5vh,3.25rem)]"
            : "h-[clamp(3.25rem,7vh,4rem)] w-[clamp(3.25rem,7vh,4rem)]",
        )}
      >
        <BookOpenText size={compact ? 22 : 26} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h1
          className={cn(
            "truncate font-semibold tracking-normal text-[#090f1f]",
            compact ? "text-[clamp(1.05rem,1.25vw,1.25rem)]" : "text-[clamp(1.25rem,1.6vw,1.5rem)]",
          )}
        >
          xyfRAG
        </h1>
        <p className={cn("mt-1 text-[#667287]", compact ? "text-sm leading-5" : "text-[clamp(0.95rem,1.15vw,1.125rem)] leading-6")}>
          可信知识问答平台
        </p>
      </div>
    </div>
  );
}

function KnowledgeVisual() {
  return (
    <section className="relative hidden min-h-0 overflow-hidden rounded-[32px] border-l border-white/80 bg-[#eef4f3] lg:block">
      <Image
        src="/images/knowledge-intelligence-login.png"
        alt="知识智能检索与引用网络"
        fill
        priority
        sizes="54vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0.03)_48%,rgba(255,255,255,0.18)_100%)]" />
      <div className="absolute inset-0 rounded-[36px] ring-1 ring-inset ring-white/80" />

      <div className="absolute left-16 top-16 flex flex-wrap gap-4">
        {STATUS_PILLS.map((pill) => (
          <VisualPill key={pill.label} label={pill.label} icon={pill.icon} />
        ))}
      </div>

      <div className="absolute bottom-16 left-12 w-[430px] rounded-[18px] border border-white/80 bg-white/72 px-7 py-6 shadow-[0_24px_70px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl">
        <div className="flex items-center gap-5">
          <Building2 size={36} className="shrink-0 text-[#46556a]" aria-hidden="true" />
          <div>
            <p className="text-xl font-semibold text-[#101827]">Trusted RAG Portal</p>
            <p className="mt-1 text-base text-[#5f6f83]">浙大邮箱验证 · 可信引用 · 知识治理</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function VisualPill({ label, icon: Icon }: { label: string; icon: typeof Mail }) {
  return (
    <span className="inline-flex h-12 items-center gap-3 rounded-full border border-white/78 bg-white/70 px-5 text-base font-semibold text-[#536276] shadow-[0_14px_34px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-2xl">
      <Icon size={18} className="text-[#4f7f7b]" aria-hidden="true" />
      {label}
    </span>
  );
}
