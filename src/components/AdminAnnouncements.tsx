"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  GITHUB_ANNOUNCEMENTS_PATH, normalizeAnnouncements, normalizeTickerItem, visibleTickerItems,
  type AnnouncementsData, type TickerItem,
} from "@/lib/announcements";
import { newId } from "@/lib/content";
import { downloadJson, getStoredGithubToken, publishJsonToGithub } from "@/lib/githubPublish";
import { useI18n } from "@/lib/i18n";

type Props = {
  setStatus: (s: string) => void;
  onNeedToken: () => void;
  data: AnnouncementsData;
  setData: React.Dispatch<React.SetStateAction<AnnouncementsData>>;
};

const input = "mt-1.5 w-full rounded-xl border border-card-border bg-card-solid px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "btn-glass px-3 py-1.5 text-sm";
const iconBtn = "pill h-8 min-w-8 justify-center px-2 text-sm disabled:opacity-40";

/** Admin → Announcements: the scrolling "Announcement" strip above the site menu. */
export default function AdminAnnouncements({ setStatus, onNeedToken, data, setData }: Props) {
  const [editing, setEditing] = useState<TickerItem | null>(null);
  const [busy, setBusy] = useState(false);
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const items = data.items;
  const showing = visibleTickerItems(data).length;

  const update = (next: TickerItem[], enabled = data.enabled) =>
    setData(normalizeAnnouncements({ enabled, items: next.map((it, order) => ({ ...it, order })) }));

  function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const next = normalizeTickerItem(editing, editing.order);
    if (!next.text && !next.textAr) { setStatus(tr("Write the message first.", "اكتب الرسالة أولًا.")); return; }
    if (next.href && !/^(\/|https?:\/\/)/i.test(next.href)) { setStatus(tr("Links must start with / (a page on this site) or https://", "يجب أن يبدأ الرابط بـ / (صفحة في الموقع) أو https://")); return; }
    update(items.some((it) => it.id === next.id) ? items.map((it) => (it.id === next.id ? next : it)) : [...items, next]);
    setEditing(null);
    setStatus(tr("Saved locally. Click \"Publish announcements\" (or Publish all) to go live.", "تم الحفظ محليًا. اضغط «نشر الإعلانات» (أو نشر الكل) لنشرها."));
  }

  function move(id: string, dir: -1 | 1) {
    const list = [...items];
    const i = list.findIndex((it) => it.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    update(list);
  }

  function toggle(it: TickerItem) {
    update(items.map((x) => (x.id === it.id ? { ...x, hidden: !x.hidden } : x)));
  }

  function remove(it: TickerItem) {
    if (!confirm(tr(`Delete this announcement?\n\n"${it.text || it.textAr}"`, `حذف هذا الإعلان؟\n\n«${it.textAr || it.text}»`))) return;
    update(items.filter((x) => x.id !== it.id));
    if (editing?.id === it.id) setEditing(null);
  }

  async function publish() {
    const token = getStoredGithubToken();
    if (!token) { setStatus(tr("Publishing isn't connected on this device — open Settings.", "النشر غير متصل على هذا الجهاز — افتح الإعدادات.")); onNeedToken(); return; }
    setBusy(true); setStatus(tr("Publishing announcements…", "جارٍ نشر الإعلانات…"));
    const r = await publishJsonToGithub(GITHUB_ANNOUNCEMENTS_PATH, normalizeAnnouncements(data), token, "chore(announcements): update announcement strip via admin");
    setBusy(false);
    setStatus(r.ok ? tr(`Published announcements. The site updates in ~2–5 min. ${r.htmlUrl || ""}`, `تم نشر الإعلانات. يتحدّث الموقع خلال ٢–٥ دقائق. ${r.htmlUrl || ""}`) : r.error);
  }

  return (
    <section className="space-y-4" data-testid="admin-announcements">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{tr("Announcements", "الإعلانات")}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => downloadJson(normalizeAnnouncements(data), "announcements.json")}>{tr("Download", "تنزيل")}</button>
          <button type="button" disabled={busy} className={btn} onClick={publish} data-testid="publish-announcements">{tr("Publish announcements", "نشر الإعلانات")}</button>
          <button type="button" className={btn} data-testid="add-announcement" onClick={() => setEditing({ id: newId("ann"), text: "", order: items.length, hidden: false })}>{tr("+ Announcement", "+ إعلان")}</button>
        </div>
      </div>
      <p className="text-xs text-muted">
        {tr(
          `Short messages that scroll in the "Announcement" strip above the menu on student pages (not on assessments or the join screen). ${showing} of ${items.length} showing.`,
          `رسائل قصيرة تتحرك في شريط «إعلان» أعلى القائمة في صفحات الطلاب (وليس في التقييمات أو شاشة الانضمام). يظهر ${showing} من ${items.length}.`,
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
        <div>
          <p className="font-medium">{tr("Show the announcement strip", "إظهار شريط الإعلانات")}</p>
          <p className="text-xs text-muted">{tr("Turn off to hide the whole strip. It is also hidden when no message is showing.", "أوقفه لإخفاء الشريط كله. يُخفى أيضًا إذا لم تظهر أي رسالة.")}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.enabled}
          data-testid="ticker-master"
          onClick={() => update(items, !data.enabled)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${data.enabled ? "border-emerald-700/30 bg-emerald-600 text-white" : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"}`}
        >
          {data.enabled ? `👁 ${tr("On", "مُفعّل")}` : `🚫 ${tr("Off", "متوقف")}`}
        </button>
      </div>

      {editing && (
        <form onSubmit={save} className="space-y-3 rounded-2xl bg-card p-5" data-testid="announcement-form">
          <Field label={tr("Message", "الرسالة")}><input className={input} value={editing.text} maxLength={200} onChange={(e) => setEditing({ ...editing, text: e.target.value })} data-testid="ann-text" /></Field>
          <Field label={tr("Arabic message (optional)", "الرسالة بالعربية (اختياري)")}><input dir="rtl" className={input} value={editing.textAr || ""} maxLength={200} onChange={(e) => setEditing({ ...editing, textAr: e.target.value })} data-testid="ann-text-ar" /></Field>
          <Field label={tr("Link (optional) — /lessons or https://…", "الرابط (اختياري) — ‎/lessons أو https://…")}><input dir="ltr" className={input} value={editing.href || ""} onChange={(e) => setEditing({ ...editing, href: e.target.value })} placeholder="/assessments" data-testid="ann-href" /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!editing.hidden} onChange={(e) => setEditing({ ...editing, hidden: !e.target.checked })} />
            {tr("Show on the website", "إظهار على الموقع")}
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btn} data-testid="ann-save">{tr("Save announcement", "حفظ الإعلان")}</button>
            <button type="button" className="text-sm text-muted" onClick={() => setEditing(null)}>{tr("Cancel", "إلغاء")}</button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-card-border rounded-2xl bg-card" data-testid="announcement-list">
        {items.length === 0 && <li className="px-4 py-3 text-sm text-muted">{tr("No announcements yet — the strip is hidden.", "لا توجد إعلانات بعد — الشريط مخفي.")}</li>}
        {items.map((it, i) => {
          const visible = !it.hidden;
          return (
            <li key={it.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="announcement-row">
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${visible ? "" : "text-muted line-through decoration-1"}`} dir="auto">{(lang === "ar" && it.textAr) || it.text || it.textAr}</p>
                <p className="text-xs text-muted">
                  {visible ? tr("Showing", "ظاهر") : tr("Hidden", "مخفي")}
                  {it.textAr && lang !== "ar" ? ` · ${tr("Arabic added", "مع العربية")}` : ""}
                  {it.href ? <> · <span dir="ltr">{it.href}</span></> : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(it.id, -1)} aria-label={tr("Move up", "تحريك لأعلى")} title={tr("Move up", "تحريك لأعلى")}>↑</button>
                <button type="button" className={iconBtn} disabled={i === items.length - 1} onClick={() => move(it.id, 1)} aria-label={tr("Move down", "تحريك لأسفل")} title={tr("Move down", "تحريك لأسفل")}>↓</button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={visible}
                  data-testid="ann-toggle"
                  onClick={() => toggle(it)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${visible ? "border-emerald-700/30 bg-emerald-600 text-white" : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"}`}
                >
                  {visible ? `👁 ${tr("Shown", "ظاهر")}` : `🚫 ${tr("Hidden", "مخفي")}`}
                </button>
                <button type="button" className="px-2 text-primary" onClick={() => setEditing({ ...it })} data-testid="ann-edit">{tr("Edit", "تعديل")}</button>
                <button type="button" className="px-2 text-red-600" data-testid="ann-delete" onClick={() => remove(it)}>{tr("Delete", "حذف")}</button>
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
