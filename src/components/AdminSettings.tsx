"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GITHUB_BRANCH, GITHUB_REPO } from "@/lib/content";
import { setAdminAuthenticated } from "@/lib/adminAuth";
import { getServerSession, serverReachable } from "@/lib/adminServer";
import { clearStoredGithubToken, downloadJson, getStoredGithubToken, isServerPublishing, publishJsonToGithub, setStoredGithubToken } from "@/lib/githubPublish";
import { useI18n } from "@/lib/i18n";
import {
  GITHUB_SETTINGS_PATH, normalizeSettings, safeSocialUrl,
  SOCIAL_KEYS, type SiteSettings, type SocialKey,
} from "@/lib/siteSettings";

type Props = {
  siteSettings: SiteSettings;
  setSiteSettings: React.Dispatch<React.SetStateAction<SiteSettings>>;
  setStatus: (s: string) => void;
  hasToken: boolean;
  refreshTokenFlag: () => void;
  onDownloadContent: () => void;
};

const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";

/** Admin → Settings: publishing status, chat, and publishing of settings.json. */
export default function AdminSettings({ siteSettings, setSiteSettings, setStatus, hasToken, refreshTokenFlag, onDownloadContent }: Props) {
  const { t, lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [tokenInput, setTokenInput] = useState("");
  // Publishing goes through the server; the own-key fallback is only offered when it can't be reached.
  const [serverUp, setServerUp] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    serverReachable().then((up) => live && setServerUp(up));
    return () => {
      live = false;
    };
  }, []);
  const viaServer = hasToken && isServerPublishing();
  const session = viaServer ? getServerSession() : null;
  const [busy, setBusy] = useState(false);

  /** Publishes chat/social and the current settings.json (logo paths stay as already saved). */
  async function publishSettings() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("Publishing isn't connected on this device. Sign out and sign in again."); return; }
    setBusy(true);
    const next = normalizeSettings(siteSettings);
    try {
      setStatus("Publishing settings.json…");
      const r = await publishJsonToGithub(GITHUB_SETTINGS_PATH, next, token, "chore(settings): update settings.json via admin");
      if (!r.ok) { setStatus(r.error || "failed"); return; }
      setSiteSettings(next);
      setStatus(`Published ${GITHUB_SETTINGS_PATH}. Site rebuilds in ~2–5 min. ${r.htmlUrl || ""}`);
    } catch (e) {
      setStatus(`Publish failed: ${e instanceof Error ? e.message : String(e)} (check your connection).`);
    } finally {
      setBusy(false);
    }
  }

  const setSocial = (k: SocialKey, v: string) => setSiteSettings({ ...siteSettings, social: { ...siteSettings.social, [k]: v } });

  return (
    <section className="space-y-10">
      <h2>{t("admin.settings.heading")}</h2>

      <Block title={tr("Publishing", "النشر")}>
        <p className="text-sm" data-testid="publishing-status">
          {viaServer ? (
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">● {tr("Publishing: connected (server)", "النشر: متصل (الخادم)")}</span>
          ) : hasToken ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">● {tr("Publishing: using your own key (this tab only)", "النشر: باستخدام مفتاحك (هذه النافذة فقط)")}</span>
          ) : (
            <span className="font-semibold text-rose-700 dark:text-rose-300">● {tr("Publishing: not connected on this device", "النشر: غير متصل على هذا الجهاز")}</span>
          )}
        </p>
        <p className="text-xs text-muted">
          {viaServer && session
            ? tr(`Publish buttons commit to ${GITHUB_REPO} (${GITHUB_BRANCH}) through the site's server — no GitHub key is needed on any device. This device stays connected until ${new Date(session.exp).toLocaleDateString("en-GB")}.`, `أزرار النشر تحفظ التغييرات عبر خادم الموقع — لا حاجة إلى مفتاح GitHub على أي جهاز. يبقى هذا الجهاز متصلًا حتى ${new Date(session.exp).toLocaleDateString("ar-AE")}.`)
            : tr("Sign out and sign in again with the admin password to connect publishing on this device.", "سجّل الخروج ثم الدخول مجددًا بكلمة مرور الإدارة لتوصيل النشر على هذا الجهاز.")}
        </p>
        {!viaServer && (
          <button type="button" className={btn} data-testid="publishing-reconnect" onClick={() => { setAdminAuthenticated(false); window.location.href = "/admin/login"; }}>
            {tr("Sign in again", "تسجيل الدخول مجددًا")}
          </button>
        )}
        {serverUp === false && (
          <details className="rounded-xl border border-card-border p-3 text-sm" data-testid="own-key-fallback">
            <summary className="cursor-pointer font-medium">{tr("Advanced: use my own key (server unreachable)", "متقدم: استخدام مفتاحي (الخادم غير متاح)")}</summary>
            <form onSubmit={(e) => { e.preventDefault(); if (!tokenInput.trim()) { setStatus("Paste a token first."); return; } setStoredGithubToken(tokenInput); setTokenInput(""); refreshTokenFlag(); setStatus("Key saved for this tab only."); }} className="mt-3 space-y-3">
              <Field label="GitHub Personal Access Token"><input className={input + " font-mono text-xs"} type="password" autoComplete="off" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="github_pat_…" /></Field>
              <p className="text-xs text-muted">{tr("Kept for this tab only and never published.", "يُحفظ لهذه النافذة فقط ولا يُنشر.")}</p>
              <div className="flex gap-2"><button type="submit" className={btn}>{tr("Use key", "استخدام المفتاح")}</button>{hasToken && !viaServer && <button type="button" className={btnGhost} onClick={() => { clearStoredGithubToken(); refreshTokenFlag(); setStatus("Key removed."); }}>{tr("Forget key", "نسيان المفتاح")}</button>}</div>
            </form>
          </details>
        )}
      </Block>

      <Block title={tr("Live chat (Tawk.to)", "الدردشة المباشرة (Tawk.to)")}>
        <p className="text-xs text-muted">Paste IDs from Tawk → Admin → Channels → Chat Widget. Cloudflare env NEXT_PUBLIC_TAWK_* overrides these if set. Leave blank to show “Chat coming soon”.</p>
        <Field label="Property ID"><input className={input + " font-mono text-xs"} value={siteSettings.tawkPropertyId} onChange={(e) => setSiteSettings({ ...siteSettings, tawkPropertyId: e.target.value })} placeholder="e.g. 64f…" /></Field>
        <Field label="Widget ID"><input className={input + " font-mono text-xs"} value={siteSettings.tawkWidgetId} onChange={(e) => setSiteSettings({ ...siteSettings, tawkWidgetId: e.target.value })} placeholder="e.g. 1h…" /></Field>
        <Field label="Teacher WhatsApp number (saved for later — not shown on the public site right now)"><input className={input + " font-mono text-xs"} value={siteSettings.whatsappNumber} onChange={(e) => setSiteSettings({ ...siteSettings, whatsappNumber: e.target.value })} placeholder="+971545705552" /></Field>
      </Block>

      <Block title={tr("Social links", "روابط التواصل الاجتماعي")}>
        <p className="text-xs text-muted">{tr("Full profile URLs (https://…). Only filled-in links show as icons in the site footer; they open in a new tab.", "روابط الحسابات كاملة (https://…). تظهر الروابط المعبأة فقط كأيقونات في تذييل الموقع وتفتح في علامة تبويب جديدة.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_KEYS.map((k) => {
            const v = siteSettings.social[k] || "";
            const bad = v.trim() && !safeSocialUrl(v);
            return (
              <Field key={k} label={SOCIAL_LABEL[k]}>
                <input className={input} dir="ltr" inputMode="url" value={v} onChange={(e) => setSocial(k, e.target.value)} placeholder={SOCIAL_PLACEHOLDER[k]} data-testid={`social-${k}`} />
                {bad && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{tr("Not a valid web address — it will be hidden.", "رابط غير صالح — لن يظهر.")}</span>}
              </Field>
            );
          })}
        </div>
      </Block>

      <Block title={tr("Logo and site identity", "الشعار وهوية الموقع")}>
        <p className="text-sm text-muted">{tr("The logo, favicon, site name and colours all live in one place: the gear menu → Site & branding.", "الشعار وأيقونة المتصفح واسم الموقع والألوان كلها في مكان واحد: قائمة الترس ← الموقع والهوية.")}</p>
        <a href="#branding" className={btnGhost + " inline-block"} data-testid="open-site-branding">{tr("Open Site & branding", "فتح الموقع والهوية")}</a>
      </Block>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={btn} onClick={publishSettings} data-testid="publish-settings">{tr("Publish settings", "نشر الإعدادات")}</button>
        <button type="button" className={btnGhost} onClick={() => downloadJson(normalizeSettings(siteSettings), "settings.json")}>Download settings.json</button>
        <button type="button" className={btnGhost} onClick={onDownloadContent}>{t("admin.download")}</button>
      </div>

      <Block title={tr("Admin login", "دخول المشرف")}>
        <p className="text-sm text-muted">Private URL: <code>/admin/login</code> (not linked anywhere on the public site — bookmark it). The password is checked only by the school server and stored there as a salted, slow hash — nothing about it is in the website code. Sign-ins last 12 hours without use (7 days at most). Change the password, turn on two-step sign-in and see recent sign-ins in the gear menu → Security.</p>
      </Block>
    </section>
  );
}

const SOCIAL_LABEL: Record<SocialKey, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", x: "X (Twitter)", linkedin: "LinkedIn" };
const SOCIAL_PLACEHOLDER: Record<SocialKey, string> = {
  facebook: "https://facebook.com/…", instagram: "https://instagram.com/…", tiktok: "https://tiktok.com/@…",
  x: "https://x.com/…", linkedin: "https://linkedin.com/in/…",
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}
