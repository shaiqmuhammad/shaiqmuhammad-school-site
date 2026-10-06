"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GITHUB_BRANCH, GITHUB_REPO } from "@/lib/content";
import { setAdminAuthenticated } from "@/lib/adminAuth";
import { getServerSession, serverReachable } from "@/lib/adminServer";
import { clearStoredGithubToken, downloadJson, getStoredGithubToken, isServerPublishing, publishBinaryToGithub, publishJsonToGithub, setStoredGithubToken } from "@/lib/githubPublish";
import { useI18n } from "@/lib/i18n";
import {
  BRAND_DIR, brandUrl, DEFAULT_LOGO_URL, GITHUB_SETTINGS_PATH, normalizeSettings, safeSocialUrl,
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

  const [pending, setPending] = useState<{ logo: PendingImage | null; favicon: PendingImage | null }>({ logo: null, favicon: null });

  /** Commits pending logo/favicon uploads (Contents API, base64), then settings.json with their paths. */
  async function publishSettings() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("Publishing isn't connected on this device. Sign out and sign in again."); return; }
    setBusy(true);
    const next = normalizeSettings(siteSettings);
    let uploaded = false;
    try {
      for (const kind of ["logo", "favicon"] as const) {
        const img = pending[kind];
        if (!img) continue;
        const file = `${kind}.${img.ext}`;
        setStatus(`Uploading ${BRAND_DIR}/${file}…`);
        const r = await publishBinaryToGithub(`${BRAND_DIR}/${file}`, img.dataUrl, token, `chore(brand): upload ${kind} via admin`);
        if (!r.ok) { setStatus(`${kind} upload failed: ${r.error}`); return; }
        if (kind === "logo") next.brand.logoPath = `/brand/${file}`;
        else {
          next.brand.faviconPath = `/brand/${file}`;
          setStatus(`Uploading ${BRAND_DIR}/favicon-512.png…`);
          const r2 = await publishBinaryToGithub(`${BRAND_DIR}/favicon-512.png`, img.png512, token, "chore(brand): upload favicon-512.png via admin");
          if (!r2.ok) { setStatus(`favicon PNG upload failed: ${r2.error}`); return; }
          next.brand.faviconPngPath = "/brand/favicon-512.png";
        }
        uploaded = true;
      }
      if (uploaded) next.brand.version = Date.now().toString(36);
      setStatus("Publishing settings.json…");
      const r = await publishJsonToGithub(GITHUB_SETTINGS_PATH, next, token, "chore(settings): update settings.json via admin");
      if (!r.ok) { setStatus(r.error || "failed"); return; }
      setSiteSettings(next);
      setPending({ logo: null, favicon: null });
      setStatus(`Published ${GITHUB_SETTINGS_PATH}${uploaded ? " and brand images" : ""}. Site rebuilds in ~2–5 min. ${r.htmlUrl || ""}`);
    } catch (e) {
      setStatus(`Publish failed: ${e instanceof Error ? e.message : String(e)} (check your connection).`);
    } finally {
      setBusy(false);
    }
  }

  const setSocial = (k: SocialKey, v: string) => setSiteSettings({ ...siteSettings, social: { ...siteSettings.social, [k]: v } });
  const resetBrand = (kind: "logo" | "favicon") => {
    setPending((p) => ({ ...p, [kind]: null }));
    setSiteSettings({
      ...siteSettings,
      brand: kind === "logo"
        ? { ...siteSettings.brand, logoPath: "" }
        : { ...siteSettings.brand, faviconPath: "", faviconPngPath: "" },
    });
    setStatus(`${kind === "logo" ? "Logo" : "Favicon"} set back to the default — press “Publish settings” to apply.`);
  };
  const pendingCount = (pending.logo ? 1 : 0) + (pending.favicon ? 1 : 0);

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

      <Block title={tr("Branding", "الهوية البصرية")}>
        <p className="text-xs text-muted">{tr("PNG, JPG or SVG, up to 1 MB. Use a square image, ideally 512 × 512 px. Files are committed to public/brand/ when you press “Publish settings”.", "PNG أو JPG أو SVG حتى ١ ميغابايت. استخدم صورة مربعة، ويفضل ٥١٢ × ٥١٢ بكسل. تُرفع الملفات إلى public/brand/ عند الضغط على «نشر الإعدادات».")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <BrandUpload
            kind="logo"
            title={tr("Logo", "الشعار")}
            hint={tr("Header, admin sidebar and the default teacher photo. Shown in a circle — keep the subject centred.", "يظهر في رأس الموقع ولوحة الإدارة وصورة المعلم الافتراضية داخل دائرة — اجعل العنصر في المنتصف.")}
            currentUrl={brandUrl(siteSettings.brand.logoPath, siteSettings.brand.version, DEFAULT_LOGO_URL)}
            isCustom={!!siteSettings.brand.logoPath}
            pending={pending.logo}
            onPick={(img) => setPending((p) => ({ ...p, logo: img }))}
            onReset={() => resetBrand("logo")}
            onError={setStatus}
          />
          <BrandUpload
            kind="favicon"
            title={tr("Favicon", "أيقونة المتصفح")}
            hint={tr("Browser tab + iPhone/iPad home-screen icon. A simple, bold shape reads best at 32 px.", "أيقونة علامة التبويب والشاشة الرئيسية في iPhone/iPad. الشكل البسيط الواضح أفضل عند ٣٢ بكسل.")}
            currentUrl={brandUrl(siteSettings.brand.faviconPath, siteSettings.brand.version, "/favicon.svg")}
            isCustom={!!siteSettings.brand.faviconPath}
            pending={pending.favicon}
            onPick={(img) => setPending((p) => ({ ...p, favicon: img }))}
            onReset={() => resetBrand("favicon")}
            onError={setStatus}
          />
        </div>
        {pendingCount > 0 && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm" data-testid="brand-pending">{tr(`${pendingCount} new image(s) ready — press “Publish settings” to upload.`, `${pendingCount} صورة جديدة جاهزة — اضغط «نشر الإعدادات» للرفع.`)}</p>
        )}
      </Block>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className={btn} onClick={publishSettings} data-testid="publish-settings">{tr("Publish settings", "نشر الإعدادات")}</button>
        <button type="button" className={btnGhost} onClick={() => downloadJson(normalizeSettings(siteSettings), "settings.json")}>Download settings.json</button>
        <button type="button" className={btnGhost} onClick={onDownloadContent}>{t("admin.download")}</button>
      </div>

      <Block title={tr("Admin login", "دخول المشرف")}>
        <p className="text-sm text-muted">Private URL: <code>/admin/login</code> (not linked anywhere on the public site — bookmark it). Password is checked against a SHA-256 hash (ADMIN_PASSWORD_SHA256 in src/lib/adminAuth.ts, or NEXT_PUBLIC_ADMIN_PASSWORD_HASH env). No plaintext password is stored in the code. Signing in is remembered on this device for 30 days (every tab); use “Log out” to end it.</p>
      </Block>
    </section>
  );
}

