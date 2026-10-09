"use client";

import { useState } from "react";
import {
  BUILTIN_FIELDS, CUSTOM_KINDS, defaultHomepage, GITHUB_HOMEPAGE_PATH, isBuiltin, normalizeHomepage,
  type CustomKind, type HomeCard, type HomepageData, type HomeSection,
} from "@/lib/homepage";
import { getStoredGithubToken, publishJsonToGithub } from "@/lib/githubPublish";
import { useI18n } from "@/lib/i18n";

type Props = { setStatus: (s: string) => void; onNeedToken: () => void; data: HomepageData; setData: React.Dispatch<React.SetStateAction<HomepageData>> };

const input = "mt-1 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm hover:bg-black/10 disabled:opacity-30 dark:hover:bg-white/10";
const pill = "inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10";

/** Admin → Homepage: order, show/hide, edit and add sections of the public home page (homepage.json). */
export default function AdminHomepage({ setStatus, onNeedToken, data, setData }: Props) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const NAMES: Record<string, [string, string, string]> = {
    banners: ["Banner slider", "شريط اللافتات", "🖼️"], intro: ["Welcome intro", "مقدمة الترحيب", "👋"], lms: ["Student & teacher area card", "بطاقة منطقة الطلاب والمعلمين", "🎒"],
    assessments: ["Assessments slider", "شريط التقييمات", "📝"], libraries: ["Learning libraries", "المكتبات التعليمية", "📚"], teacher: ["Teacher card", "بطاقة المعلم", "🧑‍🏫"],
    videos: ["Video lessons slider", "شريط دروس الفيديو", "🎬"], lessons: ["Learning pages slider", "شريط صفحات التعلم", "📄"],
    text: ["Text block", "كتلة نص", "🔤"], imageText: ["Image + text", "صورة + نص", "🖼️"], cta: ["Call to action", "دعوة لإجراء", "📣"], youtube: ["YouTube video", "فيديو يوتيوب", "▶️"], cards: ["Cards grid", "شبكة بطاقات", "🗂️"],
  };
  const nm = (k: string) => tr(NAMES[k]?.[0] || k, NAMES[k]?.[1] || k);
  const list = data.sections;
  const patch = (id: string, p: Partial<HomeSection>) => setData((d) => ({ sections: d.sections.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const move = (i: number, dir: -1 | 1) => setData((d) => { const a = [...d.sections]; const j = i + dir; if (j < 0 || j >= a.length) return d; [a[i], a[j]] = [a[j], a[i]]; return { sections: a }; });
  const remove = (s: HomeSection) => {
    if (isBuiltin(s.kind)) { patch(s.id, { hidden: true }); return; }
    if (confirm(tr("Delete this section?", "حذف هذا القسم؟"))) setData((d) => ({ sections: d.sections.filter((x) => x.id !== s.id) }));
  };
  const add = (kind: CustomKind) => {
    let n = list.length + 1;
    while (list.some((x) => x.id === `s_${n}`)) n++;
    const id = `s_${n}`;
    const base: HomeSection = { id, kind, title: tr("New section", "قسم جديد") };
    if (kind === "cards") base.cards = [{ title: "Card 1" }, { title: "Card 2" }, { title: "Card 3" }];
    if (kind === "cta") base.button = { label: "Get started", href: "/assessments" };
    setData((d) => ({ sections: [...d.sections, base] }));
    setOpen(id);
    setAdding(false);
  };
  const publish = async () => {
    const token = getStoredGithubToken();
    if (!token) { onNeedToken(); return; }
    setBusy(true);
    const r = await publishJsonToGithub(GITHUB_HOMEPAGE_PATH, normalizeHomepage(data), token, "chore(home): publish homepage.json");
    setBusy(false);
    setStatus(r.ok ? tr("Homepage published — live in about a minute.", "تم نشر الصفحة الرئيسية — تظهر خلال دقيقة تقريبًا.") : tr(`Publish failed: ${r.error || "error"}`, `فشل النشر: ${r.error || "خطأ"}`));
  };

  const field = (s: HomeSection, k: "eyebrow" | "title" | "text", label: string, area = false) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {(["", "Ar"] as const).map((suf) => {
        const key = (k + suf) as keyof HomeSection;
        const v = String(s[key] ?? "");
        const L = `${label} (${suf ? "AR" : "EN"})`;
        return (
          <label key={suf} className="block text-xs font-semibold opacity-80">{L}
            {area ? <textarea className={input + " min-h-24"} dir={suf ? "rtl" : "auto"} value={v} onChange={(e) => patch(s.id, { [key]: e.target.value })} />
              : <input className={input} dir={suf ? "rtl" : "auto"} value={v} onChange={(e) => patch(s.id, { [key]: e.target.value })} />}
          </label>
        );
      })}
    </div>
  );

  const editor = (s: HomeSection) => {
    const f = isBuiltin(s.kind) ? BUILTIN_FIELDS[s.kind] : (["eyebrow", "title", "text", "button", "image", "count"] as const).filter((x) => !(x === "count") && !(x === "image" && s.kind !== "imageText") && !(x === "button" && (s.kind === "youtube" || s.kind === "cards")));
    if (!f.length && s.kind !== "youtube" && s.kind !== "cards") return <p className="text-sm opacity-70">{tr("This section has no editable text — its content comes from its own admin tab. You can move or hide it.", "لا يحتوي هذا القسم على نص قابل للتعديل — محتواه من تبويبه الخاص. يمكنك نقله أو إخفاؤه.")}</p>;
    return (
      <div className="space-y-3">
        {isBuiltin(s.kind) && <p className="text-xs opacity-60">{tr("Leave a field empty to keep the default text.", "اترك الحقل فارغًا للإبقاء على النص الافتراضي.")}</p>}
        {f.includes("eyebrow") && field(s, "eyebrow", tr("Small label", "تسمية صغيرة"))}
        {f.includes("title") && field(s, "title", tr("Title", "العنوان"))}
        {f.includes("text") && field(s, "text", tr("Text", "النص"), true)}
        {f.includes("image") && (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <label className="block text-xs font-semibold opacity-80">{tr("Image URL", "رابط الصورة")}<input className={input} dir="ltr" value={s.image || ""} onChange={(e) => patch(s.id, { image: e.target.value })} placeholder="https://… or /covers/…" /></label>
            <label className="block text-xs font-semibold opacity-80">{tr("Image side", "جهة الصورة")}<select className={input} value={s.imageSide || "start"} onChange={(e) => patch(s.id, { imageSide: e.target.value as "start" | "end" })}><option value="start">{tr("Start", "البداية")}</option><option value="end">{tr("End", "النهاية")}</option></select></label>
          </div>
        )}
        {f.includes("button") && (
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-xs font-semibold opacity-80">{tr("Button (EN)", "الزر (EN)")}<input className={input} value={s.button?.label || ""} onChange={(e) => patch(s.id, { button: { href: s.button?.href || "", ...s.button, label: e.target.value } })} /></label>
            <label className="block text-xs font-semibold opacity-80">{tr("Button (AR)", "الزر (AR)")}<input className={input} dir="rtl" value={s.button?.labelAr || ""} onChange={(e) => patch(s.id, { button: { label: s.button?.label || "", href: s.button?.href || "", labelAr: e.target.value } })} /></label>
            <label className="block text-xs font-semibold opacity-80">{tr("Button link", "رابط الزر")}<input className={input} dir="ltr" value={s.button?.href || ""} placeholder="/assessments" onChange={(e) => patch(s.id, { button: { label: s.button?.label || "", labelAr: s.button?.labelAr, href: e.target.value } })} /></label>
          </div>
        )}
        {f.includes("count") && <label className="block w-40 text-xs font-semibold opacity-80">{tr("Items to show", "عدد العناصر")}<input type="number" min={1} max={24} className={input} value={s.count || 9} onChange={(e) => patch(s.id, { count: Math.max(1, Math.min(24, Number(e.target.value) || 9)) })} /></label>}
        {s.kind === "youtube" && <>{field(s, "title", tr("Title", "العنوان"))}<label className="block text-xs font-semibold opacity-80">{tr("YouTube link", "رابط يوتيوب")}<input className={input} dir="ltr" value={s.youtube || ""} onChange={(e) => patch(s.id, { youtube: e.target.value })} placeholder="https://youtu.be/…" /></label></>}
        {s.kind === "cards" && (
          <>
            {field(s, "title", tr("Title", "العنوان"))}
            <div className="space-y-2">
              {(s.cards || []).map((c, i) => {
                const set = (p: Partial<HomeCard>) => patch(s.id, { cards: (s.cards || []).map((x, j) => (j === i ? { ...x, ...p } : x)) });
                return (
                  <div key={i} className="grid gap-2 rounded-2xl border border-black/10 p-3 dark:border-white/15 sm:grid-cols-2">
                    <input className={input} placeholder={tr("Card title (EN)", "عنوان البطاقة (EN)")} value={c.title} onChange={(e) => set({ title: e.target.value })} />
                    <input className={input} dir="rtl" placeholder={tr("Card title (AR)", "عنوان البطاقة (AR)")} value={c.titleAr || ""} onChange={(e) => set({ titleAr: e.target.value })} />
                    <input className={input} placeholder={tr("Text (EN)", "النص (EN)")} value={c.text || ""} onChange={(e) => set({ text: e.target.value })} />
                    <input className={input} dir="rtl" placeholder={tr("Text (AR)", "النص (AR)")} value={c.textAr || ""} onChange={(e) => set({ textAr: e.target.value })} />
                    <input className={input} dir="ltr" placeholder={tr("Image URL", "رابط الصورة")} value={c.image || ""} onChange={(e) => set({ image: e.target.value })} />
                    <div className="flex gap-2"><input className={input} dir="ltr" placeholder={tr("Link", "الرابط")} value={c.href || ""} onChange={(e) => set({ href: e.target.value })} /><button type="button" className={iconBtn + " mt-1 text-rose-600"} title={tr("Remove card", "حذف البطاقة")} onClick={() => patch(s.id, { cards: (s.cards || []).filter((_, j) => j !== i) })}>🗑</button></div>
                  </div>
                );
              })}
              <button type="button" className={pill} onClick={() => patch(s.id, { cards: [...(s.cards || []), { title: "" }] })}>+ {tr("Add card", "إضافة بطاقة")}</button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <section className="space-y-5" data-testid="admin-homepage">
      <header className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold">{tr("Homepage builder", "منشئ الصفحة الرئيسية")}</h2>
          <p className="text-sm opacity-70">{tr("Order, show/hide and edit the sections of the home page, or add your own. Changes go live after Publish.", "رتّب أقسام الصفحة الرئيسية وأظهرها أو أخفها وعدّلها أو أضف أقسامك. تظهر التغييرات بعد النشر.")}</p>
        </div>
        <button type="button" className={pill} onClick={() => setAdding(!adding)} data-testid="home-add">＋ {tr("Add section", "إضافة قسم")}</button>
        <button type="button" className={pill} onClick={() => { if (confirm(tr("Reset to the default layout? Custom sections will be removed.", "إعادة التخطيط الافتراضي؟ ستُحذف الأقسام المخصصة."))) setData(defaultHomepage()); }}>↺ {tr("Reset", "إعادة ضبط")}</button>
        <a className={pill} href="/" target="_blank" rel="noopener">↗ {tr("View", "عرض")}</a>
        <button type="button" className="rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b] shadow-sm disabled:opacity-60" disabled={busy} onClick={publish} data-testid="home-publish">{busy ? "…" : tr("Publish homepage", "نشر الصفحة الرئيسية")}</button>
      </header>
      {adding && (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-sun bg-sun/10 p-3" data-testid="home-add-menu">
          {CUSTOM_KINDS.map((k) => <button key={k} type="button" className={pill} onClick={() => add(k)} data-testid={`home-add-${k}`}>{NAMES[k][2]} {nm(k)}</button>)}
        </div>
      )}
      <ol className="space-y-2" data-testid="home-sections">
        {list.map((s, i) => (
          <li key={s.id} className={`rounded-2xl border bg-white/80 shadow-sm backdrop-blur dark:bg-white/5 ${s.hidden ? "border-dashed border-black/15 opacity-60 dark:border-white/15" : "border-black/10 dark:border-white/10"}`} data-testid="home-section" data-kind={s.kind}>
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="w-6 text-center text-xs font-bold opacity-50">{i + 1}</span>
              <span className="text-xl" aria-hidden>{NAMES[s.kind]?.[2]}</span>
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                <span className="block truncate font-bold">{nm(s.kind)}{s.hidden && <span className="ms-2 rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/15">{tr("Hidden", "مخفي")}</span>}</span>
                {(s.title || s.titleAr) && <span className="block truncate text-xs opacity-60" dir="auto">{lang === "ar" ? s.titleAr || s.title : s.title || s.titleAr}</span>}
              </button>
              <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} title={tr("Move up", "للأعلى")} aria-label={tr("Move up", "للأعلى")} data-testid="home-up">▲</button>
              <button type="button" className={iconBtn} disabled={i === list.length - 1} onClick={() => move(i, 1)} title={tr("Move down", "للأسفل")} aria-label={tr("Move down", "للأسفل")} data-testid="home-down">▼</button>
              <button type="button" className={iconBtn} onClick={() => patch(s.id, { hidden: !s.hidden })} title={s.hidden ? tr("Show", "إظهار") : tr("Hide", "إخفاء")} aria-label={s.hidden ? tr("Show", "إظهار") : tr("Hide", "إخفاء")} data-testid="home-toggle">{s.hidden ? "🙈" : "👁"}</button>
              <button type="button" className={iconBtn} onClick={() => setOpen(open === s.id ? null : s.id)} title={tr("Edit", "تعديل")} aria-label={tr("Edit", "تعديل")}>✏️</button>
              {isBuiltin(s.kind) ? (s.hidden
                ? <button type="button" className={iconBtn} onClick={() => patch(s.id, { hidden: false })} title={tr("Restore", "استعادة")} aria-label={tr("Restore", "استعادة")}>↺</button>
                : <button type="button" className={iconBtn + " text-rose-600"} onClick={() => remove(s)} title={tr("Remove (built-in sections are hidden, restore any time)", "إزالة (الأقسام الأساسية تُخفى ويمكن استعادتها)")} aria-label={tr("Remove", "إزالة")}>🗑</button>)
                : <button type="button" className={iconBtn + " text-rose-600"} onClick={() => remove(s)} title={tr("Delete", "حذف")} aria-label={tr("Delete", "حذف")} data-testid="home-delete">🗑</button>}
            </div>
            {open === s.id && <div className="border-t border-black/5 px-4 py-4 dark:border-white/10">{editor(s)}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}
