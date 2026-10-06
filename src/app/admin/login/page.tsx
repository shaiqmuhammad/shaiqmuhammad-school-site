"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  isAdminAuthenticated,
  isAdminConfigured,
  setAdminAuthenticated,
  verifyAdminPassword,
} from "@/lib/adminAuth";
import { serverLogin } from "@/lib/adminServer";
import { clearLegacyGithubToken } from "@/lib/githubPublish";
import { useLogoUrl } from "@/components/SiteBrand";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";

export default function AdminLoginPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const logoUrl = useLogoUrl();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    clearLegacyGithubToken();
    setConfigured(isAdminConfigured());
    if (isAdminAuthenticated()) {
      router.replace("/admin");
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
    const ok = await verifyAdminPassword(password).catch(() => false);
    if (ok) {
      // Also open a 30-day publishing session on the server (no GitHub key on this device).
      const server = await serverLogin(password).catch(() => ({ ok: false as const, reason: "unreachable" as const }));
      setChecking(false);
      if (!server.ok && server.reason === "too_many_attempts") {
        setError(lang === "ar" ? "محاولات كثيرة. حاول مرة أخرى بعد قليل." : "Too many attempts. Please try again in a few minutes.");
        return;
      }
      setAdminAuthenticated(true);
      router.replace("/admin");
    } else {
      setChecking(false);
      setError(t("adminLogin.incorrect"));
    }
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
        <p className="mt-3 text-lg font-extrabold text-heading">Shaiq Muhammad — Admin</p>
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
