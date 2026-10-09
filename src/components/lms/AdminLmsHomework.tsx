"use client";

import { useCallback, useEffect, useState } from "react";
import { exportAllHomeworkZip } from "@/components/lms/lmsFiles";
import { AudioClip } from "@/components/lms/Audio";
import { adminRelogin, card, smallBtn, STATUS_STYLE, statusLabel, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText } from "@/lib/lms";

type Dash = Awaited<ReturnType<typeof lmsApi.dashboard>>;
type Detail = Awaited<ReturnType<typeof lmsApi.homework>>;

/** Admin area: every homework and its submissions (read-only review), delete, export. Uses only the admin session. */
export function AdminLmsHomework() {
  const { tr } = useTr();
  const [dash, setDash] = useState<Dash | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const fail = useCallback((e: unknown) => { if ((e as { status?: number }).status === 401 && adminRelogin()) return; setErr(lmsErrorText(e, tr)); }, [tr]);
  const load = useCallback(() => { lmsApi.dashboard(true).then(setDash).catch(fail); }, [fail]);
  useEffect(() => { load(); }, [load]);
  const names = new Map((dash?.students || []).map((s) => [s.id, s.name]));

  return (
    <div className="space-y-5" data-testid="admin-lms-homework">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-extrabold" data-testid="admin-lms-heading">{tr("Homework", "الواجبات")} {dash && `(${dash.homework.length})`}</h2>
        <span className="flex-1" />
        <button type="button" className={smallBtn} onClick={() => exportAllHomeworkZip(true).catch(fail)} data-testid="admin-hw-export">⬇ {tr("Export all (ZIP)", "تصدير الكل (ZIP)")}</button>
      </div>
      <p className="text-sm opacity-75">{tr("Teachers create and review homework in the teacher area (/lms) with their own login. Here you can see everything and delete.", "ينشئ المعلمون الواجبات ويراجعونها في منطقة المعلم (/lms) بحساباتهم. هنا ترى كل شيء ويمكنك الحذف.")}</p>
      {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
      {!dash ? (
        <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
      ) : !dash.homework.length ? (
        <p className={card}>{tr("No homework yet.", "لا توجد واجبات بعد.")}</p>
      ) : (
        <ul className="space-y-3">
          {dash.homework.map((h) => (
            <li key={h.id} className={card + " space-y-2"} data-testid="admin-hw-row">
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden>{h.kind === "quran" ? "📖" : "📝"}</span>
                <b className="min-w-0 flex-1" dir="auto">{h.title}</b>
                <span className="text-sm opacity-70">{h.students.length ? tr(`${h.students.length} students`, `${h.students.length} طلاب`) : [h.cls, h.section].filter(Boolean).join(" · ") || tr("All students", "كل الطلاب")}</span>
                <span className="text-sm opacity-70">{Object.entries(h.counts || {}).map(([k, n]) => `${statusLabel(k as never, tr)}: ${n}`).join(" · ") || tr("no work yet", "لا يوجد عمل بعد")}</span>
                <button type="button" className={smallBtn} aria-expanded={open === h.id} onClick={() => { if (open === h.id) { setOpen(null); return; } setOpen(h.id); setDetail(null); lmsApi.homework(h.id, true).then(setDetail).catch(fail); }} data-testid="admin-hw-open">
                  {open === h.id ? tr("Hide", "إخفاء") : tr("Submissions", "التسليمات")}
                </button>
                <button type="button" className={smallBtn + " text-rose-600"} onClick={async () => { if (!confirm(tr(`Delete "${h.title}" and all its submissions?`, `حذف "${h.title}" وكل تسليماته؟`))) return; await lmsApi.deleteHomework(h.id, true).catch(fail); load(); }} data-testid="admin-hw-delete" aria-label={tr("Delete", "حذف")}>🗑</button>
              </div>
              {open === h.id && (
                <div className="rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5" data-testid="admin-hw-detail">
                  {!detail ? (
                    <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
                  ) : (
                    <>
                      <ul className="space-y-2">
                        {(detail.subs || []).map((s) => (
                          <li key={s.id} className="space-y-1" data-testid="admin-hw-sub">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <b dir="auto">{s.name}</b>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[s.status]}`}>{statusLabel(s.status, tr)}</span>
                              {s.practised && <span>✅ {tr("practised", "تدرّب")}</span>}
                              
                            </div>
                            {s.text && <p className="whitespace-pre-wrap text-sm" dir="auto">{s.text}</p>}
                            {s.audio && <AudioClip id={s.audio} asAdmin label={"🎙️ " + tr("Student recording", "تسجيل الطالب")} testId="admin-sub-clip" />}
                            {s.comments.map((c, i) => <div key={i} className="text-sm opacity-80" dir="auto"><b>{c.by}:</b> {c.text}{c.audio && <AudioClip id={c.audio} asAdmin label={"🎙️ " + tr("Voice feedback", "تعليق صوتي")} testId="admin-fb-clip" />}</div>)}
                          </li>
                        ))}
                      </ul>
                      {!!detail.notStarted?.length && <p className="mt-2 text-sm opacity-70">{tr("Not started:", "لم يبدأ:")} {detail.notStarted.map((x) => names.get(x.id) || x.name).join(", ")}</p>}
                      {!detail.subs?.length && !detail.notStarted?.length && <p className="text-sm opacity-70">{tr("Nobody assigned.", "لا يوجد طلاب.")}</p>}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
