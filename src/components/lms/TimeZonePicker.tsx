"use client";

import { useEffect, useMemo, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { TZ_META } from "@/lib/tzCountries";
import { SITE_TZ, TZ_AUTO, deviceZone, from12, fmtTime12, fmtWhen, isValidZone, previewInZone, readTzPref, resolveZone, to12, utcOffsetLabel, writeTzPref, zoneCity, zoneLabel, zoneMs, zoneParts } from "@/lib/timeZone";
import { lmsApi } from "@/lib/lms";

export function useViewerZone(asAdmin = false) {
  const [pref, setPref] = useState(TZ_AUTO);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPref(readTzPref());
    const sync = () => setPref(readTzPref());
    window.addEventListener("sm-tz", sync);
    lmsApi.tzGet(asAdmin).then((r) => {
      const p = !r.pref || r.pref === TZ_AUTO ? TZ_AUTO : (isValidZone(r.pref) ? r.pref : TZ_AUTO);
      writeTzPref(p);
      setPref(p);
    }).catch(() => undefined).finally(() => setReady(true));
    return () => window.removeEventListener("sm-tz", sync);
  }, [asAdmin]);
  const zone = resolveZone(pref);
  const save = async (next: string) => {
    const p = !next || next === TZ_AUTO ? TZ_AUTO : next;
    writeTzPref(p);
    setPref(p);
    await lmsApi.tzSet(p, asAdmin).catch(() => undefined);
  };
  return { pref, zone, ready, save, device: deviceZone() };
}

type Meta = { id: string; country: string; city: string; offset: string };

