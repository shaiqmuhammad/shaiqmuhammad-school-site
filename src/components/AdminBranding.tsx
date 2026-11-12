"use client";

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { securityCall } from "@/lib/adminServer";
import { BrandUpload, type PendingImage } from "@/components/BrandUpload";
import { downloadJson, getStoredGithubToken, publishBinaryToGithub, publishJsonToGithub } from "@/lib/githubPublish";
import { useI18n } from "@/lib/i18n";
import { siteConfig } from "@/content/site";
import { applyThemeCss } from "@/components/SiteIdentity";
import AdminMainAddress from "@/components/AdminMainAddress";
import {
  allPresets, cacheIdentity, cachedIdentity, contrastWarnings, DEFAULT_HEADER, DEFAULT_MAIL_HEADER, DEFAULT_MAIL_SUN, DEFAULT_SUN, emptyIdentity, fetchIdentity,
  isMailAddress, MAIL_QUICK_PICKS, MAIL_SENDER_DEFAULTS, MAIL_SENDER_LABELS, MAIL_SENDER_TYPES, normalizeIdentity, THEME_PRESETS, themeCss,
  type MailIdentity, type SiteIdentity,
} from "@/lib/siteIdentity";
import {
  BRAND_DIR, brandUrl, DEFAULT_FAVICON_URL, DEFAULT_LOGO_URL, GITHUB_SETTINGS_PATH, normalizeSettings,
  type SiteSettings,
} from "@/lib/siteSettings";

