"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  isAdminAuthenticated,
  isAdminConfigured,
  setAdminAuthenticated,
} from "@/lib/adminAuth";
import { getServerSession, serverLogin } from "@/lib/adminServer";
import { clearLegacyGithubToken } from "@/lib/githubPublish";
import { useLogoUrl } from "@/components/SiteBrand";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";
import { SiteNameText } from "@/components/SiteIdentity";

/** Same-site page to return to after signing in (?next=/lms/students), else /admin. */
function nextPath(): string {
  const n = new URLSearchParams(window.location.search).get("next") || "";
  return /^\/(?!\/)[\w\-./?=&%]*$/.test(n) ? n : "/admin";
}

export default function AdminLoginPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const logoUrl = useLogoUrl();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [checking, setChecking] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    clearLegacyGithubToken();
    setConfigured(isAdminConfigured());
    // Only skip the form when the server session is valid too (older sessions may lack it → LMS pages need it).
    if (isAdminAuthenticated() && getServerSession()) {
      router.replace(nextPath());
    }
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!configured) {
      setError(t("adminLogin.notConfigured"));
      return;
    }
    setChecking(true);
    // The password is checked only by the school server (nothing about it is in this page's code).
    const server = await serverLogin(password, needCode ? code : "").catch(() => ({ ok: false as const, reason: "unreachable" as const }));
    setChecking(false);
    if (server.ok) {
      setAdminAuthenticated(true);
      router.replace(nextPath());
      return;
    }
    const ar = lang === "ar";
    if (server.reason === "code_required") {
      setNeedCode(true);
      return;
    }
    if (server.reason === "wrong_code") setError(ar ? "الرمز غير صحيح أو مستخدم من قبل. جرّب الرمز الجديد من التطبيق." : "That code is wrong or was already used. Try the newest code from your authenticator app.");
    else if (server.reason === "too_many_attempts") {
      const mins = Math.max(1, Math.ceil((("retryAfter" in server && server.retryAfter) || 60) / 60));
      setError(ar ? `محاولات كثيرة. حاول مرة أخرى بعد ${mins} دقيقة.` : `Too many attempts. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
    } else if (server.reason === "unreachable") setError(ar ? "تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى." : "Couldn't reach the server. Check your connection and try again.");
    else if (server.reason === "error") setError(ar ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again.");
    else setError(t("adminLogin.incorrect"));
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="glass glass-emph rounded-[20px] px-6 py-8 sm:px-8">
      <div className="mb-2 flex items-center justify-end gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="mb-6 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          width={104}
          height={104}
          data-testid="login-logo"
          className="h-26 w-26 rounded-full border-4 border-sun bg-white object-cover shadow-[0_10px_30px_-10px_rgba(23,52,79,0.45)]"
        />
        <p className="mt-3 text-lg font-extrabold text-heading"><SiteNameText /> — Admin</p>
      </div>
      <p className="eyebrow">{t("adminLogin.eyebrow")}</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{t("adminLogin.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("adminLogin.desc")}</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            {t("adminLogin.password")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40"
            required
          />
        </div>
        {needCode && (
          <div data-testid="login-code-step">
            <label htmlFor="code" className="block text-sm font-medium">
              {lang === "ar" ? "رمز التحقق (6 أرقام) أو رمز احتياطي" : "6-digit code from your authenticator app (or a backup code)"}
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40"
              data-testid="login-code"
              required
            />
          </div>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={checking}
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {checking ? t("adminLogin.checking") : t("adminLogin.continue")}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/" className="text-primary hover:underline">
          ← {t("adminLogin.back")}
        </Link>
      </p>
      </div>
    </div>
  );
}
