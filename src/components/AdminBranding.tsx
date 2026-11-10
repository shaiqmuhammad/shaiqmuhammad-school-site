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
  allPresets, cacheIdentity, cachedIdentity, contrastWarnings, DEFAULT_HEADER, DEFAULT_SUN, emptyIdentity, fetchIdentity,
  normalizeIdentity, THEME_PRESETS, themeCss, type SiteIdentity,
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

  useEffect(() => {
    const c = cachedIdentity();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device cache is read after hydration
    if (c) { setSaved(c); setD(c); }
    fetchIdentity().then((f) => { const v = f || emptyIdentity; setSaved(v); setD(v); cacheIdentity(f); }).catch(() => undefined);
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
    const r = await securityCall<{ brand: unknown }>("brand-save", { brand: next });
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

  // ---- email sender ----
  const mail = d.mail || { fromName: "", contact: "", info: "" };
  const setMail = (m: Partial<typeof mail>) => setD({ ...d, mail: { ...mail, ...m } });

  const nameNow = ar ? d.nameAr || d.nameEn || siteConfig.name : d.nameEn || siteConfig.name;
  const logoSrc = pending.logo?.dataUrl || brandUrl(siteSettings.brand.logoPath, siteSettings.brand.version, DEFAULT_LOGO_URL);
  const pendingCount = (pending.logo ? 1 : 0) + (pending.favicon ? 1 : 0);

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
        if (kind === "logo") next.brand.logoPath = `/brand/${file}`;
        else {
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
      setStatus(`Published ${GITHUB_SETTINGS_PATH}${uploaded ? " and brand images" : ""}. Site rebuilds in ~2–5 min. ${r.htmlUrl || ""}`);
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
        ? { ...siteSettings.brand, logoPath: "" }
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
              <button key={p.id} type="button" onClick={() => setTheme({ preset: p.id, header: p.id === "classic" ? "" : p.header, sun: p.id === "classic" ? "" : p.sun })} aria-pressed={on} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${on ? "border-sun-border ring-2 ring-sun/50" : "border-card-border"}`} data-testid={`brand-preset-${p.id}`}>
                <span className="inline-flex"><span className="h-4 w-4 rounded-s-full" style={{ background: p.header }} /><span className="h-4 w-4 rounded-e-full" style={{ background: p.sun }} /></span>
                {ar ? p.ar : p.en}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 font-medium">{tr("Main / header colour", "اللون الرئيسي / الرأس")}<input type="color" value={header} onChange={(e) => setTheme({ preset: "custom", header: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-card-border" data-testid="brand-header-color" /></label>
          <label className="flex items-center gap-2 font-medium">{tr("Accent colour", "لون التمييز")}<input type="color" value={sun} onChange={(e) => setTheme({ preset: "custom", sun: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-card-border" data-testid="brand-sun-color" /></label>
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
            <p className="text-lg font-extrabold" style={{ color: header }}>{tr("A page heading", "عنوان صفحة")}</p>
            <p className="text-sm">{tr("Normal text on a page looks like this.", "هكذا يبدو النص العادي في الصفحة.")}</p>
            <div className="flex gap-2"><span className="rounded-full px-3 py-1.5 text-xs font-bold text-white" style={{ background: header }}>{tr("Main button", "زر رئيسي")}</span><span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: sun, color: header }}>{tr("Accent button", "زر مميز")}</span></div>
          </div>
        </div>
        {warnings.length > 0 ? (
          <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="brand-contrast-warn">
            {warnings.map((w) => <li key={w.en}>⚠️ {ar ? w.ar : w.en} <span className="text-xs opacity-70">({w.ratio.toFixed(1)}:1)</span></li>)}
          </ul>
        ) : <p className="text-xs text-emerald-700 dark:text-emerald-300" data-testid="brand-contrast-ok">✓ {tr("Text is easy to read with these colours.", "النص واضح بهذه الألوان.")}</p>}
      </Card>

      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`} role="status" data-testid="brand-msg">{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} disabled={busy || !dirty} onClick={() => save(d)} data-testid="brand-save">{busy ? tr("Saving…", "جارٍ الحفظ…") : tr("Save name & colours", "حفظ الاسم والألوان")}</button>
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
        <p className="text-muted">{tr("Name and addresses on automatic emails (sign-in details, reminders, reports). Leave empty to use this site's built-in sender. Sending also needs the mailbox password, which is kept as a server secret — ask your assistant to add it.", "الاسم والعناوين في الرسائل التلقائية (بيانات الدخول، التذكيرات، التقارير). اتركها فارغة لاستخدام المرسل الافتراضي. يحتاج الإرسال أيضًا كلمة مرور البريد، وتُحفظ كسرّ على الخادم — اطلب من مساعدك إضافتها.")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block font-medium">{tr("Sender name", "اسم المرسل")}<input value={mail.fromName} maxLength={60} placeholder={siteConfig.name} onChange={(e) => setMail({ fromName: e.target.value })} className={input} data-testid="mail-from-name" /></label>
          <label className="block font-medium">{tr("Contact address (replies)", "عنوان التواصل (الردود)")}<input dir="ltr" type="email" value={mail.contact} maxLength={120} placeholder={siteConfig.email} onChange={(e) => setMail({ contact: e.target.value })} className={input} data-testid="mail-contact" /></label>
          <label className="block font-medium">{tr("No-reply address", "عنوان عدم الرد")}<input dir="ltr" type="email" value={mail.info} maxLength={120} placeholder={tr("same as contact", "مثل عنوان التواصل")} onChange={(e) => setMail({ info: e.target.value })} className={input} data-testid="mail-info" /></label>
        </div>
        <p className="text-xs text-muted">{tr("Saved with \"Save name & colours\" above.", "يُحفظ مع زر \"حفظ الاسم والألوان\" أعلاه.")}</p>
      </Card>

      <AdminMainAddress saved={saved} onSaved={(v) => { setSaved(v); setD(v); }} />
    </div>
  );
}
