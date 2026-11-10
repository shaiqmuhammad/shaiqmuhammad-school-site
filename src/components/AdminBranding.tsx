"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { securityCall } from "@/lib/adminServer";
import { useI18n } from "@/lib/i18n";
import { siteConfig } from "@/content/site";
import { applyThemeCss } from "@/components/SiteIdentity";
import {
  cacheIdentity, cachedIdentity, contrastWarnings, DEFAULT_HEADER, DEFAULT_HOST, DEFAULT_SUN, emptyIdentity, fetchIdentity,
  normalizeIdentity, THEME_PRESETS, themeCss, type SiteIdentity,
} from "@/lib/siteIdentity";

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

export default function AdminBranding() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const tr = (en: string, a: string) => (ar ? a : en);
  const [saved, setSaved] = useState<SiteIdentity>(emptyIdentity);
  const [d, setD] = useState<SiteIdentity>(emptyIdentity);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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

  // ---- domain ----
  const [dom, setDom] = useState("");
  const [domMsg, setDomMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [domBusy, setDomBusy] = useState(false);
  const here = typeof window !== "undefined" ? window.location.host : "";
  const mainHost = saved.canonical || DEFAULT_HOST;
  async function checkDomain(clear = false) {
    setDomBusy(true); setDomMsg(null);
    const r = await securityCall<{ brand: unknown; domain: string }>("domain-check", clear ? { clear: true } : { domain: dom });
    setDomBusy(false);
    if (r.ok && r.brand) {
      const v = normalizeIdentity(r.brand);
      setSaved((s) => ({ ...s, canonical: v.canonical })); setD((x) => ({ ...x, canonical: v.canonical })); cacheIdentity({ ...cachedIdentity() || emptyIdentity, canonical: v.canonical });
      setDomMsg({ ok: true, text: clear ? tr("The main address is www.shaiqmuhammad.com again.", "العنوان الرئيسي عاد إلى www.shaiqmuhammad.com.") : tr(`Saved. ${v.canonical} is now the main address used in QR codes, shared links and emails.`, `تم الحفظ. ${v.canonical} هو الآن العنوان الرئيسي.`) });
      setDom("");
    } else if (r.error === "not_connected") {
      setDomMsg({ ok: false, text: tr(`${r.domain || dom} doesn't open this website yet, so nothing was changed (links keep using ${mainHost}). Connect it first — see the steps below — then press "Check & use" again.`, `${r.domain || dom} لا يفتح هذا الموقع بعد، لذا لم يتغير شيء. اربطه أولًا ثم اضغط "تحقق واستخدم" مرة أخرى.`) });
    } else if (r.error === "bad_domain") setDomMsg({ ok: false, text: tr("That doesn't look like a web address. Type it like: www.myschool.com", "هذا لا يبدو عنوان موقع. اكتبه مثل: www.myschool.com") });
    else setDomMsg({ ok: false, text: tr(`Couldn't check (${r.error || r.status}).`, `تعذّر التحقق (${r.error || r.status}).`) });
  }

  const nameNow = ar ? d.nameAr || d.nameEn || siteConfig.name : d.nameEn || siteConfig.name;

  return (
    <div className="space-y-5" data-testid="admin-branding">
      <Card title={tr("Site name", "اسم الموقع")} testid="brand-name">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block font-medium">{tr("Name (English)", "الاسم (بالإنجليزية)")}<input value={d.nameEn} maxLength={60} placeholder={siteConfig.name} onChange={(e) => setD({ ...d, nameEn: e.target.value })} className={input} data-testid="brand-name-en" /></label>
          <label className="block font-medium">{tr("Name (Arabic)", "الاسم (بالعربية)")}<input dir="rtl" value={d.nameAr} maxLength={60} placeholder={tr("Same as English if empty", "مثل الإنجليزي إذا تُرك فارغًا")} onChange={(e) => setD({ ...d, nameAr: e.target.value })} className={input} data-testid="brand-name-ar" /></label>
          <label className="block font-medium">{tr("Short tagline (English)", "شعار قصير (بالإنجليزية)")}<input value={d.taglineEn} maxLength={140} placeholder="Student learning platform" onChange={(e) => setD({ ...d, taglineEn: e.target.value })} className={input} /></label>
          <label className="block font-medium">{tr("Short tagline (Arabic)", "شعار قصير (بالعربية)")}<input dir="rtl" value={d.taglineAr} maxLength={140} placeholder="منصة تعليمية للطلاب" onChange={(e) => setD({ ...d, taglineAr: e.target.value })} className={input} /></label>
        </div>
        <p className="text-xs text-muted">{tr("Shown in the website header and footer, the Admin menu, the sign-in page and browser tab titles. Leave empty to keep the original. The logo and favicon are changed in Settings → Branding uploads.", "يظهر في رأس الموقع وتذييله وقائمة الإدارة وصفحة الدخول وعناوين التبويبات. اتركه فارغًا للإبقاء على الأصلي.")}</p>
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
            <span className="h-8 w-8 rounded-full border-2 bg-white" style={{ borderColor: sun }} />
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

      <Card title={tr("Website address (domain)", "عنوان الموقع (النطاق)")} testid="brand-domain">
        <ul className="space-y-1">
          <li>{tr("Main address:", "العنوان الرئيسي:")} <b dir="ltr">{mainHost}</b> {!saved.canonical && <span className="text-xs text-muted">{tr("(also shaiqmuhammad.com)", "(وأيضًا shaiqmuhammad.com)")}</span>}</li>
          <li>{tr("You're on:", "أنت على:")} <b dir="ltr">{here}</b></li>
        </ul>
        <p className="text-muted">{tr("The main address is used in student login QR codes, classroom join links, timetable QR codes and links in emails. shaiqmuhammad.com keeps working either way.", "يُستخدم العنوان الرئيسي في رموز QR لدخول الطلاب وروابط الانضمام والجدول وروابط البريد. يبقى shaiqmuhammad.com يعمل في كل الأحوال.")}</p>
        <div className="max-w-md">
          <label className="block font-medium">{tr("New address you want", "العنوان الجديد الذي تريده")}<input dir="ltr" value={dom} onChange={(e) => setDom(e.target.value)} placeholder="www.myschool.com" className={input} data-testid="brand-domain-input" /></label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={domBusy || !dom.trim()} onClick={() => checkDomain(false)} data-testid="brand-domain-check">{domBusy ? tr("Checking…", "جارٍ التحقق…") : tr("Check & use", "تحقق واستخدم")}</button>
            {saved.canonical && <button type="button" className={btn2} disabled={domBusy} onClick={() => checkDomain(true)}>{tr("Use www.shaiqmuhammad.com again", "العودة إلى www.shaiqmuhammad.com")}</button>}
          </div>
        </div>
        {domMsg && <p className={`rounded-lg px-3 py-2 ${domMsg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"}`} role="status" data-testid="brand-domain-msg">{domMsg.text}</p>}
        <div className="rounded-xl bg-black/[0.03] p-4 dark:bg-white/5">
          <p className="font-bold">{tr("How to change the domain — step by step", "كيف تغيّر النطاق — خطوة بخطوة")}</p>
          <ol className="mt-2 list-decimal space-y-1.5 ps-5">
            <li>{tr("Buy the new name (for example myschool.com) from a registrar such as Cloudflare, GoDaddy or Namecheap.", "اشترِ الاسم الجديد (مثل myschool.com) من مسجّل نطاقات مثل Cloudflare أو GoDaddy أو Namecheap.")}</li>
            <li>{tr("Connect it to this website in Cloudflare: Workers & Pages → the website project → Custom domains → Set up a custom domain, and add both myschool.com and www.myschool.com. Cloudflare shows the DNS records to add (it does this for you if the domain is on Cloudflare).", "اربطه بالموقع في Cloudflare: Workers & Pages ← مشروع الموقع ← Custom domains ← أضف myschool.com و www.myschool.com. يعرض Cloudflare سجلات DNS المطلوبة.")}</li>
            <li>{tr("Wait until the new address opens this website with a padlock (usually a few minutes, sometimes up to a day).", "انتظر حتى يفتح العنوان الجديد هذا الموقع بعلامة القفل (عادة دقائق، وأحيانًا حتى يوم).")}</li>
            <li>{tr("Type it above and press \"Check & use\". It is only saved once it really opens this website, so links never break.", "اكتبه أعلاه واضغط \"تحقق واستخدم\". لا يُحفظ إلا بعد أن يفتح الموقع فعلًا، حتى لا تنكسر الروابط.")}</li>
            <li>{tr("Keep shaiqmuhammad.com renewed for a while so old printed QR codes and bookmarks keep working.", "جدّد shaiqmuhammad.com لفترة حتى تبقى رموز QR المطبوعة والروابط القديمة تعمل.")}</li>
          </ol>
          <p className="mt-3 rounded-lg bg-sun/30 px-3 py-2 text-heading">💬 {tr("Prefer not to touch Cloudflare? Ask your assistant: \"connect my new domain myschool.com\" — it can add the domain in Cloudflare, allow it on the school server and check everything for you. No passwords or Cloudflare keys are stored in this website.", "لا تريد التعامل مع Cloudflare؟ اطلب من مساعدك: \"اربط نطاقي الجديد\" — يمكنه إضافته في Cloudflare والسماح به في خادم المدرسة والتحقق من كل شيء. لا تُحفظ أي كلمات مرور أو مفاتيح Cloudflare في هذا الموقع.")}</p>
        </div>
      </Card>
    </div>
  );
}