function allZones(now = Date.now()): Meta[] {
  const known = new Map(TZ_META.map((x) => [x.id, x]));
  let ids: string[] = TZ_META.map((x) => x.id);
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      ids = Array.from(new Set([...ids, ...(Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone")]));
    }
  } catch { /* */ }
  return ids.filter(isValidZone).map((id) => {
    const hit = known.get(id);
    return { id, country: hit?.country || id.split("/")[0] || "Other", city: hit?.city || zoneCity(id), offset: utcOffsetLabel(id, now) };
  });
}

export function TimeZonePicker({
  value, onChange, id = "tz-pick", allowAuto = false, autoLabel,
}: {
  value: string; onChange: (z: string) => void; id?: string; allowAuto?: boolean; autoLabel?: string;
}) {
  const { tr, lang } = useTr();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const now = Date.now();
  const zones = useMemo(() => allZones(now), [now]);
  const device = deviceZone();
  const selected = value === TZ_AUTO ? TZ_AUTO : (isValidZone(value) ? value : SITE_TZ);
  const shown = selected === TZ_AUTO ? `${tr("Auto", "تلقائي")} · ${zoneLabel(device, now)}` : `${zoneCity(selected)} (${utcOffsetLabel(selected, now)}) · ${zones.find((z) => z.id === selected)?.country || ""}`;
  const query = q.trim().toLowerCase();
  const filtered = zones.filter((z) => {
    if (!query) return true;
    return `${z.city} ${z.country} ${z.id} ${z.offset}`.toLowerCase().includes(query);
  });
  const grouped = useMemo(() => {
    const map = new Map<string, Meta[]>();
    for (const z of filtered) {
      const arr = map.get(z.country) || [];
      arr.push(z);
      map.set(z.country, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], lang === "ar" ? "ar" : "en"));
  }, [filtered, lang]);

  const pick = (id: string) => { onChange(id); setOpen(false); setQ(""); };

  return (
    <div className="relative" data-testid={id}>
      <button type="button" className="lms-field flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-start font-semibold" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox">
        <span className="truncate">{shown}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="lms-card absolute z-[60] mt-1 max-h-[min(24rem,70vh)] w-full overflow-hidden rounded-2xl border border-black/10 shadow-xl dark:border-white/15">
          <input autoFocus className="lms-field w-full rounded-none border-0 border-b px-3 py-2 text-sm font-semibold outline-none" placeholder={tr("Search country or city…", "ابحث عن دولة أو مدينة…")} value={q} onChange={(e) => setQ(e.target.value)} data-testid={`${id}-search`} />
          <ul className="max-h-[min(20rem,60vh)] overflow-auto py-1" role="listbox">
            {allowAuto && (!query || "auto".includes(query) || tr("Auto", "تلقائي").includes(query) || zoneLabel(device, now).toLowerCase().includes(query)) && (
              <li>
                <button type="button" className={`flex w-full flex-col items-start px-3 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/10 ${selected === TZ_AUTO ? "bg-emerald-100 dark:bg-emerald-900/40" : ""}`} onClick={() => pick(TZ_AUTO)} data-testid={`${id}-auto`}>
                  <span className="font-black">{autoLabel || tr("Auto (this device)", "تلقائي (هذا الجهاز)")}</span>
                  <span className="text-xs opacity-70">{tr("Follows your device, even when you travel.", "يتبع جهازك حتى عند السفر.")} · {zoneLabel(device, now)}</span>
                </button>
              </li>
            )}
            {!query && (
              <li>
                <button type="button" className={`flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/10 ${selected === SITE_TZ ? "bg-amber-100 dark:bg-amber-900/40" : ""}`} onClick={() => pick(SITE_TZ)}>
                  <span className="font-bold">{tr("School default", "إعداد المدرسة")} · {zoneCity(SITE_TZ)}</span>
                  <span className="text-xs opacity-70">{utcOffsetLabel(SITE_TZ, now)}</span>
                </button>
              </li>
            )}
            {grouped.map(([country, list]) => (
              <li key={country}>
                <p className="sticky top-0 bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">{country}</p>
                {list.map((z) => (
                  <button key={z.id} type="button" className={`flex w-full items-center justify-between px-3 py-1.5 text-start text-sm hover:bg-black/5 dark:hover:bg-white/10 ${selected === z.id ? "bg-emerald-100 font-black dark:bg-emerald-900/40" : "font-semibold"}`} onClick={() => pick(z.id)}>
                    <span>{z.city}</span>
                    <span className="text-xs opacity-70">{z.offset}</span>
                  </button>
                ))}
              </li>
            ))}
            {!grouped.length && <li className="px-3 py-3 text-sm opacity-70">{tr("No matching time zones.", "لا توجد مناطق زمنية مطابقة.")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Time12Field({ value, onChange, testId = "time-12" }: { value: string; onChange: (hm: string) => void; testId?: string }) {
  const { tr } = useTr();
  const cur = to12(value);
  const set = (hour: number, minute: number, pm: boolean) => onChange(from12(hour, minute, pm));
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <select className="lms-field rounded-2xl px-2 py-2 font-bold" value={cur.hour} onChange={(e) => set(Number(e.target.value), cur.minute, cur.pm)} aria-label={tr("Hour", "الساعة")} data-testid={`${testId}-hour`}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="font-black">:</span>
      <select className="lms-field rounded-2xl px-2 py-2 font-bold" value={cur.minute} onChange={(e) => set(cur.hour, Number(e.target.value), cur.pm)} aria-label={tr("Minute", "الدقيقة")} data-testid={`${testId}-min`}>
        {Array.from({ length: 60 }, (_, i) => i).map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
      </select>
      <div className="flex rounded-2xl bg-black/5 p-0.5 dark:bg-white/10">
        <button type="button" className={`rounded-2xl px-3 py-1.5 text-sm font-black ${!cur.pm ? "bg-[#f5c542] text-[#1b3a57]" : "lms-toggle-off"}`} onClick={() => set(cur.hour, cur.minute, false)} data-testid={`${testId}-am`}>AM</button>
        <button type="button" className={`rounded-2xl px-3 py-1.5 text-sm font-black ${cur.pm ? "bg-[#f5c542] text-[#1b3a57]" : "lms-toggle-off"}`} onClick={() => set(cur.hour, cur.minute, true)} data-testid={`${testId}-pm`}>PM</button>
      </div>
    </div>
  );
}

export function FormatWhen({ ms, className = "" }: { ms: number; className?: string }) {
  const { lang } = useTr();
  const { zone } = useViewerZone();
  if (!ms) return null;
  return <span className={className}>{fmtWhen(ms, lang, zone)} · {zoneLabel(zone, ms)}</span>;
}

export function ZoneChip({ tz, ms = Date.now() }: { tz?: string; ms?: number }) {
  const z = tz || resolveZone();
  return <span className="whitespace-nowrap text-xs font-bold opacity-70">{zoneLabel(z, ms)}</span>;
}

export function TimeZoneCard({ asAdmin = false }: { asAdmin?: boolean }) {
  const { tr, lang } = useTr();
  const { pref, zone, save, device } = useViewerZone(asAdmin);
  const [msg, setMsg] = useState("");
  return (
    <section className="space-y-2 rounded-3xl bg-white/80 p-5 shadow-sm dark:bg-white/5" data-testid="tz-card">
      <h2 className="text-xl font-extrabold">🕒 {tr("Time zone", "المنطقة الزمنية")}</h2>
      <p className="text-sm opacity-80">{tr("Times are shown in your zone. Auto follows this device when you travel. The school default is Dubai.", "تُعرض الأوقات حسب منطقتك. الوضع التلقائي يتبع هذا الجهاز عند السفر. إعداد المدرسة هو دبي.")}</p>
      <TimeZonePicker value={pref} allowAuto onChange={(z) => { void save(z).then(() => setMsg(tr("Saved.", "تم الحفظ."))); }} />
      <p className="text-sm font-semibold opacity-80">{tr("Right now", "الآن")}: {fmtTime12(Date.now(), lang, zone)} · {zoneLabel(zone)} {pref === TZ_AUTO ? ` (${tr("device", "الجهاز")}: ${zoneCity(device)})` : ""}</p>
      {asAdmin && <p className="text-xs opacity-70">{tr("School default", "إعداد المدرسة")}: {zoneLabel(SITE_TZ)}</p>}
      {msg && <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200" role="status">{msg}</p>}
    </section>
  );
}

export function SchedulePreview({ date, time, tz, lang }: { date: string; time: string; tz: string; lang: string }) {
  const { tr } = useTr();
  const ms = zoneMs(date, time, tz);
  if (!ms) return null;
  const school = previewInZone(ms, lang, SITE_TZ);
  const same = tz === SITE_TZ;
  return (
    <p className="text-sm font-bold text-[#1b3a57] dark:text-amber-100" data-testid="sched-tz-preview">
      {same ? `${tr("Starts at", "تبدأ عند")} ${fmtTime12(ms, lang, tz)} ${tr("in", "في")} ${zoneCity(tz)}` : `${tr("This is", "هذا يعادل")} ${school}.`}
    </p>
  );
}

export { SITE_TZ, zoneMs, zoneParts, zoneLabel, fmtTime12, fmtWhen, previewInZone };
