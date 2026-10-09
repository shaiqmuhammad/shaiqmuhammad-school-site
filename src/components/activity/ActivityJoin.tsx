"use client";

import { useEffect, useState } from "react";
import { AssessmentShell, fieldCls, panelCls, primaryBtn } from "@/components/assessment/AssessmentShell";
import { WallBoard, WallComposer, errorText } from "@/components/activity/WallBoard";
import { ActivityStudentView } from "@/components/activity/ActivityViews";
import { secondsLeft, useActivityState } from "@/components/activity/useActivityState";
import { activityApi, ActivityError, ACTIVITY_LABELS, clearSeat, loadSeat, saveSeat, type ActivityInfo, type Seat } from "@/lib/activity";
import { deviceId } from "@/lib/groupSession";
import { useI18n } from "@/lib/i18n";

/** Student side of a classroom activity (5-character code): name → live activity screen. */
export function ActivityJoin({ code }: { code: string }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [info, setInfo] = useState<ActivityInfo | null>(null);
  const [infoError, setInfoError] = useState("");
  const [seat, setSeat] = useState<Seat | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeat(loadSeat(code));
    activityApi
      .info(code)
      .then((i) => alive && setInfo(i))
      .catch((e) => alive && setInfoError(e instanceof ActivityError ? e.code : "error"));
    return () => {
      alive = false;
    };
  }, [code]);

  const who = seat ? { pid: seat.pid, token: seat.token } : null;
  const { state, error, offline, reload, now } = useActivityState(code, who);

  useEffect(() => {
    if (error === "removed" || error === "unauthorized" || error === "not_found") {
      if (error !== "removed") clearSeat(code);
    }
  }, [error, code]);

  const label = info ? ACTIVITY_LABELS[info.type] : null;
  const title = info?.title || (label ? (lang === "ar" ? label.ar : label.en) : tr("Class activity", "نشاط الصف"));

  if (infoError) {
    return (
      <AssessmentShell title={tr("Class activity", "نشاط الصف")} exitHref="/join">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <div className={panelCls + " text-center"} data-testid="activity-not-found">
            <p className="text-5xl" aria-hidden>🔎</p>
            <h1 className="mt-3 text-2xl font-bold">{tr("We couldn't find that activity", "لم نجد هذا النشاط")}</h1>
            <p className="mt-2 text-lg opacity-80">{tr("Check the code with your teacher and try again.", "تحقق من الرمز مع معلمك وحاول مجددًا.")}</p>
            <a href="/join" className={`${primaryBtn} mt-6`}>{tr("Enter another code", "أدخل رمزًا آخر")}</a>
          </div>
        </div>
      </AssessmentShell>
    );
  }

  if (!info) {
    return (
      <AssessmentShell title={title} exitHref="/join">
        <div className="flex flex-1 items-center justify-center p-10 text-lg opacity-70">{tr("Loading…", "جارٍ التحميل…")}</div>
      </AssessmentShell>
    );
  }

  if (error === "removed") {
    return (
      <AssessmentShell title={title} exitHref="/">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <div className={panelCls + " text-center"} data-testid="activity-removed">
            <p className="text-5xl" aria-hidden>👋</p>
            <h1 className="mt-3 text-2xl font-bold">{tr("You have been removed from this activity", "تمت إزالتك من هذا النشاط")}</h1>
            <p className="mt-2 text-lg opacity-80">{tr("Ask your teacher if you think this is a mistake.", "اسأل معلمك إن كنت تظن أن هذا خطأ.")}</p>
          </div>
        </div>
      </AssessmentShell>
    );
  }

  if (!seat || error === "unauthorized" || error === "not_found") {
    return (
      <AssessmentShell title={title} exitHref="/join">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
          <form
            className={panelCls}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || busy) return;
              setBusy(true);
              setJoinError("");
              try {
                const r = await activityApi.join(code, name.trim(), deviceId());
                const s = { code, pid: r.pid, token: r.token, name: r.name };
                saveSeat(s);
                setSeat(s);
              } catch (err) {
                setJoinError(errorText(err, tr));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-4xl" aria-hidden>{label?.icon}</p>
            <h1 className="mt-2 text-3xl font-bold" data-testid="activity-title">{title}</h1>
            {info.ended ? (
              <p className="mt-3 rounded-xl bg-amber-100 px-4 py-2 text-base text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{tr("This activity has ended.", "انتهى هذا النشاط.")}</p>
            ) : (
              <>
                <label className="mt-6 block text-base font-semibold">
                  {tr("Your name", "اسمك")}
                  <input className={fieldCls + " text-xl"} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus autoComplete="off" data-testid="activity-name" />
                </label>
                {joinError && <p className="mt-3 rounded-xl bg-rose-100 px-4 py-2 text-base text-rose-800 dark:bg-rose-900/40 dark:text-rose-100">{joinError}</p>}
                <button type="submit" className={`${primaryBtn} mt-6 w-full`} disabled={!name.trim() || busy} data-testid="activity-join">
                  {busy ? "…" : tr("Join", "انضم")} →
                </button>
              </>
            )}
          </form>
        </div>
      </AssessmentShell>
    );
  }

  const left = secondsLeft(state, now);
  const closed = !!state && (state.ended || state.settings.locked || left === 0);

  return (
    <AssessmentShell title={title} exitHref="/" secondsLeft={state?.ended ? null : left}>
      <div className="mx-auto w-full max-w-5xl flex-1 px-3 py-5 sm:px-6" data-testid="activity-student">
        {offline && <p className="mb-3 rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{tr("Reconnecting…", "جارٍ إعادة الاتصال…")}</p>}
        {!state ? (
          <p className="p-10 text-center text-lg opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-sun px-3 py-1 font-bold text-navy">{tr("Hi", "مرحبًا")} {seat.name} 👋</span>
              {state.ended && <span className="rounded-full bg-rose-600 px-3 py-1 font-bold text-white">{tr("Ended", "انتهى")}</span>}
              {!state.ended && state.settings.locked && <span className="rounded-full bg-amber-500 px-3 py-1 font-bold text-white">{tr("Paused by teacher", "أوقفه المعلم مؤقتًا")}</span>}
            </div>
            {state.prompt && <h1 className="mb-5 whitespace-pre-wrap text-2xl font-bold leading-snug sm:text-3xl" dir="auto" data-testid="activity-prompt">{state.prompt}</h1>}
            {state.type === "wall" ? (
              <>
                {!closed && (
                  <div className="mb-5">
                    <WallComposer code={code} who={who!} state={state} onPosted={reload} />
                  </div>
                )}
                <WallBoard code={code} who={who!} state={state} onChanged={reload} />
              </>
            ) : (
              <ActivityStudentView code={code} who={who!} state={state} closed={closed} reload={reload} now={now} />
            )}
          </>
        )}
      </div>
    </AssessmentShell>
  );
}
