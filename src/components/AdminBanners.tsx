"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  emptyBanner, GITHUB_BANNERS_PATH, isBannerVisible, normalizeBanner, normalizeBanners, type Banner, type BannersData,
} from "@/lib/banners";
import { downloadJson, getStoredGithubToken, publishJsonToGithub } from "@/lib/githubPublish";
import { useI18n } from "@/lib/i18n";

type Props = {
  setStatus: (s: string) => void;
  onNeedToken: () => void;
  data: BannersData;
  setData: React.Dispatch<React.SetStateAction<BannersData>>;
};

const input = "mt-1.5 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "btn-glass px-3 py-1.5 text-sm";
const iconBtn = "pill h-8 min-w-8 justify-center px-2 text-sm disabled:opacity-40";

/** Admin → Announcements: the home page slider. Add, edit, hide/show, delete and reorder slides. */
export default function AdminBanners({ setStatus, onNeedToken, data, setData }: Props) {
  const [editing, setEditing] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);

  const sorted = useMemo(
    () => [...data.banners].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    [data.banners],
  );
  const visibleCount = sorted.filter(isBannerVisible).length;

  function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.title.trim() && !editing.subtitle.trim() && !editing.imageUrl.trim()) {
      setStatus(tr("Add a title, some text or an image.", "أضف عنوانًا أو نصًا أو صورة."));
      return;
    }
    const next = normalizeBanner({ ...editing, title: editing.title.trim(), subtitle: editing.subtitle.trim(), imageUrl: editing.imageUrl.trim() }, editing.order);
    setData((prev) => ({
      banners: prev.banners.some((b) => b.id === next.id)
        ? prev.banners.map((b) => (b.id === next.id ? next : b))
        : [...prev.banners, next],
    }));
    setEditing(null);
    setStatus(tr(`Saved "${next.title || "announcement"}" locally. Click "Publish announcements" (or Publish all) to go live.`, `تم حفظ «${next.title || "الإعلان"}» محليًا. اضغط «نشر الإعلانات» (أو نشر الكل) لنشره.`));
  }

  function move(id: string, dir: -1 | 1) {
    const list = [...sorted];
    const i = list.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setData({ banners: list.map((b, order) => ({ ...b, order })) });
  }

  function toggleHidden(b: Banner) {
    const show = !isBannerVisible(b);
    // Showing also re-publishes an old draft; hiding uses the optional `hidden` flag.
    const next = show ? normalizeBanner({ ...b, hidden: false, published: true }, b.order) : normalizeBanner({ ...b, hidden: true }, b.order);
    setData((prev) => ({ banners: prev.banners.map((x) => (x.id === b.id ? next : x)) }));
    setStatus(show ? tr(`"${b.title || "Announcement"}" will show on the site after you publish.`, `سيظهر «${b.title || "الإعلان"}» على الموقع بعد النشر.`) : tr(`"${b.title || "Announcement"}" hidden. Publish to apply.`, `تم إخفاء «${b.title || "الإعلان"}». انشر للتطبيق.`));
  }

  function remove(b: Banner) {
    if (!confirm(tr(`Delete the announcement "${b.title || "(untitled)"}"? This can't be undone after you publish.`, `حذف الإعلان «${b.title || "(بدون عنوان)"}»؟ لا يمكن التراجع بعد النشر.`))) return;
    setData((prev) => ({ banners: prev.banners.filter((x) => x.id !== b.id).map((x, order) => ({ ...x, order })) }));
    if (editing?.id === b.id) setEditing(null);
  }

  async function publish() {
    const token = getStoredGithubToken();
    if (!token) { setStatus(tr("Publishing isn't connected on this device — open Settings.", "النشر غير متصل على هذا الجهاز — افتح الإعدادات.")); onNeedToken(); return; }
    setBusy(true); setStatus(tr("Publishing announcements…", "جارٍ نشر الإعلانات…"));
    const payload = normalizeBanners({ banners: sorted.map((b, order) => ({ ...b, order })) });
    const r = await publishJsonToGithub(GITHUB_BANNERS_PATH, payload, token, "chore(banners): update announcements via admin");
    setBusy(false);
    setStatus(r.ok ? tr(`Published announcements. The site rebuilds in ~1–2 min. ${r.htmlUrl || ""}`, `تم نشر الإعلانات. يُعاد بناء الموقع خلال دقيقة أو دقيقتين. ${r.htmlUrl || ""}`) : r.error);
  }

  function onFile(file: File | undefined) {
    if (!file || !editing) return;
    if (!file.type.startsWith("image/")) { setStatus(tr("Please choose an image file.", "اختر ملف صورة.")); return; }
    if (file.size > 1_500_000) { setStatus(tr("Image too large (keep under ~1.5MB) or use a hosted URL.", "الصورة كبيرة جدًا (أقل من 1.5 ميغابايت) أو استخدم رابطًا.")); return; }
    const reader = new FileReader();
    reader.onload = () => setEditing({ ...editing, imageUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  return (
    <section className="space-y-4" data-testid="admin-announcements">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{tr("Announcements", "الإعلانات")}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => downloadJson(normalizeBanners(data), "banners.json")}>{tr("Download", "تنزيل")}</button>
          <button type="button" disabled={busy} className={btn} onClick={publish}>{tr("Publish announcements", "نشر الإعلانات")}</button>
          <button type="button" className={btn} data-testid="add-announcement" onClick={() => setEditing({ ...emptyBanner(), order: data.banners.length })}>{tr("+ Announcement", "+ إعلان")}</button>
        </div>
      </div>
      <p className="text-xs text-muted">
        {tr(
          `The "Announcements" slider at the top of the home page. ${visibleCount} of ${sorted.length} showing. Hidden slides stay here but don't appear on the site; with none showing, the section is hidden.`,
          `شريط «الإعلانات» أعلى الصفحة الرئيسية. يظهر ${visibleCount} من ${sorted.length}. الشرائح المخفية تبقى هنا ولا تظهر في الموقع؛ وإذا لم يظهر أي منها يُخفى القسم.`,
        )}
      </p>

      {editing && (
        <form onSubmit={save} className="space-y-3 rounded-2xl bg-card p-5" data-testid="announcement-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr("Title", "العنوان")}><input className={input} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} data-testid="ann-title" /></Field>
            <Field label={tr("Arabic title (optional)", "العنوان بالعربية (اختياري)")}><input dir="rtl" className={input} value={editing.titleAr || ""} onChange={(e) => setEditing({ ...editing, titleAr: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr("Text", "النص")}><textarea className={input + " min-h-16"} value={editing.subtitle} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} data-testid="ann-text" /></Field>
            <Field label={tr("Arabic text (optional)", "النص بالعربية (اختياري)")}><textarea dir="rtl" className={input + " min-h-16"} value={editing.subtitleAr || ""} onChange={(e) => setEditing({ ...editing, subtitleAr: e.target.value })} /></Field>
          </div>
          <Field label={tr("Image URL or data:image/… (optional — without one the slide uses a navy background)", "رابط الصورة (اختياري — بدونها تظهر خلفية كحلية)")}>
            <input className={input} value={editing.imageUrl} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} placeholder="https://…" />
          </Field>
          <label className="block text-sm font-medium">
            {tr("Or upload an image", "أو ارفع صورة")}
            <input type="file" accept="image/*" className="mt-1.5 block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {editing.imageUrl && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={editing.imageUrl} alt="" className="max-h-40 rounded-xl border border-card-border object-cover" />
              <button type="button" className="text-sm text-red-600" onClick={() => setEditing({ ...editing, imageUrl: "" })}>{tr("Remove image", "إزالة الصورة")}</button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={tr("Button label (optional)", "نص الزر (اختياري)")}><input className={input} value={editing.buttonText} onChange={(e) => setEditing({ ...editing, buttonText: e.target.value })} /></Field>
            <Field label={tr("Arabic button label", "نص الزر بالعربية")}><input dir="rtl" className={input} value={editing.buttonTextAr || ""} onChange={(e) => setEditing({ ...editing, buttonTextAr: e.target.value })} /></Field>
            <Field label={tr("Link (optional)", "الرابط (اختياري)")}><input className={input} value={editing.buttonHref} onChange={(e) => setEditing({ ...editing, buttonHref: e.target.value })} placeholder="/assessments" dir="ltr" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!editing.hidden && editing.published} onChange={(e) => setEditing({ ...editing, hidden: !e.target.checked, published: e.target.checked ? true : editing.published })} />
            {tr("Show on the website", "إظهار على الموقع")}
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btn} data-testid="ann-save">{tr("Save announcement", "حفظ الإعلان")}</button>
            <button type="button" className="text-sm text-muted" onClick={() => setEditing(null)}>{tr("Cancel", "إلغاء")}</button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-card-border rounded-2xl bg-card" data-testid="announcement-list">
        {sorted.length === 0 && <li className="px-4 py-3 text-sm text-muted">{tr("No announcements yet.", "لا توجد إعلانات بعد.")}</li>}
        {sorted.map((b, i) => {
          const visible = isBannerVisible(b);
          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="announcement-row">
              <div className="flex min-w-0 items-center gap-3">
                {b.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.imageUrl} alt="" className={`h-12 w-20 shrink-0 rounded-lg border border-card-border object-cover ${visible ? "" : "opacity-50 grayscale"}`} />
                ) : (
                  <span className={`h-12 w-20 shrink-0 rounded-lg bg-gradient-to-br from-navy to-navy-deep ${visible ? "" : "opacity-50"}`} aria-hidden />
                )}
                <div className="min-w-0">
                  <p className={`truncate font-medium ${visible ? "" : "text-muted line-through decoration-1"}`}>{b.title || tr("(untitled)", "(بدون عنوان)")}</p>
                  <p className="text-xs text-muted">{visible ? tr("Showing", "ظاهر") : tr("Hidden", "مخفي")} · {tr("slide", "الشريحة")} {i + 1}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(b.id, -1)} aria-label={tr("Move up", "تحريك لأعلى")} title={tr("Move up", "تحريك لأعلى")}>↑</button>
                <button type="button" className={iconBtn} disabled={i === sorted.length - 1} onClick={() => move(b.id, 1)} aria-label={tr("Move down", "تحريك لأسفل")} title={tr("Move down", "تحريك لأسفل")}>↓</button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={visible}
                  data-testid="ann-toggle"
                  onClick={() => toggleHidden(b)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${visible ? "border-emerald-700/30 bg-emerald-600 text-white" : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"}`}
                >
                  {visible ? `👁 ${tr("Shown", "ظاهر")}` : `🚫 ${tr("Hidden", "مخفي")}`}
                </button>
                <button type="button" className="px-2 text-primary" onClick={() => setEditing({ ...b })}>{tr("Edit", "تعديل")}</button>
                <button type="button" className="px-2 text-red-600" data-testid="ann-delete" onClick={() => remove(b)}>{tr("Delete", "حذف")}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}
