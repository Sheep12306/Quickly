import React, { useState } from "react";
import { motion } from "motion/react";
import { Check, Eye, EyeOff, Loader2, LockKeyhole, Mail, UserRound } from "lucide-react";
import type { CloudUser } from "../types";
import { useI18n } from "../i18n";

interface AuthPageProps {
  onAuthed: (user: CloudUser) => void | Promise<void>;
}

type AuthMode = "login" | "register";

export default function AuthPage({ onAuthed }: AuthPageProps) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isEnglish = locale === "en-US";

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError(t.auth.emailRequired);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.auth.emailInvalid);
      return;
    }
    if (!password) {
      setError(t.auth.passwordRequired);
      return;
    }
    if (password.length < 6) {
      setError(t.auth.passwordMin);
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError(t.auth.passwordMismatch);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(mode === "register" ? { name: name.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) {
        throw new Error(data.error || (isEnglish ? "Authentication failed" : "登录失败"));
      }
      await onAuthed(data.user as CloudUser);
    } catch (submitError: any) {
      setError(submitError?.message || (isEnglish ? "Network error" : "网络错误"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0f0c] text-[#e3e3de] flex items-center justify-center p-6 font-mono" id="quickly-auth-page">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex items-center gap-2 mb-8 justify-center">
          <svg className="w-8 h-8 text-[#b8f600]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10" />
            <path d="M6 10h10" />
            <path d="M11 14h5" />
            <path d="m15 18 3 3 5-5" />
          </svg>
          <span className="font-bold text-2xl tracking-tight text-[#e3e3de]">Quickly</span>
        </div>

        <div className="bg-[#171915] border border-white/8 rounded-xl p-7 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#e3e3de]">
              {mode === "login" ? t.auth.welcomeBack : t.auth.startJourney}
            </h1>
            <p className="text-[11px] text-[#c3caac]/60 mt-1.5 leading-relaxed">
              {mode === "login" ? t.auth.loginSubtitle : t.auth.registerSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 bg-[#111310] border border-white/5 rounded p-0.5 mb-6">
            <button
              onClick={() => switchMode("login")}
              className={`py-2 text-[11px] font-bold rounded transition-colors ${
                mode === "login" ? "bg-[#b8f600] text-[#141f00]" : "text-[#c3caac] hover:text-white"
              }`}
            >
              {t.auth.login}
            </button>
            <button
              onClick={() => switchMode("register")}
              className={`py-2 text-[11px] font-bold rounded transition-colors ${
                mode === "register" ? "bg-[#b8f600] text-[#141f00]" : "text-[#c3caac] hover:text-white"
              }`}
            >
              {t.auth.registerNow}
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1.5">
                  {t.auth.username}
                </span>
                <div className="relative">
                  <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t.auth.enterUsername}
                    autoComplete="name"
                    className="w-full bg-[#111310] border border-white/8 rounded pl-10 pr-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600]/60 transition-colors"
                  />
                </div>
              </label>
            )}

            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1.5">
                {t.auth.email}
              </span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={isEnglish ? "you@example.com" : "you@example.com"}
                  autoComplete="email"
                  className="w-full bg-[#111310] border border-white/8 rounded pl-10 pr-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600]/60 transition-colors"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1.5">
                {t.auth.password}
              </span>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t.auth.enterPassword}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full bg-[#111310] border border-white/8 rounded pl-10 pr-10 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600]/60 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            {mode === "register" && (
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1.5">
                  {t.auth.confirmPassword}
                </span>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder={t.auth.enterAgain}
                    autoComplete="new-password"
                    className="w-full bg-[#111310] border border-white/8 rounded pl-10 pr-4 py-2.5 text-xs text-[#e3e3de] placeholder-white/20 focus:outline-none focus:border-[#b8f600]/60 transition-colors"
                  />
                </div>
              </label>
            )}

            {error && (
              <div className="text-[11px] text-rose-400 bg-rose-500/8 border border-rose-500/15 rounded px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#b8f600] hover:bg-[#a1d800] text-[#141f00] py-2.5 rounded text-xs font-bold transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {loading
                ? (isEnglish ? "Please wait..." : "请稍候...")
                : mode === "login"
                  ? t.auth.login
                  : t.auth.createAccount}
            </button>
          </form>

          <p className="text-[10px] text-[#c3caac]/45 leading-relaxed mt-5 text-center">
            {isEnglish
              ? "Notes and materials are stored in your IMA account. Quickly only stores small metadata such as goals and review history."
              : "笔记和资料存放在你的 IMA 账号中；Quickly 只保存学习目标、复习记录等少量元数据。"}
          </p>
        </div>

        <p className="text-center text-[10px] text-white/20 mt-6">
          {t.auth.footerLine1} · {t.auth.footerLine2}
        </p>
      </motion.div>
    </div>
  );
}
