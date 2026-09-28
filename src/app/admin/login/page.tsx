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
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";

export default function AdminLoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
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
    setChecking(false);
    if (ok) {
      setAdminAuthenticated(true);
      router.replace("/admin");
    } else {
      setError(t("adminLogin.incorrect"));
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-6 flex items-center justify-end gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("adminLogin.eyebrow")}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("adminLogin.title")}</h1>
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
            className="mt-1.5 w-full rounded-lg border border-card-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
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
  );
}
