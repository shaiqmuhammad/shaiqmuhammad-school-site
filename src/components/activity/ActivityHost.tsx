"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AssessmentShell, ghostBtn, panelCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { ActivityHostView } from "@/components/activity/ActivityViews";
import { WallBoard, WallComposer } from "@/components/activity/WallBoard";
import { secondsLeft, useActivityState } from "@/components/activity/useActivityState";
import { activityApi, ACTIVITY_LABELS, forgetHosted, hostedFor, type ActivitySettings, type ActivityState, type HostedActivity } from "@/lib/activity";
import { downloadBlob, safeFileName } from "@/lib/exportUtils";
import { joinUrl, qrImageUrl } from "@/lib/groupSession";
import { useI18n } from "@/lib/i18n";

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-bold transition ${
    on ? "border-sun-border bg-sun text-navy" : "border-black/10 bg-white/70 text-[#1b2f44] hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
  }`;

/** Excel export of everything on the wall / every response. */
export async function exportActivityXlsx(state: ActivityState) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Posts");
  ws.columns = [
    { header: "Time", key: "time", width: 20 },
    { header: "Name", key: "name", width: 22 },
    { header: "Kind", key: "kind", width: 10 },
    { header: "Status", key: "status", width: 10 },
    { header: "Text", key: "text", width: 60 },
    { header: "Link / YouTube / Picture", key: "link", width: 40 },
    { header: "Likes", key: "likes", width: 8 },
    { header: "Teacher comments", key: "comments", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  const names = new Map(state.participants.map((p) => [p.id, p.name]));
  for (const i of state.items) {
    ws.addRow({
      time: new Date(i.created).toLocaleString(),
      name: i.pid === "host" ? "Teacher" : names.get(i.pid) || i.author,
      kind: i.kind,
      status: i.status,
      text: i.data.text || i.data.word || (i.data.picks ? i.data.picks.map((n) => n + 1).join(", ") : i.data.answers ? JSON.stringify(i.data.answers) : ""),
      link: i.data.link || (i.data.youtube ? `https://youtu.be/${i.data.youtube}` : "") || (i.img ? activityApi.imgUrl(state.code, i.img) : ""),
      likes: i.likes,
      comments: i.comments.map((c) => c.text).join(" | "),
    });
  }
  const ps = wb.addWorksheet("Participants");
  ps.columns = [
    { header: "Name", key: "name", width: 26 },
    { header: "Joined", key: "joined", width: 22 },
    { header: "Removed", key: "removed", width: 10 },
  ];
  ps.getRow(1).font = { bold: true };
  state.participants.forEach((p) => ps.addRow({ name: p.name, joined: new Date(p.joined).toLocaleString(), removed: p.removed ? "yes" : "" }));
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safeFileName(state.title || state.type)}-${state.code}.xlsx`);
}

/** Teacher / projector screen for one activity: join QR, participants, moderation, timer, end. */
export function ActivityHost() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const params = useSearchParams();
  const router = useRouter();
  const code = (params.get("code") || "").toUpperCase();
  const [hosted, setHosted] = useState<HostedActivity | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHosted(hostedFor(code) ?? null);
  }, [code]);

  const who = hosted ? { hostKey: hosted.hostKey } : null;
  const { state, error, offline, reload, now } = useActivityState(code, who);
  const [showJoin, setShowJoin] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [copied, setCopied] = useState(false);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  if (hosted === undefined) return null;
  if (!hosted || error === "not_found" || error === "host_only") {
    return (
      <AssessmentShell title={tr("Class activity", "نشاط الصف")} exitHref="/admin">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <div className={panelCls + " text-center"} data-testid="host-missing">
            <p className="text-5xl" aria-hidden>🔐</p>
            <h1 className="mt-3 text-2xl font-bold">{error === "not_found" ? tr("This activity has expired or was deleted", "انتهت صلاحية هذا النشاط أو حُذف") : tr("This activity isn't saved on this device", "هذا النشاط غير محفوظ على هذا الجهاز")}</h1>
            <p className="mt-2 opacity-80">{tr("Open it from Admin → Activities on the device that created it, or create a new one.", "افتحه من الإدارة ← الأنشطة على الجهاز الذي أنشأه، أو أنشئ نشاطًا جديدًا.")}</p>
            <a href="/admin" className={`${primaryBtn} mt-6`}>{tr("Go to Admin", "إلى الإدارة")}</a>
          </div>
        </div>
      </AssessmentShell>
    );
  }

  const hostKey = hosted.hostKey;
  const url = joinUrl(code);
  const label = ACTIVITY_LABELS[hosted.type];
  const title = state?.title || hosted.title || (lang === "ar" ? label.ar : label.en);
  const left = secondsLeft(state, now);
  const set = async (patch: Partial<ActivitySettings>) => {
    await activityApi.settings(code, hostKey, { settings: patch }).catch(() => undefined);
    reload();
  };
  const pending = state ? state.items.filter((i) => i.status === "pending").length : 0;
  const active = state ? state.participants.filter((p) => !p.removed) : [];

  const actions = (
    <>
      <button
        type="button"
        className="pill-on-navy hidden h-9 px-3 text-sm font-bold sm:inline-flex"
        onClick={() => setShowJoin(true)}
        data-testid="host-show-join"
      >
        <span className="font-mono tracking-widest" dir="ltr">{code}</span>
      </button>
      <button
        type="button"
        className="pill-on-navy h-9 w-9 justify-center"
        aria-label={full ? tr("Exit full screen", "إنهاء ملء الشاشة") : tr("Full screen", "ملء الشاشة")}
        title={full ? tr("Exit full screen", "إنهاء ملء الشاشة") : tr("Full screen", "ملء الشاشة")}
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch(() => undefined)}
        data-testid="host-fullscreen"
      >
        {full ? "⤡" : "⤢"}
      </button>
    </>
  );

  return (
    <AssessmentShell title={title} exitHref="/admin" secondsLeft={state?.ended ? null : left} actions={actions} wide>
      <div className="mx-auto w-full max-w-[1800px] flex-1 px-3 py-4 sm:px-6" data-testid="activity-host">
        {offline && <p className="mb-3 rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{tr("Reconnecting…", "جارٍ إعادة الاتصال…")}</p>}

        {/* Join strip */}
        <section className="glass mb-4 flex flex-wrap items-center gap-4 rounded-3xl p-4">
          <button type="button" onClick={() => setShowJoin(true)} className="shrink-0 rounded-2xl bg-white p-1.5" aria-label={tr("Show big QR code", "إظهار رمز QR كبير")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImageUrl(url, 240)} alt="" width={84} height={84} className="h-20 w-20" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold opacity-80">{tr("Join at", "انضم عبر")} <span dir="ltr" className="font-bold">{url.replace(/^https?:\/\//, "").replace(/\?code=.*/, "")}</span></p>
            <p className="font-mono text-4xl font-extrabold tracking-[0.25em] sm:text-5xl" dir="ltr" data-testid="host-code">{code}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={ghostBtn}
              onClick={async () => {
                await navigator.clipboard?.writeText(url).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              data-testid="host-copy"
            >
              {copied ? tr("Copied ✓", "تم النسخ ✓") : tr("Copy link", "نسخ الرابط")}
            </button>
            <button type="button" className={ghostBtn} onClick={() => setShowPeople((v) => !v)} aria-expanded={showPeople} data-testid="host-people-toggle">
              👥 {active.length}
            </button>
          </div>
        </section>

        {/* Controls */}
        {state && (
          <section className="mb-4 flex flex-wrap items-center gap-2" aria-label={tr("Controls", "التحكم")}>
            <button type="button" className={chip(state.settings.hideNames)} onClick={() => set({ hideNames: !state.settings.hideNames })} aria-pressed={state.settings.hideNames} data-testid="host-hide-names">
              {state.settings.hideNames ? "🙈" : "👀"} {state.settings.hideNames ? tr("Names hidden", "الأسماء مخفية") : tr("Names shown", "الأسماء ظاهرة")}
            </button>
            {(state.type === "wall" || state.type === "tps") && (
              <>
                <button type="button" className={chip(state.settings.moderation === "approve")} onClick={() => set({ moderation: state.settings.moderation === "approve" ? "live" : "approve" })} data-testid="host-moderation">
                  🛡️ {state.settings.moderation === "approve" ? tr("Approve first", "الموافقة أولًا") : tr("Live posting", "نشر مباشر")}
                </button>
                <button type="button" className={chip(state.settings.likes)} onClick={() => set({ likes: !state.settings.likes })} aria-pressed={state.settings.likes}>
                  ♥ {tr("Likes", "الإعجابات")}
                </button>
                <button type="button" className={chip(state.settings.allowImages)} onClick={() => set({ allowImages: !state.settings.allowImages })} aria-pressed={state.settings.allowImages}>
                  🖼️ {tr("Pictures", "الصور")}
                </button>
                <button type="button" className={chip(state.settings.allowLinks)} onClick={() => set({ allowLinks: !state.settings.allowLinks })} aria-pressed={state.settings.allowLinks}>
                  🔗 {tr("Links", "الروابط")}
                </button>
              </>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/70 px-2 py-1 text-sm font-bold dark:border-white/15 dark:bg-white/5">
              ⏱
              {[1, 3, 5, 10].map((m) => (
                <button key={m} type="button" className="rounded-full px-2 py-0.5 hover:bg-sun hover:text-navy" onClick={() => set({ timerEnd: now + m * 60000 })} data-testid={`host-timer-${m}`}>
                  {m}′
                </button>
              ))}
              {state.settings.timerEnd && (
                <button type="button" className="rounded-full px-2 py-0.5 text-rose-600 hover:bg-rose-100" onClick={() => set({ timerEnd: null })} aria-label={tr("Stop timer", "إيقاف المؤقت")}>✕</button>
              )}
            </span>
            {!state.ended && (
              <button type="button" className={chip(state.settings.locked)} onClick={() => set({ locked: !state.settings.locked })} data-testid="host-lock">
                {state.settings.locked ? "▶ " + tr("Resume", "استئناف") : "⏸ " + tr("Pause", "إيقاف مؤقت")}
              </button>
            )}
            {pending > 0 && (
              <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700" onClick={async () => { await activityApi.moderate(code, hostKey, "approve-all").catch(() => undefined); reload(); }} data-testid="host-approve-all">
                ✓ {tr("Approve all", "موافقة على الكل")} ({pending})
              </button>
            )}
            <span className="flex-1" />
            <button type="button" className={chip(false)} onClick={() => exportActivityXlsx(state)} data-testid="host-export">⬇ Excel</button>
            {state.ended ? (
              <button type="button" className={chip(false)} onClick={async () => { await activityApi.settings(code, hostKey, { reopen: true }).catch(() => undefined); reload(); }} data-testid="host-reopen">
                ↺ {tr("Reopen", "إعادة الفتح")}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-700"
                onClick={async () => {
                  if (!confirm(tr("End this activity for everyone?", "إنهاء هذا النشاط للجميع؟"))) return;
                  setBusy(true);
                  await activityApi.end(code, hostKey).catch(() => undefined);
                  setBusy(false);
                  reload();
                }}
                data-testid="host-end"
              >
                ■ {tr("End", "إنهاء")}
              </button>
            )}
          </section>
        )}

        {/* Participants */}
        {showPeople && state && (
          <section className="glass mb-4 rounded-3xl p-4" data-testid="host-people">
            <h2 className="text-lg font-bold">{tr("Participants", "المشاركون")} ({active.length})</h2>
            {state.participants.length === 0 ? (
              <p className="mt-2 opacity-70">{tr("Waiting for students to join…", "بانتظار انضمام الطلاب…")}</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {state.participants.map((p) => (
                  <li key={p.id} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${p.removed ? "border-rose-300 bg-rose-50 line-through opacity-70 dark:bg-rose-950/30" : "border-black/10 bg-white/80 dark:border-white/15 dark:bg-white/5"}`} data-testid="host-participant">
                    <span dir="auto">{p.name}</span>
                    {p.removed ? (
                      <button type="button" className="text-xs underline" onClick={async () => { await activityApi.remove(code, hostKey, p.id, { restore: true }).catch(() => undefined); reload(); }}>{tr("Let back in", "السماح بالعودة")}</button>
                    ) : (
                      <button
                        type="button"
                        className="text-rose-600"
                        aria-label={tr(`Remove ${p.name}`, `إزالة ${p.name}`)}
                        title={tr("Remove (and delete their posts)", "إزالة (وحذف مشاركاته)")}
                        onClick={async () => {
                          const del = confirm(tr(`Remove ${p.name}? OK also deletes their posts; Cancel keeps them.`, `إزالة ${p.name}؟ موافق تحذف مشاركاته أيضًا؛ إلغاء يبقيها.`));
                          await activityApi.remove(code, hostKey, p.id, { deleteItems: del }).catch(() => undefined);
                          reload();
                        }}
                        data-testid="host-remove"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {!state ? (
          <p className="p-10 text-center text-lg opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
        ) : (
          <>
            {state.prompt && <h1 className="mb-4 whitespace-pre-wrap text-3xl font-extrabold leading-snug sm:text-4xl" dir="auto" data-testid="host-prompt">{state.prompt}</h1>}
            {state.ended && <p className="mb-4 rounded-2xl bg-rose-600 px-4 py-2 font-bold text-white">{tr("This activity has ended — students can still see the results.", "انتهى النشاط — ما زال الطلاب يرون النتائج.")}</p>}
            {state.type === "wall" ? (
              <>
                <details className="mb-4">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-full bg-header px-4 py-2 font-bold text-sun" data-testid="host-post-toggle">✏️ {tr("Teacher post", "منشور المعلم")}</summary>
                  <div className="mt-3 max-w-2xl"><WallComposer code={code} who={{ hostKey }} state={state} onPosted={reload} /></div>
                </details>
                <WallBoard code={code} who={{ hostKey }} state={state} onChanged={reload} big />
              </>
            ) : (
              <ActivityHostView code={code} hostKey={hostKey} state={state} reload={reload} now={now} big />
            )}
          </>
        )}

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            className="text-sm text-rose-600 underline"
            onClick={async () => {
              if (!confirm(tr("Delete this activity and everything in it now? This can't be undone.", "حذف هذا النشاط وكل محتواه الآن؟ لا يمكن التراجع."))) return;
              await activityApi.destroy(code, hostKey).catch(() => undefined);
              forgetHosted(code);
              router.push("/admin");
            }}
            data-testid="host-destroy"
          >
            {tr("Delete activity", "حذف النشاط")}
          </button>
        </div>
      </div>

      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-header/95 p-6 text-white" role="dialog" aria-modal="true" aria-label={tr("Join", "انضم")} onClick={() => setShowJoin(false)} data-testid="host-join-overlay">
          <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:gap-16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImageUrl(url, 600)} alt={url} className="h-[min(60vh,80vw)] w-[min(60vh,80vw)] rounded-3xl bg-white p-4" />
            <div>
              <p className="text-2xl font-semibold text-white/80">{tr("Go to", "اذهب إلى")}</p>
              <p className="text-3xl font-bold" dir="ltr">{url.replace(/^https?:\/\//, "").replace(/\?code=.*/, "")}</p>
              <p className="mt-6 text-2xl font-semibold text-white/80">{tr("and enter", "وأدخل")}</p>
              <p className="font-mono text-7xl font-extrabold tracking-[0.25em] text-sun sm:text-8xl" dir="ltr">{code}</p>
              <p className="mt-6 text-lg text-white/70">👥 {active.length} · {tr("tap anywhere to close", "اضغط في أي مكان للإغلاق")}</p>
            </div>
          </div>
        </div>
      )}
    </AssessmentShell>
  );
}
