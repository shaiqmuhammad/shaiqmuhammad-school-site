"use client";

import { useCallback, useEffect, useState } from "react";
import { forumApprove, forumPendingList, forumReject, type PendingForumPost } from "@/lib/adminServer";
import type { ForumData } from "@/lib/forum";
import { useI18n } from "@/lib/i18n";

type Props = {
  forum: ForumData;
  /** Bumped by the parent when the badge count changes, so the list reloads. */
  refreshKey: number;
  onApproved: (forum: unknown) => void;
  onCount: (n: number) => void;
  setStatus: (s: string) => void;
};

const field = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-sun-border focus:ring-2 focus:ring-sun/40";

/** Admin → Forum: student posts waiting for approval (Approve / Edit / Reject). */
export function AdminForumQueue({ forum, refreshKey, onApproved, onCount, setStatus }: Props) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [items, setItems] = useState<PendingForumPost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Record<string, { author: string; title: string; body: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notify, setNotify] = useState<NotificationPermission | "unsupported">("unsupported");

  const load = useCallback(async () => {
    const list = await forumPendingList();
    setFailed(list === null);
    if (list) {
      setItems(list);
      onCount(list.length);
    }
  }, [onCount]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (typeof Notification !== "undefined") setNotify(Notification.permission);
  }, []);

  const threadTitle = (id?: string) => forum.threads.find((t) => t.id === id)?.title || id || "?";

  async function approve(p: PendingForumPost) {
    setBusyId(p.id);
    setStatus(tr("Approving and publishing…", "جارٍ الموافقة والنشر…"));
    const r = await forumApprove(p.id, editing[p.id]);
    setBusyId(null);
    if (!r.ok) {
      setStatus(
        r.error === "thread_missing"
          ? tr("That reply's thread is no longer on the site — reject the reply instead.", "موضوع هذا الرد لم يعد موجودًا — ارفض الرد بدلًا من ذلك.")
          : tr(`Approve failed: ${r.error}`, `تعذّرت الموافقة: ${r.error}`),
      );
      return;
    }
    onApproved(r.forum);
    setEditing(({ [p.id]: _drop, ...rest }) => rest);
    setStatus(tr("Approved — it will appear on the forum after the site rebuilds (~2–5 min).", "تمت الموافقة — ستظهر في المنتدى بعد إعادة بناء الموقع (٢–٥ دقائق)."));
    void load();
  }

  async function reject(p: PendingForumPost) {
    if (!confirm(tr(`Reject and delete this ${p.kind === "thread" ? "thread" : "reply"} by ${p.author}?`, `رفض وحذف مشاركة ${p.author}؟`))) return;
    setBusyId(p.id);
    const ok = await forumReject(p.id);
    setBusyId(null);
    setStatus(ok ? tr("Post rejected and deleted.", "تم رفض المشاركة وحذفها.") : tr("Could not reject — try again.", "تعذّر الرفض — حاول مجددًا."));
    void load();
  }

  return (
    <section className="space-y-3 rounded-2xl bg-card p-5 ring-1 ring-card-border/50" data-testid="forum-queue">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          {tr("Waiting for approval", "بانتظار الموافقة")}
          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white" data-testid="forum-queue-count">{items?.length ?? "…"}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {notify === "default" && (
            <button type="button" className="rounded-full border border-card-border px-3 py-1.5 text-sm" onClick={() => Notification.requestPermission().then(setNotify)}>
              🔔 {tr("Enable desktop alerts", "تفعيل التنبيهات")}
            </button>
          )}
          <button type="button" className="rounded-full border border-card-border px-3 py-1.5 text-sm" onClick={() => void load()}>
            ↻ {tr("Refresh", "تحديث")}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">{tr("Students' posts never appear on the site until you approve them here. Approving publishes it straight to the forum.", "لا تظهر مشاركات الطلاب حتى توافق عليها هنا. الموافقة تنشرها مباشرة في المنتدى.")}</p>
      {failed && <p className="text-sm text-rose-700 dark:text-rose-300">{tr("Couldn't load the queue. Check Settings → Publishing (sign in again if it isn't connected).", "تعذّر تحميل القائمة. تحقّق من الإعدادات ← النشر.")}</p>}
      {items && items.length === 0 && <p className="text-sm text-muted">{tr("Nothing waiting. 🎉", "لا شيء بالانتظار. 🎉")}</p>}
      <ul className="space-y-3">
        {(items || []).map((p) => {
          const ed = editing[p.id];
          return (
            <li key={p.id} className="rounded-xl border border-card-border bg-background/60 p-4" data-testid="forum-pending-item">
              <p className="text-xs text-muted">
                <span className="me-2 rounded-full bg-cream px-2 py-0.5 font-bold text-navy">{p.kind === "thread" ? tr("New thread", "موضوع جديد") : tr("Reply", "رد")}</span>
                {p.kind === "reply" && <>{tr("on", "على")} “{threadTitle(p.threadId)}” · </>}
                {new Date(p.createdAt).toLocaleString(lang === "ar" ? "ar-AE" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {ed ? (
                <div className="mt-2 space-y-2">
                  <label className="block text-xs font-medium">{tr("Name", "الاسم")}<input className={field} value={ed.author} maxLength={40} onChange={(e) => setEditing({ ...editing, [p.id]: { ...ed, author: e.target.value } })} /></label>
                  {p.kind === "thread" && <label className="block text-xs font-medium">{tr("Title", "العنوان")}<input className={field} value={ed.title} maxLength={120} onChange={(e) => setEditing({ ...editing, [p.id]: { ...ed, title: e.target.value } })} /></label>}
                  <label className="block text-xs font-medium">{tr("Message", "الرسالة")}<textarea className={field + " min-h-20"} value={ed.body} maxLength={2000} onChange={(e) => setEditing({ ...editing, [p.id]: { ...ed, body: e.target.value } })} /></label>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-sm font-semibold" dir="auto">{p.author}{p.title ? <> — <span dir="auto">{p.title}</span></> : null}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm" dir="auto">{p.body}</p>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <button type="button" disabled={busyId === p.id} onClick={() => approve(p)} className="rounded-full bg-emerald-600 px-4 py-1.5 font-semibold text-white disabled:opacity-60" data-testid="forum-approve">
                  ✓ {ed ? tr("Save & approve", "حفظ وموافقة") : tr("Approve", "موافقة")}
                </button>
                {ed ? (
                  <button type="button" className="rounded-full border border-card-border px-3 py-1.5" onClick={() => setEditing(({ [p.id]: _drop, ...rest }) => rest)}>{tr("Cancel edit", "إلغاء التعديل")}</button>
                ) : (
                  <button type="button" className="rounded-full border border-card-border px-3 py-1.5" onClick={() => setEditing({ ...editing, [p.id]: { author: p.author, title: p.title || "", body: p.body } })} data-testid="forum-edit">✎ {tr("Edit", "تعديل")}</button>
                )}
                <button type="button" disabled={busyId === p.id} onClick={() => reject(p)} className="rounded-full border border-rose-300 px-3 py-1.5 text-rose-700 disabled:opacity-60 dark:text-rose-300" data-testid="forum-reject">
                  ✕ {tr("Reject", "رفض")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
