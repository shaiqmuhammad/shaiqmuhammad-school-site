"use client";

import Link from "next/link";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useI18n } from "@/lib/i18n";

type Tab = "pages" | "videos" | "quizzes" | "certificate" | "banners" | "teacher" | "forum" | "settings";

type Props = {
  busy: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onDownload: () => void;
  onPublishContent: () => void;
  onPublishAll: () => void;
  onLogout: () => void;
};

export function AdminChrome({ busy, tab, onTab, onDownload, onPublishContent, onPublishAll, onLogout }: Props) {
  const { t } = useI18n();
  const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground";
  const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";
  return (
    <header className="border-b border-card-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Shaiq Muhammad"
            width={96}
            height={96}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-primary/30 bg-card object-cover shadow-md sm:h-24 sm:w-24"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("admin.eyebrow")}</p>
            <h1 className="text-xl font-semibold sm:text-2xl">Shaiq Muhammad — Admin</h1>
            <p className="text-sm text-muted">{t("admin.title")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <button type="button" onClick={onDownload} className={btnGhost}>{t("admin.download")}</button>
          <button type="button" disabled={busy} onClick={onPublishContent} className={btnGhost}>{busy ? "…" : t("admin.publishContent")}</button>
          <button type="button" disabled={busy} onClick={onPublishAll} className={btn}>{busy ? t("admin.publishing") : t("admin.publishAll")}</button>
          <Link href="/" className="rounded-full px-3 py-1.5 text-sm text-primary hover:underline">{t("admin.viewSite")}</Link>
          <button type="button" onClick={onLogout} className="rounded-full px-3 py-1.5 text-sm text-muted">{t("admin.logout")}</button>
        </div>
      </div>
      <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
        {(["pages","videos","quizzes","certificate","banners","teacher","forum","settings"] as Tab[]).map((id) => (
          <button key={id} type="button" onClick={() => onTab(id)} className={`rounded-full px-3 py-1.5 text-sm ${tab===id?"bg-accent-soft font-medium text-primary":"text-muted hover:bg-accent-soft/60"}`}>{t(`admin.tab.${id}`, id)}</button>
        ))}
      </div>
    </header>
  );
}