function Card({ title, children, testid }: { title: string; children: ReactNode; testid?: string }) {
  return (
    <section className="glass rounded-[20px] p-5 sm:p-6" data-testid={testid}>
      <h2 className="text-lg font-extrabold text-heading">{title}</h2>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}
const input = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";
const btn2 = "rounded-full border border-card-border px-4 py-2 text-sm font-semibold hover:bg-black/[0.04] dark:hover:bg-white/10 disabled:opacity-50";


function AddressPicks({ label, value, onChange, placeholder, testid, allowed, tr, ar, className = "" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testid: string;
  allowed: string[];
  tr: (en: string, a: string) => string;
  ar: boolean;
  className?: string;
}) {
  const v = value.trim().toLowerCase();
  const warn = Boolean(v && allowed.length > 0 && !allowed.includes(v));
  return (
    <div className={`block font-medium ${className}`.trim()}>
      <span>{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {MAIL_QUICK_PICKS.map((p) => {
          const on = v === p.email;
          return (
            <button key={p.id} type="button" aria-pressed={on} onClick={() => onChange(on ? "" : p.email)} className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${on ? "border-sun-border ring-2 ring-sun/50" : "border-card-border"}`} data-testid={`${testid}-pick-${p.id}`}>
              {ar ? p.ar : p.en}
            </button>
          );
        })}
      </div>
      <input dir="ltr" type="email" value={value} maxLength={120} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={input} data-testid={testid} />
      {warn && <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{tr("This address is not on the allowed list, so iCloud will send from the connected account instead.", "هذا العنوان ليس في القائمة المسموحة، لذلك سيرسل iCloud من الحساب المتصل بدلاً منه.")}</p>}
    </div>
  );
}

type Props = {
  siteSettings: SiteSettings;
  setSiteSettings: Dispatch<SetStateAction<SiteSettings>>;
  setStatus: (s: string) => void;
  hasToken: boolean;
};

export default function AdminBranding({ siteSettings, setSiteSettings, setStatus, hasToken }: Props) {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const tr = (en: string, a: string) => (ar ? a : en);
  const [saved, setSaved] = useState<SiteIdentity>(emptyIdentity);
  const [d, setD] = useState<SiteIdentity>(emptyIdentity);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [pending, setPending] = useState<{ logo: PendingImage | null; favicon: PendingImage | null }>({ logo: null, favicon: null });
  const [emailPending, setEmailPending] = useState<PendingImage | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [mailStatus, setMailStatus] = useState<{ mailConnected: boolean; allowedFrom: string[] } | null>(null);
  const [serverPreview, setServerPreview] = useState<string>("");
  const [extraDraft, setExtraDraft] = useState("");
  const [extraErr, setExtraErr] = useState("");

  useEffect(() => {
    const c = cachedIdentity();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device cache is read after hydration
    if (c) { setSaved(c); setD(c); }
    fetchIdentity().then((f) => { const v = f || emptyIdentity; setSaved(v); setD(v); cacheIdentity(f); }).catch(() => undefined);
    securityCall<{ mailConnected: boolean; allowedFrom: string[] }>("mail-status").then((r) => {
      if (r.ok) setMailStatus({ mailConnected: !!r.mailConnected, allowedFrom: Array.isArray(r.allowedFrom) ? r.allowedFrom : [] });
    }).catch(() => undefined);
  }, []);

  const header = d.theme.header || DEFAULT_HEADER;
  const sun = d.theme.sun || DEFAULT_SUN;
  const warnings = useMemo(() => contrastWarnings(header, sun), [header, sun]);
  const dirty = JSON.stringify({ ...d, updatedAt: 0 }) !== JSON.stringify({ ...saved, updatedAt: 0 });

  // Live preview: the whole Admin page shows the draft colours while you edit; restored when you leave.
  useEffect(() => {
    document.documentElement.dataset.brandPreview = "1";
    applyThemeCss(themeCss(d.theme));
  }, [d.theme]);
  useEffect(() => () => {
    delete document.documentElement.dataset.brandPreview;
    const c = cachedIdentity();
    applyThemeCss(c ? themeCss(c.theme) : "");
  }, []);

  const setTheme = (p: Partial<SiteIdentity["theme"]>) => setD((x) => ({ ...x, theme: { ...x.theme, ...p } }));

  async function save(next: SiteIdentity, note?: string) {
    setBusy(true); setMsg(null);
    const payload = {
      ...next,
      mail: {
        ...(next.mail || { fromName: "", contact: "", info: "" }),
        siteLogoPath: siteSettings.brand.logoPath || next.mail?.siteLogoPath || "",
        siteLogoPngPath: siteSettings.brand.logoEmailPath || next.mail?.siteLogoPngPath || "",
      },
    };
    const r = await securityCall<{ brand: unknown }>("brand-save", { brand: payload });
    setBusy(false);
    if (r.ok && r.brand) {
      const v = normalizeIdentity(r.brand);
      setSaved(v); setD(v); cacheIdentity(v);
      setMsg({ ok: true, text: note || tr("Saved. Visitors see the new name and colours on their next page load (within a minute).", "تم الحفظ. يرى الزوار الاسم والألوان الجديدة عند فتح الصفحة التالية (خلال دقيقة).") });
    } else setMsg({ ok: false, text: tr(`Couldn't save (${r.error || r.status}). Sign in again and retry.`, `تعذّر الحفظ (${r.error || r.status}).`) });
  }
  const resetDefault = () => {
    if (!confirm(tr("Go back to the original name, tagline and navy & yellow colours?", "العودة إلى الاسم والشعار والألوان الأصلية؟"))) return;
    void save({ ...emptyIdentity, canonical: saved.canonical }, tr("Back to the original name and colours.", "تمت العودة إلى الاسم والألوان الأصلية."));
  };

  // ---- presets ----
  const [presetLabel, setPresetLabel] = useState("");
  const [comboLabel, setComboLabel] = useState("");
  const savedPresets = saved.presets || [];
  async function savePresets(list: NonNullable<SiteIdentity["presets"]>, note: string) {
    await save({ ...saved, presets: list }, note);
  }
  function addPreset() {
    const label = presetLabel.trim().slice(0, 40);
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `p${Date.now() % 100000}`;
    const p = { id, label, nameEn: d.nameEn, nameAr: d.nameAr, taglineEn: d.taglineEn, taglineAr: d.taglineAr, theme: d.theme };
    void savePresets([...savedPresets.filter((x) => x.id !== id), p].slice(0, 8), tr(`Preset "${label}" saved. Pick it under Main address to switch name & colours with the address.`, `تم حفظ "${label}". اختره في العنوان الرئيسي لتبديل الاسم والألوان مع العنوان.`));
    setPresetLabel("");
  }
  const applyPreset = (id: string) => { const p = allPresets(saved).find((x) => x.id === id); if (p) setD({ ...d, nameEn: p.nameEn, nameAr: p.nameAr, taglineEn: p.taglineEn, taglineAr: p.taglineAr, theme: p.theme }); };
  const combos = saved.combos || [];
  function addCombo() {
    const label = comboLabel.trim().slice(0, 40);
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `c${Date.now() % 100000}`;
    const row = { id, label, header, sun, heading: d.theme.heading || "", sub: d.theme.sub || "" };
    void save({ ...d, combos: [...combos.filter((x) => x.id !== id), row].slice(0, 16) }, tr(`Colour combination "${label}" saved.`, `تم حفظ مجموعة الألوان "${label}".`));
    setComboLabel("");
  }

  // ---- email sender ----
  const mail: MailIdentity = d.mail || { fromName: "", contact: "", info: "", footer: "", logoPath: "", siteLogoPath: "", siteLogoPngPath: "", senders: {}, allowedFrom: [] };
  const setMail = (m: Partial<MailIdentity>) => setD({ ...d, mail: { ...mail, ...m } });
  const allowedNow = Array.from(new Set([...(mailStatus?.allowedFrom || []), ...(mail.allowedFrom || [])].map((a) => a.trim().toLowerCase()).filter(Boolean)));
  function addAllowedAddress() {
    const v = extraDraft.trim().toLowerCase();
    if (!isMailAddress(v)) { setExtraErr(tr("Enter a valid email address, like name@icloud.com.", "أدخل عنوان بريد صالحًا، مثل name@icloud.com.")); return; }
    const list = Array.from(new Set([...(mail.allowedFrom || []), v]));
    setMail({ allowedFrom: list.slice(0, 20) });
    setExtraDraft("");
    setExtraErr("");
  }

  const nameNow = ar ? d.nameAr || d.nameEn || siteConfig.name : d.nameEn || siteConfig.name;
  const logoSrc = pending.logo?.dataUrl || brandUrl(siteSettings.brand.logoPath, siteSettings.brand.version, DEFAULT_LOGO_URL);
  const pendingCount = (pending.logo ? 1 : 0) + (pending.favicon ? 1 : 0);
  const emailLogoSrc = emailPending?.dataUrl || brandUrl(mail.logoPath || "", "", brandUrl(siteSettings.brand.logoEmailPath || siteSettings.brand.logoPath, siteSettings.brand.version, DEFAULT_LOGO_URL));
  async function publishEmailLogo() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("Publishing isn't connected on this device. Sign out and sign in again."); return; }
    if (!emailPending) return;
    setEmailBusy(true);
    try {
      const raster = emailPending.png512;
      const ext = raster ? "png" : emailPending.ext === "jpg" ? "jpg" : emailPending.ext;
      const file = `email-logo.${ext}`;
      const dataUrl = raster || emailPending.dataUrl;
      setStatus(`Uploading ${BRAND_DIR}/${file}…`);
      const r = await publishBinaryToGithub(`${BRAND_DIR}/${file}`, dataUrl, token, "chore(brand): upload email-logo via admin");
      if (!r.ok) { setStatus(`email logo upload failed: ${r.error}`); return; }
      const nextMail = { ...mail, logoPath: `/brand/${file}` };
      setMail({ logoPath: `/brand/${file}` });
      setEmailPending(null);
      setStatus(`Published ${BRAND_DIR}/${file}. Saving so outgoing mail uses it. Site rebuilds in ~2–5 min. ${r.htmlUrl || ""}`);
      await save({ ...d, mail: nextMail }, tr("Email logo published and saved. Site rebuilds in ~2–5 min.", "نُشر شعار البريد وحُفظ. يُعاد بناء الموقع خلال ٢–٥ دقائق."));
    } catch (e) {
      setStatus(`Publish failed: ${e instanceof Error ? e.message : String(e)} (check your connection).`);
    } finally {
      setEmailBusy(false);
    }
  }

  async function loadServerPreview() {
    setServerPreview("");
    const r = await securityCall<{ html?: string; error?: string }>("mail-preview", { brand: d });
    if (r.ok && r.html) setServerPreview(r.html);
    else setStatus(tr("Could not load the server preview. Sign in again and retry.", "تعذّر تحميل معاينة الخادم. سجّل الدخول مجددًا ثم أعد المحاولة."));
  }


  async function publishLogo() {
    const token = getStoredGithubToken();
    if (!token) { setStatus("Publishing isn't connected on this device. Sign out and sign in again."); return; }
    setLogoBusy(true);
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
        if (kind === "logo") {
          next.brand.logoPath = `/brand/${file}`;
          if (img.png512) {
            setStatus(`Uploading ${BRAND_DIR}/logo-email.png…`);
            const rPng = await publishBinaryToGithub(`${BRAND_DIR}/logo-email.png`, img.png512, token, "chore(brand): upload logo-email.png via admin");
            if (!rPng.ok) { setStatus(`email PNG upload failed: ${rPng.error}`); return; }
            next.brand.logoEmailPath = "/brand/logo-email.png";
          }
        } else {
          next.brand.faviconPath = `/brand/${file}`;
          if (!img.png512) { setStatus("Could not prepare the 512px favicon. Please try another image."); return; }
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
      const nextMail = { ...mail, siteLogoPath: next.brand.logoPath || "", siteLogoPngPath: next.brand.logoEmailPath || "" };
      setMail({ siteLogoPath: nextMail.siteLogoPath, siteLogoPngPath: nextMail.siteLogoPngPath });
      setStatus(`Published ${GITHUB_SETTINGS_PATH}${uploaded ? " and brand images" : ""}. Site rebuilds in ~2–5 min. ${r.htmlUrl || ""}`);
      await save({ ...d, mail: nextMail }, tr("Logo & icons published. Emails will use this logo after the site rebuilds (~2–5 min).", "نُشر الشعار والأيقونات. ستستخدم الرسائل هذا الشعار بعد إعادة بناء الموقع (نحو ٢–٥ دقائق)."));
    } catch (e) {
      setStatus(`Publish failed: ${e instanceof Error ? e.message : String(e)} (check your connection).`);
    } finally {
      setLogoBusy(false);
    }
  }

  const resetBrand = (kind: "logo" | "favicon") => {
    setPending((p) => ({ ...p, [kind]: null }));
    setSiteSettings({
      ...siteSettings,
      brand: kind === "logo"
        ? { ...siteSettings.brand, logoPath: "", logoEmailPath: "" }
        : { ...siteSettings.brand, faviconPath: "", faviconPngPath: "" },
    });
    setStatus(`${kind === "logo" ? "Logo" : "Favicon"} set back to the default — press “Publish logo & icons” to apply.`);
  };

  return (
    <div className="space-y-5" data-testid="admin-branding">
      <Card title={tr("Site name", "اسم الموقع")} testid="brand-name">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block font-medium">{tr("Name (English)", "الاسم (بالإنجليزية)")}<input value={d.nameEn} maxLength={60} placeholder={siteConfig.name} onChange={(e) => setD({ ...d, nameEn: e.target.value })} className={input} data-testid="brand-name-en" /></label>
          <label className="block font-medium">{tr("Name (Arabic)", "الاسم (بالعربية)")}<input dir="rtl" value={d.nameAr} maxLength={60} placeholder={tr("Same as English if empty", "مثل الإنجليزي إذا تُرك فارغًا")} onChange={(e) => setD({ ...d, nameAr: e.target.value })} className={input} data-testid="brand-name-ar" /></label>
          <label className="block font-medium">{tr("Short tagline (English)", "شعار قصير (بالإنجليزية)")}<input value={d.taglineEn} maxLength={140} placeholder="Student learning platform" onChange={(e) => setD({ ...d, taglineEn: e.target.value })} className={input} /></label>
          <label className="block font-medium">{tr("Short tagline (Arabic)", "شعار قصير (بالعربية)")}<input dir="rtl" value={d.taglineAr} maxLength={140} placeholder="منصة تعليمية للطلاب" onChange={(e) => setD({ ...d, taglineAr: e.target.value })} className={input} /></label>
        </div>
        <p className="text-xs text-muted">{tr("Shown in the website header and footer, the Admin menu, the sign-in page and browser tab titles. Leave empty to keep the original.", "يظهر في رأس الموقع وتذييله وقائمة الإدارة وصفحة الدخول وعناوين التبويبات. اتركه فارغًا للإبقاء على الأصلي.")}</p>
      </Card>

      <Card title={tr("Logo & icons", "الشعار والأيقونات")} testid="brand-logo">
        <p className="text-xs text-muted">{tr("Shown in the header, footer, sign-in page and emails. PNG, JPG or SVG, up to 1 MB. Use a square image, ideally 512 × 512 px. Files are saved under public/brand/ and the same settings.json keys as before, so a published logo stays in place. Each site copy can use its own default logo file (and optional NEXT_PUBLIC_LOGO_URL / NEXT_PUBLIC_FAVICON_URL) when these paths are empty.", "يظهر في رأس الموقع وتذييله وصفحة الدخول والرسائل. PNG أو JPG أو SVG حتى ١ ميغابايت. استخدم صورة مربعة، ويفضل ٥١٢ × ٥١٢ بكسل. تُحفظ الملفات في public/brand/ وبنفس مفاتيح settings.json السابقة حتى يبقى الشعار المنشور كما هو. يمكن لكل نسخة من الموقع استخدام شعارها الافتراضي عندما تكون هذه المسارات فارغة.")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <BrandUpload
            kind="logo"
            title={tr("Logo", "الشعار")}
            hint={tr("Header, footer, admin sidebar, sign-in and the default teacher photo. Shown in a circle — keep the subject centred.", "يظهر في رأس الموقع وتذييله ولوحة الإدارة وصفحة الدخول وصورة المعلم الافتراضية داخل دائرة — اجعل العنصر في المنتصف.")}
            currentUrl={brandUrl(siteSettings.brand.logoPath, siteSettings.brand.version, DEFAULT_LOGO_URL)}
            isCustom={!!siteSettings.brand.logoPath}
            pending={pending.logo}
            onPick={(img) => setPending((p) => ({ ...p, logo: img }))}
            onReset={() => resetBrand("logo")}
            onError={setStatus}
            preferPng
          />
          <BrandUpload
            kind="favicon"
            title={tr("Favicon", "أيقونة المتصفح")}
            hint={tr("Browser tab + iPhone/iPad home-screen icon. A simple, bold shape reads best at 32 px.", "أيقونة علامة التبويب والشاشة الرئيسية في iPhone/iPad. الشكل البسيط الواضح أفضل عند ٣٢ بكسل.")}
            currentUrl={brandUrl(siteSettings.brand.faviconPath, siteSettings.brand.version, DEFAULT_FAVICON_URL)}
            isCustom={!!siteSettings.brand.faviconPath}
            pending={pending.favicon}
            onPick={(img) => setPending((p) => ({ ...p, favicon: img }))}
            onReset={() => resetBrand("favicon")}
            onError={setStatus}
          />
        </div>
        {pendingCount > 0 && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm" data-testid="brand-pending">{tr(`${pendingCount} new image(s) ready — press “Publish logo & icons” to upload.`, `${pendingCount} صورة جديدة جاهزة — اضغط «نشر الشعار والأيقونات» للرفع.`)}</p>
        )}
        {!hasToken && <p className="text-xs text-muted">{tr("Publishing isn't connected on this device — open Settings, or sign out and sign in again.", "النشر غير متصل على هذا الجهاز — افتح الإعدادات، أو سجّل الخروج ثم الدخول مجددًا.")}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={logoBusy} className={btn} onClick={publishLogo} data-testid="publish-logo">{logoBusy ? tr("Publishing…", "جارٍ النشر…") : tr("Publish logo & icons", "نشر الشعار والأيقونات")}</button>
          <button type="button" className={btn2} onClick={() => downloadJson(normalizeSettings(siteSettings), "settings.json")}>{tr("Download settings.json", "تنزيل settings.json")}</button>
        </div>
        <p className="text-xs text-muted">{tr("Logo files and settings.json are kept in GitHub with the website (also included in “Publish all” from the top of Admin). The school-data backup page does not download these website files.", "ملفات الشعار وsettings.json محفوظة في GitHub مع الموقع (وتُدرج أيضًا عند «نشر الكل» أعلى الإدارة). صفحة النسخ الاحتياطي لبيانات المدرسة لا تنزّل ملفات الموقع هذه.")}</p>
      </Card>

      <Card title={tr("Colours & theme", "الألوان والمظهر")} testid="brand-theme">
        <p className="font-medium">{tr("Ready-made themes", "مظاهر جاهزة")}</p>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((p) => {
            const on = (d.theme.header || DEFAULT_HEADER) === p.header && (d.theme.sun || DEFAULT_SUN) === p.sun;
            return (
              <button key={p.id} type="button" onClick={() => setTheme({ preset: p.id, header: p.id === "classic" ? "" : p.header, sun: p.id === "classic" ? "" : p.sun, heading: "", sub: "" })} aria-pressed={on} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${on ? "border-sun-border ring-2 ring-sun/50" : "border-card-border"}`} data-testid={`brand-preset-${p.id}`}>
                <span className="inline-flex"><span className="h-4 w-4 rounded-s-full" style={{ background: p.header }} /><span className="h-4 w-4 rounded-e-full" style={{ background: p.sun }} /></span>
                {ar ? p.ar : p.en}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 font-medium">{tr("Main / header colour", "اللون الرئيسي / الرأس")}<input type="color" value={header} onChange={(e) => setTheme({ preset: "custom", header: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-card-border" data-testid="brand-header-color" /></label>
          <label className="flex items-center gap-2 font-medium">{tr("Accent colour", "لون التمييز")}<input type="color" value={sun} onChange={(e) => setTheme({ preset: "custom", sun: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-card-border" data-testid="brand-sun-color" /></label>
          <label className="flex items-center gap-2 font-medium">{tr("Heading colour", "لون العنوان")}<input type="color" value={d.theme.heading || header} onChange={(e) => setTheme({ preset: "custom", heading: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-card-border" data-testid="brand-heading-color" />{d.theme.heading && <button type="button" className="text-xs underline" onClick={() => setTheme({ heading: "" })}>{tr("Default", "الافتراضي")}</button>}</label>
          <label className="flex items-center gap-2 font-medium">{tr("Subheading colour", "لون العنوان الفرعي")}<input type="color" value={d.theme.sub || "#586a7d"} onChange={(e) => setTheme({ preset: "custom", sub: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-card-border" data-testid="brand-sub-color" />{d.theme.sub && <button type="button" className="text-xs underline" onClick={() => setTheme({ sub: "" })}>{tr("Default", "الافتراضي")}</button>}</label>
          <fieldset className="flex items-center gap-3">
            <legend className="sr-only">{tr("Default look", "المظهر الافتراضي")}</legend>
            <span className="font-medium">{tr("Default look for visitors:", "المظهر الافتراضي للزوار:")}</span>
            <label className="flex items-center gap-1"><input type="radio" name="mode" checked={d.theme.mode !== "dark"} onChange={() => setTheme({ mode: "light" })} /> {tr("Light", "فاتح")}</label>
            <label className="flex items-center gap-1"><input type="radio" name="mode" checked={d.theme.mode === "dark"} onChange={() => setTheme({ mode: "dark" })} /> {tr("Dark", "داكن")}</label>
          </fieldset>
        </div>
        <p className="text-xs text-muted">{tr("Visitors who already picked light or dark with the moon button keep their choice.", "الزوار الذين اختاروا الوضع الفاتح أو الداكن يحتفظون باختيارهم.")}</p>

        <p className="font-medium">{tr("Live preview", "معاينة مباشرة")} <span className="text-xs font-normal text-muted">{tr("(this Admin page also shows the colours while you edit)", "(تظهر الألوان في صفحة الإدارة أثناء التعديل)")}</span></p>
        <div className="overflow-hidden rounded-2xl border border-card-border" data-testid="brand-preview">
          <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: header }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt="" width={32} height={32} className="h-8 w-8 rounded-full border-2 bg-white object-cover" style={{ borderColor: sun }} data-testid="brand-preview-logo" />
            <span className="leading-tight"><b className="block">{nameNow}</b><span className="text-xs opacity-75">{(ar ? d.taglineAr : d.taglineEn) || tr("Student learning platform", "منصة تعليمية للطلاب")}</span></span>
            <span className="ms-auto rounded-full px-3 py-1 text-xs font-bold" style={{ background: sun, color: "#0b1b2b" }}>{tr("Sign in", "دخول")}</span>
          </div>
          <div className="space-y-2 bg-white p-4 text-[#1b2f44]">
            <p className="text-lg font-extrabold" style={{ color: d.theme.heading || header }}>{tr("A page heading", "عنوان صفحة")}</p>
            <p className="text-sm font-semibold" style={{ color: d.theme.sub || "#586a7d" }}>{tr("A subheading", "عنوان فرعي")}</p>
            <p className="text-sm">{tr("Normal text on a page looks like this.", "هكذا يبدو النص العادي في الصفحة.")}</p>
            <div className="flex gap-2"><span className="rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ background: header }}>{tr("Main button", "زر رئيسي")}</span><span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: sun, color: header }}>{tr("Accent button", "زر مميز")}</span></div>
          </div>
        </div>
        {warnings.length > 0 ? (
          <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="brand-contrast-warn">
            {warnings.map((w) => <li key={w.en}>⚠️ {ar ? w.ar : w.en} <span className="text-xs opacity-70">({w.ratio.toFixed(1)}:1)</span></li>)}
          </ul>
        ) : <p className="text-xs text-emerald-700 dark:text-emerald-300" data-testid="brand-contrast-ok">✓ {tr("Text is easy to read with these colours.", "النص واضح بهذه الألوان.")}</p>}
        <p className="text-xs text-muted">{tr("In dark mode, titles stay white unless the heading colour you pick is still easy to read on the dark background. Header icons stay light too.", "في الوضع الداكن تبقى العناوين بيضاء إلا إذا كان لون العنوان الذي اخترته واضحًا على الخلفية الداكنة. وتبقى أيقونات الرأس فاتحة أيضًا.")}</p>
        <p className="font-medium">{tr("Your colour combinations", "مجموعات ألوانك")}</p>
        <ul className="flex flex-wrap gap-2" data-testid="brand-combos">
          {combos.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full border border-card-border px-2 py-1">
              <span className="inline-flex"><span className="h-3.5 w-3.5 rounded-s-full" style={{ background: c.header }} /><span className="h-3.5 w-3.5 rounded-e-full" style={{ background: c.sun }} /></span>
              <button type="button" className="px-1 text-sm font-semibold hover:underline" onClick={() => setTheme({ preset: "custom", header: c.header, sun: c.sun, heading: c.heading || "", sub: c.sub || "" })} data-testid={`combo-use-${c.id}`}>{c.label}</button>
              <button type="button" aria-label={tr("Delete combination", "حذف المجموعة")} className="px-1 text-xs text-muted hover:text-red-600" disabled={busy} onClick={() => void save({ ...d, combos: (d.combos || combos).filter((x) => x.id !== c.id) }, tr("Combination deleted.", "تم حذف المجموعة."))}>✕</button>
            </li>
          ))}
          {!combos.length && <li className="text-sm text-muted">{tr("None saved yet.", "لم يُحفظ شيء بعد.")}</li>}
        </ul>
        <div className="flex max-w-xl flex-wrap gap-2">
          <input value={comboLabel} maxLength={40} onChange={(e) => setComboLabel(e.target.value)} placeholder={tr("Combination name, e.g. Spring", "اسم المجموعة، مثل الربيع")} className="min-w-0 flex-1 rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm" data-testid="combo-label" />
          <button type="button" className={btn2} disabled={busy || !comboLabel.trim()} onClick={addCombo} data-testid="combo-save">{tr("Save this colour combination", "احفظ مجموعة الألوان هذه")}</button>
        </div>
      </Card>

      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`} role="status" data-testid="brand-msg">{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={busy || !dirty} onClick={() => save(d)} data-testid="brand-save">{busy ? tr("Saving…", "جارٍ الحفظ…") : tr("Save name, colours & email", "حفظ الاسم والألوان والبريد")}</button>
        <button type="button" className={btn2} disabled={busy || !dirty} onClick={() => setD(saved)}>{tr("Undo changes", "تراجع")}</button>
        <button type="button" className={btn2} disabled={busy} onClick={resetDefault} data-testid="brand-reset">{tr("Reset to default", "إعادة الافتراضي")}</button>
      </div>

      <Card title={tr("Branding presets", "قوالب الهوية")} testid="brand-presets">
        <p className="text-muted">{tr("A preset is a saved name + colours. Use one here (then press Save), or choose it under Main address to switch it together with the address.", "القالب اسم وألوان محفوظة. طبّقه هنا (ثم اضغط حفظ)، أو اختره في العنوان الرئيسي ليتبدّل مع العنوان.")}</p>
        <ul className="flex flex-wrap gap-2">
          {allPresets(saved).map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-full border border-card-border px-2 py-1">
              <span className="inline-flex"><span className="h-3.5 w-3.5 rounded-s-full" style={{ background: p.theme.header || DEFAULT_HEADER }} /><span className="h-3.5 w-3.5 rounded-e-full" style={{ background: p.theme.sun || DEFAULT_SUN }} /></span>
              <button type="button" className="px-1 text-sm font-semibold hover:underline" onClick={() => applyPreset(p.id)} data-testid={`preset-use-${p.id}`}>{p.label}</button>
              {savedPresets.some((x) => x.id === p.id) && <button type="button" aria-label={tr("Delete preset", "حذف القالب")} className="px-1 text-xs text-muted hover:text-red-600" disabled={busy} onClick={() => void savePresets(savedPresets.filter((x) => x.id !== p.id), tr("Preset deleted.", "تم حذف القالب."))}>✕</button>}
            </li>
          ))}
        </ul>
        <div className="flex max-w-md flex-wrap gap-2">
          <input value={presetLabel} maxLength={40} onChange={(e) => setPresetLabel(e.target.value)} placeholder={tr("Preset name, e.g. Al-Mudarris", "اسم القالب، مثل المدرّس")} className="min-w-0 flex-1 rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm" data-testid="preset-label" />
          <button type="button" className={btn2} disabled={busy || !presetLabel.trim()} onClick={addPreset} data-testid="preset-save">{tr("Save the name & colours above as a preset", "احفظ الاسم والألوان أعلاه كقالب")}</button>
        </div>
      </Card>

      <Card title={tr("Email sender", "مرسل البريد")} testid="brand-mail">
        <p className="text-muted">{tr("Name, addresses, footer and logo on automatic emails (sign-in details, reminders, reports). Leave a field empty to keep this site's built-in value. The mailbox password stays a server secret and is never stored here.", "الاسم والعناوين والتذييل والشعار في الرسائل التلقائية (بيانات الدخول، التذكيرات، التقارير). اترك الحقل فارغًا للإبقاء على القيمة الافتراضية. تبقى كلمة مرور صندوق البريد سرًا على الخادم ولا تُحفظ هنا.")}</p>
        <p className="text-sm" data-testid="mail-connected">{mailStatus?.mailConnected ? tr("Mail account: connected", "حساب البريد: متصل") : tr("Mail account: not connected — sending needs the mailbox password, kept as a server secret. Ask your assistant to add it.", "حساب البريد: غير متصل — الإرسال يحتاج كلمة مرور الصندوق، وتُحفظ كسرّ على الخادم. اطلب من مساعدك إضافتها.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block font-medium sm:col-span-2">{tr("Sender name", "اسم المرسل")}<input value={mail.fromName} maxLength={60} placeholder={siteConfig.name} onChange={(e) => setMail({ fromName: e.target.value })} className={input} data-testid="mail-from-name" /></label>
          <AddressPicks label={tr("Default From address", "عنوان المرسل الافتراضي")} value={mail.info} onChange={(v) => setMail({ info: v })} placeholder={tr("usually the no-reply address", "عادةً عنوان عدم الرد")} testid="mail-info" allowed={allowedNow} tr={tr} ar={ar} />
          <AddressPicks label={tr("Reply-To address", "عنوان الرد")} value={mail.contact} onChange={(v) => setMail({ contact: v })} placeholder={siteConfig.email} testid="mail-contact" allowed={allowedNow} tr={tr} ar={ar} className="sm:col-span-2" />
          <label className="block font-medium sm:col-span-2">{tr("Footer / contact line", "سطر التذييل / التواصل")}<input value={mail.footer || ""} maxLength={200} placeholder={tr("Questions? Write to (reply-to address) · this website", "أسئلة؟ راسل (عنوان الرد) · هذا الموقع")} onChange={(e) => setMail({ footer: e.target.value })} className={input} data-testid="mail-footer" /></label>
        </div>
        <p className="font-medium">{tr("From address by email type", "عنوان المرسل حسب نوع الرسالة")}</p>
        <p className="text-xs text-muted">{tr("Each kind of automatic email can use a different From address. Leave a row empty to keep its built-in default.", "يمكن لكل نوع من الرسائل التلقائية استخدام عنوان مرسل مختلف. اترك الصف فارغًا للإبقاء على القيمة الافتراضية.")}</p>
        <div className="grid gap-3" data-testid="mail-senders">
          {MAIL_SENDER_TYPES.map((typ) => (
            <AddressPicks key={typ} label={ar ? MAIL_SENDER_LABELS[typ].ar : MAIL_SENDER_LABELS[typ].en} value={(mail.senders && mail.senders[typ]) || ""} onChange={(v) => setMail({ senders: { ...(mail.senders || {}), [typ]: v } })} placeholder={MAIL_SENDER_DEFAULTS[typ]} testid={`mail-sender-${typ}`} allowed={allowedNow} tr={tr} ar={ar} />
          ))}
        </div>
        <p className="font-medium">{tr("Other iCloud addresses", "عناوين iCloud أخرى")}</p>
        <p className="text-xs text-muted">{tr("Add any other iCloud address or alias of the connected account that you want to use as From. Addresses are saved with this site (no new password). iCloud only sends from aliases of the connected account; any other address falls back to that account.", "أضف أي عنوان iCloud أو مرادف للحساب المتصل تريد استخدامه كمرسل. تُحفظ العناوين مع هذا الموقع (بدون كلمة مرور جديدة). iCloud يرسل فقط من مرادفات الحساب المتصل، وأي عنوان آخر يُستبدل بالحساب المتصل.")}</p>
        <ul className="space-y-1" data-testid="mail-allowed-list">
          {(mail.allowedFrom || []).map((addr) => (
            <li key={addr} className="flex flex-wrap items-center gap-2 rounded-xl border border-card-border px-3 py-1.5">
              <span dir="ltr" className="min-w-0 flex-1 break-all text-sm">{addr}</span>
              <button type="button" className={btn2} onClick={() => setMail({ allowedFrom: (mail.allowedFrom || []).filter((a) => a !== addr) })} data-testid={`mail-allowed-remove-${addr}`}>{tr("Remove", "إزالة")}</button>
            </li>
          ))}
        </ul>
        <div className="flex max-w-xl flex-wrap gap-2">
          <input dir="ltr" type="email" value={extraDraft} maxLength={120} placeholder={tr("name@icloud.com or another alias", "name@icloud.com أو مرادف آخر")} onChange={(e) => { setExtraDraft(e.target.value); setExtraErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAllowedAddress(); } }} className="min-w-0 flex-1 rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm" data-testid="mail-allowed-input" />
          <button type="button" className={btn2} onClick={addAllowedAddress} data-testid="mail-allowed-add">{tr("Add address", "إضافة عنوان")}</button>
        </div>
        {extraErr && <p className="text-xs text-amber-800 dark:text-amber-200" data-testid="mail-allowed-error">{extraErr}</p>}
        <p className="text-xs text-muted">{tr("iCloud only sends from aliases of the connected account. If a From address is not one of those, mail is sent from the connected account instead.", "iCloud يرسل فقط من مرادفات الحساب المتصل. إذا لم يكن عنوان المرسل منها، تُرسل الرسالة من الحساب المتصل بدلاً منه.")}</p>
        {mail.info.trim() && allowedNow.length > 0 && !allowedNow.includes(mail.info.trim().toLowerCase()) && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="mail-from-warn">{tr("This From address is not on the allowed list for this mailbox, so emails will be sent from the connected account until you add it as an iCloud alias (or add it to the list above and save).", "عنوان المرسل هذا ليس في القائمة المسموحة لهذا الصندوق، لذلك ستُرسل الرسائل من الحساب المتصل حتى تضيفه كعنوان مرادف في iCloud (أو تضيفه إلى القائمة أعلاه ثم تحفظ).")}</p>
        )}
        <BrandUpload
          kind="logo"
          title={tr("Email logo (optional override)", "شعار البريد (اختياري)")}
          hint={tr("Emails use the Logo & icons image by default (a PNG copy is published for mail apps that cannot show SVG). Upload here only if you want a different image on emails. Reset goes back to the site logo.", "تستخدم الرسائل شعار «الشعار والأيقونات» افتراضيًا (وتُنشر نسخة PNG لتطبيقات البريد التي لا تعرض SVG). ارفع هنا فقط إذا أردت صورة مختلفة في الرسائل. إعادة الافتراضي تعود لشعار الموقع.")}
          currentUrl={emailPending?.dataUrl || brandUrl(mail.logoPath || "", "", brandUrl(siteSettings.brand.logoEmailPath || siteSettings.brand.logoPath, siteSettings.brand.version, DEFAULT_LOGO_URL))}
          isCustom={!!mail.logoPath}
          pending={emailPending}
          onPick={setEmailPending}
          onReset={() => { setEmailPending(null); setMail({ logoPath: "" }); }}
          preferPng
          onError={setStatus}
        />
        {emailPending && <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm">{tr("New email logo ready — press “Publish email logo”. It will be saved automatically.", "شعار البريد الجديد جاهز — اضغط «نشر شعار البريد». سيُحفظ تلقائيًا.")}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={emailBusy || !emailPending} className={btn} onClick={() => void publishEmailLogo()} data-testid="publish-email-logo">{emailBusy ? tr("Publishing…", "جارٍ النشر…") : tr("Publish email logo", "نشر شعار البريد")}</button>
        </div>
        <p className="font-medium">{tr("Sample email", "رسالة نموذجية")}</p>
        <div className="overflow-hidden rounded-2xl border border-card-border bg-[#f3f6fa] p-3" data-testid="mail-preview">
          <div className="mx-auto max-w-lg overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: (d.theme.header || DEFAULT_MAIL_HEADER) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={emailLogoSrc} alt="" width={40} height={40} className="h-10 w-10 rounded-full border-2 bg-white object-cover" style={{ borderColor: d.theme.sun || DEFAULT_MAIL_SUN }} />
              <span className="font-bold">{d.nameEn || d.nameAr || siteConfig.name}</span>
            </div>
            <div className="h-1" style={{ background: d.theme.sun || DEFAULT_MAIL_SUN }} />
            <div className="space-y-2 px-5 py-5 text-[#1f2d3d]">
              <p className="text-lg font-extrabold" style={{ color: d.theme.header || DEFAULT_MAIL_HEADER }}>{tr("Sample email", "رسالة نموذجية")}</p>
              <p>{tr("Assalamu alaikum,", "السلام عليكم،")}</p>
              <p>{tr("This is a preview of how automatic emails look with the current name, colours and logo.", "هذه معاينة لشكل الرسائل التلقائية بالاسم والألوان والشعار الحالي.")}</p>
              <span className="inline-block rounded-full px-4 py-2 text-xs font-bold" style={{ background: d.theme.sun || DEFAULT_MAIL_SUN, color: d.theme.header || DEFAULT_MAIL_HEADER }}>{tr("Open the website", "افتح الموقع")}</span>
            </div>
            <p className="border-t border-[#e6ebf1] px-5 py-3 text-center text-xs text-[#6b7a8c]">{(mail.footer || "").trim() || tr("Questions? Write to (reply-to address) · this website", "أسئلة؟ راسل (عنوان الرد) · هذا الموقع")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn2} disabled={busy} onClick={() => void loadServerPreview()} data-testid="mail-server-preview">{tr("Exact server preview (nothing is sent)", "معاينة الخادم الدقيقة (لا يُرسل شيء)")}</button>
        </div>
        {serverPreview && <iframe title={tr("Server email preview", "معاينة رسالة الخادم")} sandbox="" srcDoc={serverPreview} className="h-[420px] w-full rounded-xl border border-card-border bg-white" data-testid="mail-server-preview-frame" />}
        <p className="text-xs text-muted">{tr("Saved with “Save name, colours & email” above.", "يُحفظ مع زر «حفظ الاسم والألوان والبريد» أعلاه.")}</p>
      </Card>

      <AdminMainAddress saved={saved} onSaved={(v) => { setSaved(v); setD(v); }} />
    </div>
  );
}
