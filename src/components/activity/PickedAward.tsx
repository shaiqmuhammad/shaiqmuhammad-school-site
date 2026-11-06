"use client";
import { useEffect, useState } from "react";
import { lmsApi, lmsSession } from "@/lib/lms";
import { rosterIdFor } from "@/components/activity/ClassNames";
import { sfxPoints } from "@/lib/sfx";
import { useI18n } from "@/lib/i18n";

type Cat = { id: string; label: string; pts: number; icon: string };
let catCache: Cat[] | null = null;

/** t420: +1 / −1 point buttons for the student picked by the Randomiser or the Spinning wheel.
 *  Only shown for teachers/admin when the name came from a class roster; the server still checks scope. */
export function PickedAward({ name }: { name: string }) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [sid, setSid] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => {
    const role = lmsSession()?.user.role;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSid(role === "teacher" || role === "admin" ? rosterIdFor(name) : null);
    setDone(null); setErr("");
  }, [name]);
  if (!sid) return null;
  const give = async (sign: 1 | -1) => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      if (!catCache) catCache = (await lmsApi.pcatList()).items;
      const pool = catCache.filter((c) => (sign > 0 ? c.pts > 0 : c.pts < 0));
      const cat = pool.find((c) => c.pts === sign) || pool.sort((a, b) => Math.abs(a.pts) - Math.abs(b.pts))[0];
      if (!cat) throw new Error("no_cat");
      await lmsApi.ptsAward(cat.id, [sid]);
      sfxPoints(cat.pts);
      setDone(cat.pts); setTick((t) => t + 1);
    } catch {
      setErr(tr("Couldn't give the point.", "تعذر منح النقطة."));
    }
    setBusy(false);
  };
  return (
    <div className="mt-6 flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()} data-testid="picked-award">
      {(
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" disabled={busy} onClick={() => give(1)} className="rounded-full bg-emerald-600 px-6 py-3 text-xl font-extrabold text-white shadow-lg ring-2 ring-sun transition hover:scale-105 disabled:opacity-60" data-testid="picked-plus"><span className="inline-block animate-spin [animation-duration:3s]">⭐</span> +1 {tr("Point", "نقطة")}</button>
          <button type="button" disabled={busy} onClick={() => give(-1)} className="rounded-full bg-rose-600 px-6 py-3 text-xl font-extrabold text-white shadow-lg transition hover:scale-105 disabled:opacity-60" data-testid="picked-minus">👎 −1 {tr("Point", "نقطة")}</button>
        </div>
      )}
      {done !== null && (
        <p key={tick} className={`text-xl font-extrabold ${done > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`} role="status" data-testid="picked-done" style={{ animation: done > 0 ? "pa-pop .5s ease-out" : "pa-shake .5s ease-in-out" }}>
          {done > 0 ? `🌟 +${done} ${tr("point given!", "نقطة مُنحت!")}` : `🔻 ${done} ${tr("point", "نقطة")}`}
        </p>
      )}
      {done !== null && done > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
          {Array.from({ length: 36 }, (_, i) => (
            <span key={i} className="absolute animate-bounce text-3xl" style={{ left: `${(i * 29) % 100}%`, top: `${(i * 47) % 90}%`, animationDelay: `${(i % 9) * 0.08}s` }}>{["⭐", "🌟", "🎉", "✨"][i % 4]}</span>
          ))}
        </div>
      )}
      <style>{`@keyframes pa-pop{0%{transform:scale(.3)}70%{transform:scale(1.25)}100%{transform:scale(1)}}@keyframes pa-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-10px)}75%{transform:translateX(10px)}}`}</style>
      {err && <p className="text-sm font-semibold text-rose-600" role="alert">{err}</p>}
    </div>
  );
}
