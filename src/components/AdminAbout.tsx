"use client";

import { useState } from "react";
import { defaultAbout, fav, GITHUB_ABOUT_PATH, normalizeAbout, type AboutData, type AboutItem, type AboutSection } from "@/lib/about";
import { getStoredGithubToken, publishJsonToGithub } from "@/lib/githubPublish";
import { useI18n } from "@/lib/i18n";

type Props = { setStatus: (s: string) => void; onNeedToken: () => void; data: AboutData; setData: React.Dispatch<React.SetStateAction<AboutData>> };
const input = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-black/10 disabled:opacity-30 dark:hover:bg-white/10";
const pill = "inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10";
const swap = <T,>(a: T[], i: number, d: -1 | 1) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; };

/** Shrink an uploaded logo to a 128px PNG data URL so it can live inside about.json. */
async function logoDataUrl(f: File): Promise<string> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement("canvas"); const k = Math.min(1, 128 / Math.max(img.width, img.height));
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

/** Admin → About: the public About page (hero + sections + entries), stored in about.json. */
export default function AdminAbout({ setStatus, onNeedToken, data, setData }: Props) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState<string | null>(null);
  const [item, setItem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const h = data.hero;
  const setHero = (p: Partial<AboutData["hero"]>) => setData((d) => ({ ...d, hero: { ...d.hero, ...p } }));
  const setSec = (id: string, p: Partial<AboutSection>) => setData((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const setItemOf = (sid: string, iid: string, p: Partial<AboutItem>) => setData((d) => ({ ...d, sections: d.sections.map((s) => (s.id === sid ? { ...s, items: s.items.map((x) => (x.id === iid ? { ...x, ...p } : x)) } : s)) }));
  const nextId = (pre: string, used: string[]) => { let n = used.length + 1; while (used.includes(`${pre}${n}`)) n++; return `${pre}${n}`; };
  const publish = async () => {
    const token = getStoredGithubToken();
    if (!token) { onNeedToken(); return; }
    setBusy(true);
    const r = await publishJsonToGithub(GITHUB_ABOUT_PATH, normalizeAbout(data), token, "chore(about): publish about.json");
    setBusy(false);
    setStatus(r.ok ? tr("About page published — live in about a minute.", "تم نشر صفحة نبذة عني — تظهر خلال دقيقة تقريبًا.") : tr(`Publish failed: ${r.error || "error"}`, `فشل النشر: ${r.error || "خطأ"}`));
  };
  const pair = (label: string, en: string, ar: string | undefined, onEn: (v: string) => void, onAr: (v: string) => void, area = false) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block text-xs font-semibold opacity-80">{label} (EN){area ? <textarea className={input + " min-h-28"} value={en} onChange={(e) => onEn(e.target.value)} /> : <input className={input} value={en} onChange={(e) => onEn(e.target.value)} />}</label>
      <label className="block text-xs font-semibold opacity-80">{label} (AR){area ? <textarea className={input + " min-h-28"} dir="rtl" value={ar || ""} onChange={(e) => onAr(e.target.value)} /> : <input className={input} dir="rtl" value={ar || ""} onChange={(e) => onAr(e.target.value)} />}</label>
    </div>
  );

  return (
    <section className="space-y-5" data-testid="admin-about">
      <header className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold">{tr("About page", "صفحة نبذة عني")}</h2>
          <p className="text-sm opacity-70">{tr("Everything on /about: your intro and each section (experience, education…). Publish to go live.", "كل ما في صفحة /about: التعريف وكل قسم (الخبرات، التعليم…). انشر لتظهر التغييرات.")}</p>
        </div>
        <button type="button" className={pill} onClick={() => { if (confirm(tr("Reset to the CV version?", "إعادة إلى نسخة السيرة الذاتية؟"))) setData(defaultAbout()); }}>↺ {tr("Reset", "إعادة ضبط")}</button>
        <a className={pill} href="/about" target="_blank" rel="noopener">↗ {tr("View", "عرض")}</a>
        <button type="button" className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b] shadow-sm disabled:opacity-60" disabled={busy} onClick={publish} data-testid="about-publish">{busy ? "…" : tr("Publish About", "نشر الصفحة")}</button>
      </header>

      <div className="space-y-3 rounded-3xl border border-black/10 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h3 className="font-extrabold">👤 {tr("Intro (hero)", "التعريف")}</h3>
        {pair(tr("Name", "الاسم"), h.name, h.nameAr, (v) => setHero({ name: v }), (v) => setHero({ nameAr: v }))}
        {pair(tr("Title", "المسمى"), h.title, h.titleAr, (v) => setHero({ title: v }), (v) => setHero({ titleAr: v }))}
        {pair(tr("Location", "الموقع"), h.location || "", h.locationAr, (v) => setHero({ location: v }), (v) => setHero({ locationAr: v }))}
        {pair(tr("Short bio", "نبذة قصيرة"), h.bio, h.bioAr, (v) => setHero({ bio: v }), (v) => setHero({ bioAr: v }), true)}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-semibold opacity-80">{tr("Photo / logo URL", "رابط الصورة / الشعار")}<input className={input} dir="ltr" value={h.photo} onChange={(e) => setHero({ photo: e.target.value })} /></label>
          <label className="block text-xs font-semibold opacity-80">{tr("Public email", "البريد العام")}<input className={input} dir="ltr" value={h.email} onChange={(e) => setHero({ email: e.target.value })} /></label>
        </div>
        <p className="text-xs opacity-60">{tr("Privacy: keep phone numbers, home address, date of birth and ID numbers off this public page.", "الخصوصية: لا تضع رقم الهاتف أو العنوان أو تاريخ الميلاد أو أرقام الهوية في هذه الصفحة العامة.")}</p>
      </div>

      <ol className="space-y-2">
        {data.sections.map((s, i) => (
          <li key={s.id} className={`rounded-2xl border bg-white/80 shadow-sm dark:bg-white/5 ${s.hidden ? "border-dashed opacity-60" : "border-black/10 dark:border-white/10"}`} data-testid="about-sec">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-xl" aria-hidden>{s.icon || "•"}</span>
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                <span className="block truncate font-bold">{(lang === "ar" && s.titleAr) || s.title || tr("(untitled)", "(بدون عنوان)")}{s.hidden && <span className="ms-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{tr("Hidden", "مخفي")}</span>}</span>
                <span className="block text-xs opacity-60">{s.items.length} {tr("entries", "عناصر")} · {s.kind}</span>
              </button>
              <button type="button" className={iconBtn} disabled={i === 0} onClick={() => setData((d) => ({ ...d, sections: swap(d.sections, i, -1) }))} title={tr("Move up", "للأعلى")} aria-label={tr("Move up", "للأعلى")}>▲</button>
              <button type="button" className={iconBtn} disabled={i === data.sections.length - 1} onClick={() => setData((d) => ({ ...d, sections: swap(d.sections, i, 1) }))} title={tr("Move down", "للأسفل")} aria-label={tr("Move down", "للأسفل")}>▼</button>
              <button type="button" className={iconBtn} onClick={() => setSec(s.id, { hidden: !s.hidden })} title={s.hidden ? tr("Show", "إظهار") : tr("Hide", "إخفاء")} aria-label={s.hidden ? tr("Show", "إظهار") : tr("Hide", "إخفاء")}>{s.hidden ? "🙈" : "👁"}</button>
              <button type="button" className={iconBtn} onClick={() => setOpen(open === s.id ? null : s.id)} title={tr("Edit", "تعديل")} aria-label={tr("Edit", "تعديل")}>✏️</button>
              <button type="button" className={iconBtn + " text-rose-600"} onClick={() => { if (confirm(tr("Delete this section?", "حذف هذا القسم؟"))) setData((d) => ({ ...d, sections: d.sections.filter((x) => x.id !== s.id) })); }} title={tr("Delete", "حذف")} aria-label={tr("Delete", "حذف")}>🗑</button>
            </div>
            {open === s.id && (
              <div className="space-y-3 border-t border-black/5 px-4 py-4 dark:border-white/10">
                {pair(tr("Section title", "عنوان القسم"), s.title, s.titleAr, (v) => setSec(s.id, { title: v }), (v) => setSec(s.id, { titleAr: v }))}
                <div className="grid gap-2 sm:grid-cols-[6rem_12rem]">
                  <label className="block text-xs font-semibold opacity-80">{tr("Icon", "أيقونة")}<input className={input} value={s.icon || ""} maxLength={4} onChange={(e) => setSec(s.id, { icon: e.target.value })} /></label>
                  <label className="block text-xs font-semibold opacity-80">{tr("Layout", "التخطيط")}<select className={input} value={s.kind} onChange={(e) => setSec(s.id, { kind: e.target.value as AboutSection["kind"] })}>
                    <option value="timeline">{tr("Timeline", "خط زمني")}</option><option value="cards">{tr("Cards", "بطاقات")}</option><option value="chips">{tr("Chips (short items)", "وسوم قصيرة")}</option><option value="links">{tr("Links", "روابط")}</option><option value="text">{tr("Text only", "نص فقط")}</option>
                  </select></label>
                </div>
                {pair(tr("Intro text (optional)", "نص تمهيدي (اختياري)"), s.text || "", s.textAr, (v) => setSec(s.id, { text: v }), (v) => setSec(s.id, { textAr: v }), true)}
                <ul className="space-y-2">
                  {s.items.map((it, j) => (
                    <li key={it.id} className="rounded-2xl border border-black/10 dark:border-white/15">
                      <div className="flex items-center gap-2 px-3 py-2">
                        {it.logo
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={it.logo} alt="" className="h-7 w-7 rounded-lg border object-contain" />
                          : <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-header text-[10px] font-bold text-sun">{(it.monogram || it.title).slice(0, 3)}</span>}
                        <button type="button" className="min-w-0 flex-1 truncate text-start text-sm font-semibold" onClick={() => setItem(item === it.id ? null : it.id)}>{it.title || tr("(untitled)", "(بدون عنوان)")}{it.period ? <span className="font-normal opacity-60"> · {it.period}</span> : null}</button>
                        <button type="button" className={iconBtn} disabled={j === 0} onClick={() => setSec(s.id, { items: swap(s.items, j, -1) })} aria-label={tr("Move up", "للأعلى")}>▲</button>
                        <button type="button" className={iconBtn} disabled={j === s.items.length - 1} onClick={() => setSec(s.id, { items: swap(s.items, j, 1) })} aria-label={tr("Move down", "للأسفل")}>▼</button>
                        <button type="button" className={iconBtn} onClick={() => setItem(item === it.id ? null : it.id)} aria-label={tr("Edit", "تعديل")}>✏️</button>
                        <button type="button" className={iconBtn + " text-rose-600"} onClick={() => { if (confirm(tr("Delete this entry?", "حذف هذا العنصر؟"))) setSec(s.id, { items: s.items.filter((x) => x.id !== it.id) }); }} aria-label={tr("Delete", "حذف")}>🗑</button>
                      </div>
                      {item === it.id && (
                        <div className="space-y-2 border-t border-black/5 p-3 dark:border-white/10">
                          {pair(tr("Title", "العنوان"), it.title, it.titleAr, (v) => setItemOf(s.id, it.id, { title: v }), (v) => setItemOf(s.id, it.id, { titleAr: v }))}
                          {s.kind !== "chips" && <>
                            {pair(tr("Organisation", "الجهة"), it.org || "", it.orgAr, (v) => setItemOf(s.id, it.id, { org: v }), (v) => setItemOf(s.id, it.id, { orgAr: v }))}
                            {pair(tr("Dates", "التاريخ"), it.period || "", it.periodAr, (v) => setItemOf(s.id, it.id, { period: v }), (v) => setItemOf(s.id, it.id, { periodAr: v }))}
                            {pair(tr("Location", "الموقع"), it.location || "", it.locationAr, (v) => setItemOf(s.id, it.id, { location: v }), (v) => setItemOf(s.id, it.id, { locationAr: v }))}
                            {pair(tr("Details", "التفاصيل"), it.text || "", it.textAr, (v) => setItemOf(s.id, it.id, { text: v }), (v) => setItemOf(s.id, it.id, { textAr: v }), true)}
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="block text-xs font-semibold opacity-80">{tr("Website link", "رابط الموقع")}<input className={input} dir="ltr" value={it.url || ""} onChange={(e) => setItemOf(s.id, it.id, { url: e.target.value })} /></label>
                              <label className="block text-xs font-semibold opacity-80">{tr("Monogram (if no logo)", "حروف بديلة (بدون شعار)")}<input className={input} maxLength={6} value={it.monogram || ""} onChange={(e) => setItemOf(s.id, it.id, { monogram: e.target.value })} /></label>
                            </div>
                            <div className="flex flex-wrap items-end gap-2">
                              <label className="block min-w-[14rem] flex-1 text-xs font-semibold opacity-80">{tr("Logo URL", "رابط الشعار")}<input className={input} dir="ltr" value={it.logo?.startsWith("data:") ? tr("(uploaded image)", "(صورة مرفوعة)") : it.logo || ""} onChange={(e) => setItemOf(s.id, it.id, { logo: e.target.value })} /></label>
                              <label className={pill + " cursor-pointer"}>⬆ {tr("Upload logo", "رفع شعار")}<input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setItemOf(s.id, it.id, { logo: await logoDataUrl(f) }); }} /></label>
                              {it.url && <button type="button" className={pill} onClick={() => { try { setItemOf(s.id, it.id, { logo: fav(new URL(it.url!).hostname) }); } catch { /* bad URL */ } }}>🌐 {tr("Use website logo", "شعار الموقع")}</button>}
                              {it.logo && <button type="button" className={pill} onClick={() => setItemOf(s.id, it.id, { logo: "" })}>✕ {tr("No logo", "بدون شعار")}</button>}
                            </div>
                          </>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <button type="button" className={pill} onClick={() => { const id = nextId("i", s.items.map((x) => x.id)); setSec(s.id, { items: [...s.items, { id, title: "" }] }); setItem(id); }}>+ {tr("Add entry", "إضافة عنصر")}</button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <button type="button" className={pill} onClick={() => { const id = nextId("sec", data.sections.map((x) => x.id)); setData((d) => ({ ...d, sections: [...d.sections, { id, kind: "cards", title: tr("New section", "قسم جديد"), icon: "⭐", items: [] }] })); setOpen(id); }} data-testid="about-add-sec">+ {tr("Add section", "إضافة قسم")}</button>
    </section>
  );
}
