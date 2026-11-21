"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { primaryBtn } from "@/components/assessment/AssessmentShell";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, liveGuest, setLiveGuest, type LivePerms, type LiveSched, type RosterStudent } from "@/lib/lms";
import { SITE_TZ, fmtWhen, isValidZone, zoneCity, zoneLabel, zoneMs, zoneParts } from "@/lib/timeZone";
import { FormatWhen, SchedulePreview, Time12Field, TimeZonePicker, ZoneChip, useViewerZone } from "@/components/lms/TimeZonePicker";
import { classroomHref, classroomJoinUrl } from "@/lib/classroom";

const DURS = [15, 30, 40, 45, 60, 75, 90, 120];

/** @deprecated prefer zoneParts — kept for timetable deep-links that assumed Dubai wall clock. */
export function dubaiParts(ms = Date.now()) { return zoneParts(ms, SITE_TZ); }
export function dubaiMs(date: string, time: string) { return zoneMs(date, time, SITE_TZ); }
export function fmtDubai(ms: number, lang: string) { return fmtWhen(ms, lang, SITE_TZ); }

export function liveJoinHref(s: LiveSched) {
  if (s.roomId) return s.roomId;
  return "";
}

function audienceLabel(s: LiveSched, tr: (en: string, ar: string) => string) {
  if (s.kind === "meeting") return tr("Meeting (share link)", "اجتماع (رابط مشاركة)");
  if (s.studentName || s.studentId) return s.studentName || tr("One student", "طالب واحد");
  if (s.groupId) return tr("Group", "مجموعة");
  return [s.cls, s.section].filter(Boolean).join(" · ") || tr("Class", "صف");
}