const SOCIAL_LABEL: Record<SocialKey, string> = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", x: "X (Twitter)", linkedin: "LinkedIn" };
const SOCIAL_PLACEHOLDER: Record<SocialKey, string> = {
  facebook: "https://facebook.com/…", instagram: "https://instagram.com/…", tiktok: "https://tiktok.com/@…",
  x: "https://x.com/…", linkedin: "https://linkedin.com/in/…",
};

type PendingImage = { dataUrl: string; ext: "png" | "jpg" | "svg"; name: string; width: number; height: number; bytes: number; png512: string };

const MAX_BYTES = 1024 * 1024;
const TYPES: Record<string, PendingImage["ext"]> = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Draws the image centred ("contain") on a transparent square canvas → PNG data URL. */
async function toSquarePng(dataUrl: string, size = 512): Promise<{ png: string; width: number; height: number }> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = img.naturalWidth || size;
  const h = img.naturalHeight || size;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  const scale = Math.min(size / w, size / h);
  const dw = w * scale, dh = h * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return { png: canvas.toDataURL("image/png"), width: img.naturalWidth, height: img.naturalHeight };
}

function BrandUpload({ kind, title, hint, currentUrl, isCustom, pending, onPick, onReset, onError }: {
  kind: "logo" | "favicon"; title: string; hint: string; currentUrl: string; isCustom: boolean;
  pending: PendingImage | null; onPick: (img: PendingImage | null) => void; onReset: () => void; onError: (s: string) => void;
}) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const preview = pending?.dataUrl || currentUrl;

  async function pick(file: File | undefined) {
    if (!file) return;
    const ext = TYPES[file.type] || (/\.svg$/i.test(file.name) ? "svg" : /\.png$/i.test(file.name) ? "png" : /\.jpe?g$/i.test(file.name) ? "jpg" : undefined);
    if (!ext) { onError(`${file.name}: please choose a PNG, JPG or SVG image.`); return; }
    if (file.size > MAX_BYTES) { onError(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use an image under 1 MB.`); return; }
    try {
      const dataUrl = await readAsDataUrl(file);
      const { png, width, height } = await toSquarePng(dataUrl);
      onPick({ dataUrl, ext, name: file.name, width, height, bytes: file.size, png512: png });
    } catch {
      onError(`${file.name} could not be read as an image.`);
    }
  }

  const warn: string[] = [];
  if (pending && pending.ext !== "svg") {
    if (pending.width && pending.height && Math.abs(pending.width - pending.height) > 2) warn.push(tr("Not square — it will be centred with empty space.", "الصورة ليست مربعة — ستُوسَّط مع فراغ."));
    if (Math.min(pending.width, pending.height) < 512) warn.push(tr(`Only ${pending.width}×${pending.height}px — 512×512 or larger looks sharper.`, `الأبعاد ${pending.width}×${pending.height} فقط — ٥١٢×٥١٢ أو أكبر أوضح.`));
  }

  return (
    <div className="rounded-xl border border-card-border p-4" data-testid={`brand-${kind}`}>
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" width={80} height={80} className={`h-20 w-20 bg-accent-soft object-cover ${kind === "logo" ? "rounded-full" : "rounded-lg object-contain p-1"}`} data-testid={`brand-${kind}-preview`} />
          {kind === "favicon" && (
            <div className="flex items-end gap-2" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending?.png512 || preview} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending?.png512 || preview} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium">{title} <span className="text-xs font-normal text-muted">· {pending ? tr("new (not yet published)", "جديد (لم يُنشر بعد)") : isCustom ? tr("custom", "مخصص") : tr("default", "افتراضي")}</span></p>
          <p className="text-xs text-muted">{hint}</p>
          <p className="text-xs text-muted">{tr("Recommended: square, 512 × 512 px, PNG/JPG/SVG, max 1 MB.", "المقترح: مربعة ٥١٢ × ٥١٢ بكسل، PNG/JPG/SVG، بحد أقصى ١ ميغابايت.")}</p>
          {pending && <p className="break-all text-xs">{pending.name} · {pending.ext.toUpperCase()}{pending.ext !== "svg" ? ` · ${pending.width}×${pending.height}px` : ""} · {Math.ceil(pending.bytes / 1024)} KB</p>}
          {warn.map((w) => <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>)}
          <div className="flex flex-wrap gap-2 pt-1">
            <label className={btnGhost + " cursor-pointer"}>
              {tr("Upload…", "رفع…")}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg" className="sr-only" data-testid={`brand-${kind}-input`} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {pending && <button type="button" className={btnGhost} onClick={() => onPick(null)}>{tr("Cancel", "إلغاء")}</button>}
            {(isCustom || pending) && <button type="button" className={btnGhost} onClick={onReset} data-testid={`brand-${kind}-reset`}>{tr("Reset to default", "إعادة الافتراضي")}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

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