export function LiveUpcomingBanner() {
  const { tr, lang } = useTr();
  const { zone } = useViewerZone();
  const [items, setItems] = useState<LiveSched[]>([]);
  useEffect(() => {
    const load = () => { if (!document.hidden) lmsApi.liveSchedList().then((r) => setItems((r.items || []).filter((x) => x.status === "scheduled" || x.status === "live"))).catch(() => undefined); };
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);
  const now = Date.now();
  const soon = items.filter((s) => s.ends > now).slice(0, 3);
  if (!soon.length) return null;
  return (
    <div className="space-y-2" data-testid="live-upcoming">
      {soon.map((s) => {
        const join = s.roomId && s.status === "live" && now >= s.starts - 10 * 60_000;
        return (
          <a key={s.id} href={join ? classroomHref({ room: s.roomId }) : "/lms/live"} target={join ? "_blank" : undefined} rel={join ? "noopener noreferrer" : undefined} className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-fuchsia-200 to-orange-200 px-5 py-4 text-[#1b3a57] shadow-lg transition hover:scale-[1.01] dark:from-fuchsia-900/80 dark:to-amber-900/70 dark:text-white" data-testid="live-upcoming-item">
            <span className="text-3xl" aria-hidden>🎥</span>
            <span className="min-w-0 flex-1">
              <b className="block truncate" dir="auto">{s.title}</b>
              <span className="text-sm opacity-80">{fmtWhen(s.starts, lang, zone)} · <ZoneChip tz={zone} ms={s.starts} /> · {s.teacherName}</span>
            </span>
            <span className={`rounded-full px-4 py-2 font-extrabold ${join ? "bg-[#0b1b2b] text-sun" : "bg-white/80 dark:bg-slate-800"}`}>{join ? tr("Join", "انضم") : tr("Upcoming", "قادمة")}</span>
          </a>
        );
      })}
    </div>
  );
}

export function LiveSchedulePanel({ asAdmin, perms, onStart, busy }: { asAdmin: boolean; perms: LivePerms; onStart: (roomId: string) => void; busy?: boolean }) {
  const { tr, lang } = useTr();
  const { zone: viewerZone } = useViewerZone(asAdmin);
  const [formTz, setFormTz] = useState(viewerZone || SITE_TZ);
  const [items, setItems] = useState<LiveSched[]>([]);
  const [packs, setPacks] = useState<{ id: string; title: string }[]>([]);
  const [options, setOptions] = useState<{ cls: string; section: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [edId, setEdId] = useState("");
  const nowParts = zoneParts(Date.now() + 60 * 60_000, formTz);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(nowParts.date);
  const [time, setTime] = useState(nowParts.time);
  const [duration, setDuration] = useState(45);
  const [pick, setPick] = useState("");
  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [packId, setPackId] = useState("");
  const [who, setWho] = useState<"class" | "student" | "group">("class");
  const [linkFor, setLinkFor] = useState<{ id: string; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await lmsApi.liveSchedList(asAdmin);
    setItems(r.items || []);
    setPacks(r.packs || []);
    setOptions(r.options || []);
    setGroups(r.groups || []);
    if (!pick && r.options?.[0]) setPick(r.options[0].section ? `${r.options[0].cls}|${r.options[0].section}` : r.options[0].cls);
  }, [asAdmin, pick]);

  useEffect(() => { load().catch((e) => setErr(lmsErrorText(e, tr))); }, [load, tr]);
  useEffect(() => {
    if (!perms.schedStudent && !asAdmin) return;
    lmsApi.classRoster(asAdmin).then((r) => setStudents(r.students || [])).catch(() => undefined);
  }, [asAdmin, perms.schedStudent]);
  useEffect(() => { if (viewerZone) setFormTz(viewerZone); }, [viewerZone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("schedule") !== "1") return;
    setOpen(true);
    if (q.get("title")) setTitle(q.get("title") || "");
    if (q.get("date") || q.get("s")) {
      const ms = zoneMs(q.get("date") || nowParts.date, q.get("s") || nowParts.time, SITE_TZ);
      const shown = zoneParts(ms || Date.now(), formTz);
      if (q.get("date") || q.get("s")) { setDate(shown.date); setTime(shown.time); }
    }
    if (q.get("s") && q.get("e")) {
      const [sh, sm] = (q.get("s") || "0:0").split(":").map(Number);
      const [eh, em] = (q.get("e") || "0:0").split(":").map(Number);
      const mins = Math.max(10, Math.min(180, (eh * 60 + em) - (sh * 60 + sm)));
      const near = DURS.reduce((a, b) => (Math.abs(b - mins) < Math.abs(a - mins) ? b : a), 45);
      setDuration(mins >= 10 ? mins : near);
    }
    const cls = q.get("cls") || "";
    const section = q.get("section") || "";
    if (cls) { setWho("class"); setPick(section ? `${cls}|${section}` : cls); }
  }, []);

  const reset = () => {
    const p = zoneParts(Date.now() + 60 * 60_000, formTz);
    setEdId(""); setTitle(""); setDate(p.date); setTime(p.time); setDuration(45); setGroupId(""); setStudentId(""); setPackId(""); setWho("class"); setOpen(true);
  };
  const edit = (s: LiveSched) => {
    const p = zoneParts(s.starts, formTz);
    setEdId(s.id); setTitle(s.title); setDate(p.date); setTime(p.time); setDuration(s.duration);
    setGroupId(s.groupId); setStudentId(s.studentId); setPackId(s.packId);
    setWho(s.studentId ? "student" : s.groupId ? "group" : "class");
    setPick(s.section ? `${s.cls}|${s.section}` : s.cls);
    setOpen(true);
  };

  async function save() {
    setSaving(true); setErr("");
    try {
      const starts = zoneMs(date, time, formTz);
      if (!starts) throw new Error("bad_time");
      const [cls, section] = who === "class" ? (pick.includes("|") ? pick.split("|") : [pick, ""]) : ["", ""];
      await lmsApi.liveSchedSave({
        id: edId || undefined,
        title: title.trim() || undefined,
        starts,
        duration,
        cls: who === "class" ? cls : undefined,
        section: who === "class" ? section : undefined,
        groupId: who === "group" ? groupId || undefined : undefined,
        studentId: who === "student" ? studentId || undefined : undefined,
        packId: packId || undefined,
      }, asAdmin);
      setOpen(false);
      setEdId("");
      await load();
    } catch (e) { setErr(lmsErrorText(e, tr)); }
    finally { setSaving(false); }
  }

  async function cancel(id: string) {
    if (!confirm(tr("Cancel this scheduled live lesson?", "إلغاء هذه الحصة المباشرة المجدولة؟"))) return;
    try { await lmsApi.liveSchedCancel(id, asAdmin); await load(); } catch (e) { setErr(lmsErrorText(e, tr)); }
  }

  async function makeLink(s: LiveSched) {
    try {
      const r = await lmsApi.liveSchedLink(s.id, false, asAdmin);
      const url = classroomJoinUrl(r.token || s.linkToken || "");
      setLinkFor({ id: s.id, url });
      await load();
    } catch (e) { setErr(lmsErrorText(e, tr)); }
  }

  async function revoke(id: string) {
    try { await lmsApi.liveSchedLink(id, true, asAdmin); setLinkFor(null); await load(); } catch (e) { setErr(lmsErrorText(e, tr)); }
  }

  const now = Date.now();
  const upcoming = useMemo(() => items.filter((s) => s.status === "scheduled" || s.status === "live"), [items]);
  const canForm = perms.schedule;
  if (!canForm && !upcoming.length) return null;

  return (
    <section className="space-y-3" data-testid="live-schedule">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black">{tr("Scheduled lessons", "الحصص المجدولة")}</h2>
        {canForm && <button type="button" className={primaryBtn} onClick={reset} data-testid="live-sched-new">📅 {tr("Schedule a live lesson", "جدولة حصة مباشرة")}</button>}
      </div>
      {err && <p className="rounded-2xl bg-rose-100 px-4 py-2 text-sm font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-100" role="alert">{err}</p>}

      {open && canForm && (
        <div className="lms-card rounded-3xl p-5 shadow-sm ring-1 ring-black/10 dark:ring-white/10" data-testid="live-sched-form">
          <h3 className="mb-3 text-base font-black text-[#1b3a57] dark:text-[#fff8ec]">{edId ? tr("Edit scheduled lesson", "تعديل الحصة المجدولة") : tr("New scheduled lesson", "حصة مجدولة جديدة")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="lms-label sm:col-span-2">{tr("Title", "العنوان")}
              <input className="lms-field mt-1 w-full rounded-2xl px-3 py-2.5 font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Live Lesson", "الحصة المباشرة")} />
            </label>
            <label className="lms-label">{tr("Date", "التاريخ")}
              <input type="date" className="lms-field mt-1 w-full rounded-2xl px-3 py-2.5 font-semibold" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="lms-label">{tr("Start time", "وقت البداية")}
              <div className="mt-1"><Time12Field value={time} onChange={setTime} testId="live-sched-time" /></div>
            </label>
            <label className="lms-label sm:col-span-2">{tr("Time zone", "المنطقة الزمنية")}
              <div className="mt-1"><TimeZonePicker value={formTz} onChange={setFormTz} id="live-sched-tz" /></div>
            </label>
            <div className="sm:col-span-2"><SchedulePreview date={date} time={time} tz={formTz} lang={lang} /></div>
            <label className="lms-label">{tr("Duration", "المدة")}
              <select className="lms-field mt-1 w-full rounded-2xl px-3 py-2.5 font-semibold" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {!DURS.includes(duration) && <option value={duration}>{duration} {tr("min", "د")}</option>}
                {DURS.map((d) => <option key={d} value={d}>{d} {tr("minutes", "دقيقة")}</option>)}
              </select>
            </label>
            <label className="lms-label">{tr("Lesson pack (optional)", "حزمة الدرس (اختياري)")}
              <select className="lms-field mt-1 w-full rounded-2xl px-3 py-2.5 font-semibold" value={packId} onChange={(e) => setPackId(e.target.value)}>
                <option value="">{tr("None", "بدون")}</option>
                {packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="lms-label">{tr("With", "مع")}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {perms.schedClass && <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${who === "class" ? "lms-toggle-on" : "lms-toggle-off"}`} onClick={() => setWho("class")}>{tr("Class or section", "صف أو شعبة")}</button>}
                {!!groups.length && <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${who === "group" ? "lms-toggle-on" : "lms-toggle-off"}`} onClick={() => setWho("group")}>{tr("Group", "مجموعة")}</button>}
                {perms.schedStudent && <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${who === "student" ? "lms-toggle-on" : "lms-toggle-off"}`} onClick={() => setWho("student")}>{tr("One student", "طالب واحد")}</button>}
              </div>
              {who === "class" && (
                <select className="lms-field mt-2 w-full rounded-2xl px-3 py-2.5 font-semibold" value={pick} onChange={(e) => setPick(e.target.value)}>
                  {options.map((o) => { const v = o.section ? `${o.cls}|${o.section}` : o.cls; return <option key={v + o.section} value={v}>{o.section ? `${o.cls} · ${o.section}` : o.cls}</option>; })}
                </select>
              )}
              {who === "group" && (
                <select className="lms-field mt-2 w-full rounded-2xl px-3 py-2.5 font-semibold" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">{tr("Choose a group…", "اختر مجموعة…")}</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              {who === "student" && (
                <select className="lms-field mt-2 w-full rounded-2xl px-3 py-2.5 font-semibold" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">{tr("Choose a student…", "اختر طالبًا…")}</option>
                  {students.map((st) => <option key={st.id} value={st.id}>{st.name}{st.cls ? ` · ${st.cls}${st.section ? ` ${st.section}` : ""}` : ""}</option>)}
                </select>
              )}
              {who === "student" && (() => {
                const st = students.find((x) => x.id === studentId);
                const tz = st?.tz && isValidZone(st.tz) ? st.tz : "";
                if (!tz || tz === formTz) return null;
                return (
                  <button type="button" className="mt-2 rounded-2xl bg-amber-100 px-3 py-2 text-start text-sm font-bold text-[#1b3a57] dark:bg-amber-900/40 dark:text-amber-100" onClick={() => setFormTz(tz)} data-testid="live-sched-suggest-tz">
                    {tr(`This student usually uses ${zoneCity(tz)} (${zoneLabel(tz)}). Use their time zone?`, `هذا الطالب يستخدم عادة ${zoneCity(tz)} (${zoneLabel(tz)}). هل تستخدم منطقته الزمنية؟`)}
                  </button>
                );
              })()}
              {!perms.schedClass && !perms.schedStudent && !groups.length && (
                <p className="mt-2 text-sm font-semibold opacity-70">{tr("Your admin can also switch on scheduling with a class, section or student.", "يمكن للمسؤول أيضًا تفعيل الجدولة مع صف أو شعبة أو طالب.")}</p>
              )}
            </fieldset>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={primaryBtn} disabled={saving} onClick={save} data-testid="live-sched-save">{saving ? "…" : tr("Save", "حفظ")}</button>
            <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" onClick={() => setOpen(false)}>{tr("Close", "إغلاق")}</button>
          </div>
        </div>
      )}

      {!upcoming.length ? <p className="rounded-3xl bg-black/5 px-4 py-6 text-center font-semibold opacity-70 dark:bg-white/10">{tr("No upcoming scheduled lessons.", "لا توجد حصص مجدولة قادمة.")}</p> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {upcoming.map((s) => {
            const join = !!s.roomId && s.status === "live" && now >= s.starts - 10 * 60_000;
            const startOk = perms.run && s.mine && ((s.status === "scheduled" && now >= s.starts - 30 * 60_000 && now <= s.ends + 60 * 60_000) || (s.status === "live" && s.roomId));
            return (
              <li key={s.id} className="rounded-3xl bg-gradient-to-br from-sky-100 to-violet-200 p-4 dark:from-sky-900/50 dark:to-slate-800" data-testid="live-sched-card">
                <p className="text-lg font-black" dir="auto">{s.title}</p>
                <p className="text-sm font-semibold opacity-80">{fmtWhen(s.starts, lang, viewerZone)} · <ZoneChip tz={viewerZone} ms={s.starts} /> · {s.duration} {tr("min", "د")}</p>
                <p className="text-sm font-semibold opacity-80">{audienceLabel(s, tr)}{s.packTitle ? ` · 📑 ${s.packTitle}` : ""}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {join && <button type="button" className={primaryBtn} disabled={busy} onClick={() => onStart(s.roomId)}>{tr("Join", "انضم")}</button>}
                  {startOk && s.status === "scheduled" && !s.roomId && <button type="button" className={primaryBtn} disabled={busy} onClick={() => lmsApi.liveSchedStart(s.id, asAdmin).then((r) => onStart(r.id)).catch((e) => setErr(lmsErrorText(e, tr)))} data-testid="live-sched-start">{tr("Start", "ابدأ")}</button>}
                  {s.mine && s.status === "live" && s.roomId && <button type="button" className={primaryBtn} disabled={busy} onClick={() => onStart(s.roomId)}>{tr("Rejoin", "إعادة الدخول")}</button>}
                  {s.mine && s.status === "scheduled" && <button type="button" className="rounded-full bg-white/80 px-3 py-1 text-sm font-bold dark:bg-slate-700" onClick={() => edit(s)}>{tr("Edit", "تعديل")}</button>}
                  {s.mine && s.status === "scheduled" && <button type="button" className="rounded-full bg-white/80 px-3 py-1 text-sm font-bold text-rose-700 dark:bg-slate-700" onClick={() => cancel(s.id)}>{tr("Cancel", "إلغاء")}</button>}
                  {s.mine && perms.shareLink && s.status !== "cancelled" && (
                    s.hasLink
                      ? <>
                          <button type="button" className="rounded-full bg-white/80 px-3 py-1 text-sm font-bold dark:bg-slate-700" onClick={() => makeLink(s)} data-testid="live-sched-link">{tr("Copy join link", "نسخ رابط الانضمام")}</button>
                          <button type="button" className="rounded-full bg-white/80 px-3 py-1 text-sm font-bold text-rose-700 dark:bg-slate-700" onClick={() => revoke(s.id)}>{tr("Revoke link", "إلغاء الرابط")}</button>
                        </>
                      : <button type="button" className="rounded-full bg-white/80 px-3 py-1 text-sm font-bold dark:bg-slate-700" onClick={() => makeLink(s)} data-testid="live-sched-link">{tr("Create join link", "إنشاء رابط انضمام")}</button>
                  )}
                </div>
                {linkFor?.id === s.id && (
                  <p className="mt-2 break-all rounded-2xl bg-white/80 p-2 text-xs font-semibold dark:bg-slate-900">
                    {linkFor.url}
                    <button type="button" className="ms-2 font-bold text-emerald-700" onClick={() => navigator.clipboard.writeText(linkFor.url).catch(() => undefined)}>{tr("Copy", "نسخ")}</button>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function GuestJoin({ token }: { token: string }) {
  const { tr, lang } = useTr();
  const [info, setInfo] = useState<{ title: string; teacherName: string; starts: number; ends: number; canJoin: boolean; roomId: string; status: string } | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    lmsApi.liveLinkInfo(token).then((r) => { setInfo(r); setErr(""); }).catch((e) => setErr(lmsErrorText(e, tr)));
  }, [token, tr]);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!ready || !info?.canJoin || !info.roomId || !liveGuest()?.token) return;
    window.location.href = classroomHref({ room: info.roomId, guest: true });
  }, [ready, info]);

  if (!token) return <p className="p-8 text-center font-bold opacity-70">{tr("This join link is missing.", "رابط الانضمام ناقص.")}</p>;
  if (err && !info) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 rounded-[2rem] bg-gradient-to-br from-amber-100 to-rose-100 p-8 text-center dark:from-slate-800 dark:to-rose-950" data-testid="live-link-bad">
        <p className="text-6xl" aria-hidden>🔗</p>
        <h1 className="text-2xl font-black">{tr("This link isn't working", "هذا الرابط لا يعمل")}</h1>
        <p className="font-semibold opacity-80">{err}</p>
      </div>
    );
  }
  if (!info) return <p className="p-8 text-center font-bold opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 rounded-[2rem] bg-gradient-to-br from-fuchsia-200 via-orange-100 to-amber-200 p-8 text-center dark:from-fuchsia-900/70 dark:via-slate-800 dark:to-amber-900/40" data-testid="live-link-join" dir={lang === "ar" ? "rtl" : "ltr"}>
      <p className="text-6xl" aria-hidden>🎥</p>
      <h1 className="text-3xl font-black text-[#1b3a57] dark:text-white" dir="auto">{info.title}</h1>
      <p className="font-semibold opacity-80">{tr("With", "مع")} {info.teacherName}</p>
      <p className="text-sm font-bold opacity-70"><FormatWhen ms={info.starts} /></p>
      {err && <p className="rounded-2xl bg-rose-100 px-4 py-2 text-sm font-bold text-rose-800" role="alert">{err}</p>}
      <label className="w-full text-start text-sm font-bold">{tr("Your name", "اسمك")}
        <input className="lms-field mt-1 w-full rounded-2xl px-3 py-3 text-lg font-semibold" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Type your name", "اكتب اسمك")} maxLength={80} />
      </label>
      {!info.canJoin && <p className="font-semibold opacity-80">{info.roomId ? tr("Waiting for the teacher to start…", "بانتظار أن يبدأ المعلم…") : tr("The join button will appear when the lesson is ready.", "سيظهر زر الانضمام عندما تكون الحصة جاهزة.")}</p>}
      <button
        type="button"
        className={primaryBtn}
        disabled={busy || !name.trim() || !info.canJoin}
        data-testid="live-link-enter"
        onClick={async () => {
          setBusy(true); setErr("");
          try {
            const r = await lmsApi.liveLinkJoin(token, name.trim());
            setLiveGuest({ token: r.token, id: r.guestId, name: r.name });
            if (r.roomId && r.canJoin) {
              window.location.href = classroomHref({ room: r.roomId, guest: true });
            } else {
              setReady(true);
            }
          } catch (e) { setErr(lmsErrorText(e, tr)); }
          finally { setBusy(false); }
        }}
      >🚪 {tr("Join waiting room", "انضم إلى غرفة الانتظار")}</button>
      {ready && <p className="font-bold">{tr("You're in! We'll take you in when the teacher starts and admits you. Refresh this page in a moment.", "أنت هنا! سندخلك عندما يبدأ المعلم ويقبلك. حدّث الصفحة بعد لحظات.")}</p>}
    </div>
  );
}
