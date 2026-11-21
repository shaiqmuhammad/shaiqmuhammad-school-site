"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lp, type Pack } from "@/lib/packs";
import { SlideView } from "@/components/lms/packs/SlideView";
import { lmsApi, lmsErrorText, type LiveMember, type LivePresent as Present, type PointCat } from "@/lib/lms";
import { primaryBtn } from "@/components/assessment/AssessmentShell";

function presentStudents(members: LiveMember[]) {
  return members.filter((m) => m.role !== "teacher" && m.present);
}

export function LivePresent({ roomId, present, isHost, canPresent, asAdmin, selfId, members, onPresent }: {
  roomId: string; present?: Present | null; isHost: boolean; canPresent: boolean; asAdmin: boolean;
  selfId: string; members: LiveMember[]; onPresent: (p: Present | null) => void;
}) {
  const { tr } = useTr();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [pack, setPack] = useState<Pack | null>(null);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [localSlide, setLocalSlide] = useState(0);
  const [answer, setAnswer] = useState("");
  const [cats, setCats] = useState<PointCat[]>([]);
  const [now, setNow] = useState(Date.now());
  const draw = useRef<{ pts: number[]; drawing: boolean }>({ pts: [], drawing: false });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!canPresent && !present?.packId) return;
    lp.list(asAdmin).then((r) => setPacks(r.items || [])).catch(() => undefined);
  }, [asAdmin, canPresent, present?.packId]);
  useEffect(() => {
    if (!present?.packId) { setPack(null); return; }
    lp.get(present.packId, asAdmin).then((r) => setPack(r.pack)).catch(() => setErr(tr("Couldn't open that lesson pack.", "تعذر فتح حزمة الدرس.")));
  }, [present?.packId, asAdmin, tr]);
  useEffect(() => {
    if (!isHost) return;
    lmsApi.pcatList().then((r) => setCats(r.items || [])).catch(() => undefined);
  }, [isHost]);
  useEffect(() => {
    if (!present?.timerEnd) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [present?.timerEnd]);

  const follow = !!present?.follow;
  useEffect(() => { if (!follow && present) setLocalSlide(present.slide || 0); }, [follow, present?.slide]);
  const slides = pack?.slides || [];
  const teacherSlide = Math.max(0, Math.min(slides.length ? slides.length - 1 : 0, present?.slide || 0));
  const slide = (isHost || follow) ? teacherSlide : localSlide;
  const cur = slides[slide];
  const isTask = cur?.part === "activity";
  const canDraw = !!(present && (isHost || present.penId === selfId));
  const left = present?.timerEnd ? Math.max(0, Math.ceil((present.timerEnd - now) / 1000)) : null;

  const call = useCallback(async (body: Record<string, unknown>) => {
    const r = await lmsApi.livePresent(roomId, body, asAdmin);
    if (r.present !== undefined) onPresent(r.present || null);
    return r;
  }, [roomId, asAdmin, onPresent]);

  async function start() {
    const p = packs.find((x) => x.id === pick);
    if (!p) return;
    setBusy(true); setErr("");
    try { await call({ op: "start", packId: p.id, packTitle: p.title }); }
    catch (e) { setErr(lmsErrorText(e, tr)); }
    finally { setBusy(false); }
  }
  async function go(n: number) {
    const next = Math.max(0, Math.min(slides.length - 1, n));
    if (isHost) await call({ op: "nav", slide: next }).catch((e) => setErr(lmsErrorText(e, tr)));
    else setLocalSlide(next);
  }

  function pointer(e: React.PointerEvent<SVGSVGElement>, end = false) {
    if (!canDraw || !present || present.tool !== "board") return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    if (e.type === "pointerdown") {
      draw.current = { pts: [x, y], drawing: true };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (!draw.current.drawing) return;
    draw.current.pts.push(x, y);
    if (end || e.type === "pointerup" || e.type === "pointercancel") {
      const d = draw.current.pts;
      draw.current = { pts: [], drawing: false };
      if (d.length >= 4) lmsApi.livePresent(roomId, { op: "stroke", stroke: { c: "#1b3a57", w: 3, d } }, asAdmin).catch(() => undefined);
    }
  }

  async function spin() {
    const people = presentStudents(members);
    if (people.length < 1) { setErr(tr("No students are in the room yet.", "لا يوجد طلاب في الحصة بعد.")); return; }
    const list = people.length === 1 ? people : people;
    const i = Math.floor(Math.random() * list.length);
    const winner = list[i];
    const extra = 5 + Math.random() * 3;
    const spinTo = (present?.wheelAngle || 0) + extra * 360 + (i * (360 / list.length));
    await call({ op: "nav", tool: "wheel", wheelAngle: present?.wheelAngle || 0, wheelSpinTo: spinTo, wheelAt: Date.now(), winnerId: winner.id, winnerName: winner.name });
  }

  async function randomise(kind: "one" | "groups" | "number") {
    const people = presentStudents(members);
    let text = "";
    if (kind === "number") text = String(1 + Math.floor(Math.random() * 30));
    else if (!people.length) { setErr(tr("No students are in the room yet.", "لا يوجد طلاب في الحصة بعد.")); return; }
    else if (kind === "one") text = people[Math.floor(Math.random() * people.length)].name;
    else {
      const sh = [...people].sort(() => Math.random() - 0.5);
      const n = Math.max(2, Math.min(4, Math.ceil(sh.length / 3)));
      const groups: string[][] = Array.from({ length: Math.ceil(sh.length / n) }, () => []);
      sh.forEach((p, i) => groups[i % groups.length].push(p.name));
      text = groups.map((g, i) => `${tr("Group", "مجموعة")} ${i + 1}: ${g.join(", ")}`).join(" · ");
    }
    await call({ op: "nav", tool: "rand", randText: text });
  }

  async function award(cat: string, who: "winner" | "all" | string) {
    const people = presentStudents(members);
    const ids = who === "all" ? people.map((p) => p.id) : who === "winner" ? (present?.winnerId ? [present.winnerId] : []) : [who];
    if (!ids.length) { setErr(tr("Pick a student who is in the room.", "اختر طالبًا موجودًا في الحصة.")); return; }
    try {
      const r = await lmsApi.ptsAward(cat, ids);
      setErr("");
      await call({ op: "nav", tool: "award", randText: tr(`Awarded ${r.count} student(s).`, `تم منح ${r.count} من الطلاب.`) });
    } catch (e) { setErr(lmsErrorText(e, tr)); }
  }

  async function sendAnswer() {
    const text = answer.trim();
    if (!text || !present) return;
    setBusy(true);
    try {
      await lmsApi.livePresent(roomId, { op: "answer", slide, text }, asAdmin);
      if (present.packId) {
        const work = (pack?.slides || []).map((s, i) => ({ ...s, els: i === slide ? [{ id: `a${Date.now().toString(36)}`, t: "text" as const, text, x: 8, y: 70, w: 84, h: 22, color: "#1b3a57", font: "Nunito", size: 28, by: "s" as const }] : [] }));
        await lp.workSave(present.packId, work, [slide]).catch(() => undefined);
      }
      setAnswer("");
    } catch (e) { setErr(lmsErrorText(e, tr)); }
    finally { setBusy(false); }
  }

  if (!present && !canPresent) return null;

  const people = presentStudents(members);
  const wheelNames = people.length ? people : [];

  return (
    <section className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5 dark:bg-slate-800" data-testid="live-present">
      {err && <p className="mb-2 rounded-2xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-100" role="alert">{err}</p>}

      {!present && canPresent && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-sm font-bold">{tr("Present a lesson pack", "عرض حزمة درس")}
            <select className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 font-semibold dark:bg-slate-900" value={pick} onChange={(e) => setPick(e.target.value)} data-testid="live-present-pick">
              <option value="">{tr("Choose a pack…", "اختر حزمة…")}</option>
              {packs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <button type="button" className={primaryBtn} disabled={busy || !pick} onClick={start} data-testid="live-present-start">📑 {tr("Present", "عرض")}</button>
        </div>
      )}

      {present && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-black" dir="auto">📑 {present.packTitle}</h3>
            <div className="flex flex-wrap gap-2">
              {left !== null && (
                <span className={`rounded-full px-3 py-1 font-mono text-base font-extrabold tabular-nums ${left === 0 ? "bg-rose-600 text-white" : left <= 30 ? "animate-pulse bg-amber-400 text-[#1b2f44]" : "bg-[#1b3a57] text-[#f5c542]"}`} data-testid="live-present-timer">⏱ {left === 0 ? tr("Time's up!", "انتهى الوقت!") : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
              )}
              {isHost && canPresent && (
                <>
                  <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${present.follow ? "bg-emerald-300 text-[#10331c]" : "bg-black/10 dark:bg-white/10"}`} onClick={() => call({ op: "nav", follow: !present.follow })} data-testid="live-follow">{present.follow ? tr("Follow me: on", "تابعني: تشغيل") : tr("Follow me: off", "تابعني: إيقاف")}</button>
                  <button type="button" className="rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-800" onClick={() => call({ op: "stop" })}>{tr("Stop presenting", "إيقاف العرض")}</button>
                </>
              )}
              {!isHost && (
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-extrabold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100">{follow ? tr("Following your teacher", "تتابع معلمك") : tr("You can move freely", "يمكنك التنقل بحرية")}</span>
              )}
            </div>
          </div>

          {cur ? (
            <div className="relative overflow-hidden rounded-2xl ring-1 ring-black/10" style={{ containerType: "inline-size" }}>
              <SlideView slide={cur} asAdmin={asAdmin} live testId="live-present-slide" />
              <svg ref={svgRef} viewBox="0 0 100 56.25" className="absolute inset-0 h-full w-full touch-none" onPointerDown={pointer} onPointerMove={pointer} onPointerUp={(e) => pointer(e, true)} onPointerCancel={(e) => pointer(e, true)} data-testid="live-board">
                {(present.strokes || []).map((st, i) => (
                  <polyline key={i} fill="none" stroke={st.c || "#1b3a57"} strokeWidth={((st.w || 3) / 1600) * 100} strokeLinecap="round" strokeLinejoin="round" points={Array.from({ length: Math.floor((st.d || []).length / 2) }, (_, k) => `${st.d[k * 2]},${(st.d[k * 2 + 1] * 56.25) / 100}`).join(" ")} />
                ))}
              </svg>
            </div>
          ) : <p className="py-8 text-center font-semibold opacity-70">{tr("Loading slides…", "جارٍ تحميل الشرائح…")}</p>}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" disabled={(isHost || !follow) ? slide <= 0 : follow} onClick={() => go(slide - 1)}>◀</button>
            <span className="font-extrabold">{slide + 1} / {slides.length || 1}</span>
            <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" disabled={(isHost || !follow) ? slide >= slides.length - 1 : follow} onClick={() => go(slide + 1)}>▶</button>
          </div>

          {isHost && canPresent && (
            <div className="flex flex-wrap gap-2" data-testid="live-present-tools">
              <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${present.tool === "board" ? "bg-emerald-300" : "bg-black/10 dark:bg-white/10"}`} onClick={() => call({ op: "nav", tool: present.tool === "board" ? "" : "board" })}>✏️ {tr("Whiteboard", "السبورة")}</button>
              <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${present.tool === "wheel" ? "bg-emerald-300" : "bg-black/10 dark:bg-white/10"}`} onClick={() => call({ op: "nav", tool: present.tool === "wheel" ? "" : "wheel" })}>🎡 {tr("Spin wheel", "العجلة")}</button>
              <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${present.tool === "rand" ? "bg-emerald-300" : "bg-black/10 dark:bg-white/10"}`} onClick={() => call({ op: "nav", tool: present.tool === "rand" ? "" : "rand" })}>🎲 {tr("Randomiser", "العشوائي")}</button>
              <button type="button" className={`rounded-full px-3 py-1 text-sm font-bold ${present.tool === "award" ? "bg-emerald-300" : "bg-black/10 dark:bg-white/10"}`} onClick={() => call({ op: "nav", tool: present.tool === "award" ? "" : "award" })}>🃏 {tr("Reward Cards", "بطاقات المكافآت")}</button>
              <label className="flex items-center gap-1 text-sm font-bold">⏱
                <select className="rounded-full border border-black/10 bg-white px-2 py-1 dark:bg-slate-900" defaultValue="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v === "0") call({ op: "nav", timerEnd: null }); else if (v) call({ op: "nav", timerEnd: Date.now() + Number(v) * 1000 }); }} data-testid="live-timer-set">
                  <option value="">{tr("Timer", "مؤقت")}</option>
                  <option value="30">0:30</option>
                  <option value="60">1:00</option>
                  <option value="120">2:00</option>
                  <option value="300">5:00</option>
                  <option value="600">10:00</option>
                  <option value="0">{tr("Clear", "مسح")}</option>
                </select>
              </label>
              {present.tool === "board" && (
                <select className="rounded-full border border-black/10 bg-white px-2 py-1 text-sm font-bold dark:bg-slate-900" value={present.penId} onChange={(e) => call({ op: "nav", penId: e.target.value })} data-testid="live-pen">
                  <option value={members.find((m) => m.role === "teacher")?.id || ""}>{tr("Teacher has the pen", "القلم مع المعلم")}</option>
                  {people.map((m) => <option key={m.id} value={m.id}>{tr("Pen:", "القلم:")} {m.name}</option>)}
                </select>
              )}
              {present.tool === "board" && <button type="button" className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold dark:bg-white/10" onClick={() => call({ op: "nav", strokes: [] })}>{tr("Clear board", "مسح السبورة")}</button>}
            </div>
          )}

          {present.tool === "wheel" && (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-amber-50 p-3 dark:bg-amber-950/30" data-testid="live-wheel">
              <div className="relative h-48 w-48">
                <div className="absolute start-1/2 top-0 z-10 -translate-x-1/2 text-2xl">▼</div>
                <div className="h-full w-full rounded-full shadow-inner ring-4 ring-[#1b3a57]" style={{ background: wheelNames.length ? `conic-gradient(${wheelNames.map((_, i) => `${["#fde68a", "#a5f3fc", "#bbf7d0", "#fecdd3", "#ddd6fe", "#fed7aa"][i % 6]} ${i * (360 / wheelNames.length)}deg ${(i + 1) * (360 / wheelNames.length)}deg`).join(", ")})` : "#e5e7eb", transform: `rotate(${present.wheelSpinTo || present.wheelAngle || 0}deg)`, transition: present.wheelAt ? "transform 3.2s cubic-bezier(0.12, 0.7, 0.08, 1)" : "none" }} />
              </div>
              {isHost && <button type="button" className={primaryBtn} onClick={spin} disabled={wheelNames.length < 1}>🎡 {tr("Spin", "أدر")}</button>}
              {present.winnerName && <p className="text-xl font-black" dir="auto">⭐ {present.winnerName}</p>}
            </div>
          )}

          {present.tool === "rand" && (
            <div className="rounded-2xl bg-sky-50 p-3 text-center dark:bg-sky-950/30" data-testid="live-rand">
              {isHost && <div className="mb-2 flex flex-wrap justify-center gap-2">
                <button type="button" className={primaryBtn} onClick={() => randomise("one")}>{tr("Pick a student", "اختر طالبًا")}</button>
                <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" onClick={() => randomise("groups")}>{tr("Make groups", "كوّن مجموعات")}</button>
                <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" onClick={() => randomise("number")}>{tr("Random number", "رقم عشوائي")}</button>
              </div>}
              {present.randText && <p className="text-lg font-black" dir="auto">{present.randText}</p>}
            </div>
          )}

          {present.tool === "award" && isHost && (
            <div className="rounded-2xl bg-yellow-50 p-3 dark:bg-yellow-950/30" data-testid="live-award">
              <p className="mb-2 text-sm font-bold">{tr("Award Reward Cards to students who are in the room.", "امنح بطاقات المكافآت للطلاب الموجودين في الحصة.")}</p>
              {!cats.length ? <p className="text-sm font-semibold opacity-70">{tr("Add Reward Card types in Reward Cards first.", "أضف أنواع بطاقات المكافآت من بطاقات المكافآت أولًا.")}</p> : (
                <div className="flex flex-wrap gap-2">
                  {cats.map((c) => (
                    <span key={c.id} className="flex flex-wrap items-center gap-1 rounded-full bg-white px-2 py-1 text-sm font-bold dark:bg-slate-800">
                      {c.icon || "🃏"} {c.label}
                      <button type="button" className="rounded-full bg-emerald-200 px-2" onClick={() => award(c.id, "all")}>{tr("All here", "كل الحاضرين")}</button>
                      {present.winnerId && <button type="button" className="rounded-full bg-amber-200 px-2" onClick={() => award(c.id, "winner")}>{tr("Winner", "الفائز")}</button>}
                    </span>
                  ))}
                </div>
              )}
              {present.randText && present.tool === "award" && <p className="mt-2 font-bold">{present.randText}</p>}
            </div>
          )}

          {isTask && !isHost && (
            <form className="flex flex-col gap-2 rounded-2xl bg-violet-50 p-3 dark:bg-violet-950/30" onSubmit={(e) => { e.preventDefault(); sendAnswer(); }} data-testid="live-task">
              <label className="text-sm font-bold">{tr("Your answer", "إجابتك")}
                <textarea className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 dark:bg-slate-900" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={1000} />
              </label>
              <button type="submit" className={primaryBtn} disabled={busy || !answer.trim()}>{tr("Send to teacher", "أرسل إلى المعلم")}</button>
            </form>
          )}

          {isHost && isTask && (
            <div className="rounded-2xl bg-violet-50 p-3 dark:bg-violet-950/30" data-testid="live-task-host">
              <p className="mb-2 font-black">{tr("Live answers", "الإجابات المباشرة")} ({(present.answers || []).filter((a) => a.slide === slide).length})</p>
              <ul className="space-y-1 text-sm">
                {(present.answers || []).filter((a) => a.slide === slide).map((a) => (
                  <li key={a.userId} className="rounded-xl bg-white px-3 py-2 dark:bg-slate-800"><b dir="auto">{a.name}:</b> <span dir="auto">{a.text}</span></li>
                ))}
                {!(present.answers || []).some((a) => a.slide === slide) && <li className="opacity-70">{tr("No answers yet.", "لا توجد إجابات بعد.")}</li>}
              </ul>
              <p className="mt-2 text-xs font-semibold opacity-70">{tr("Student answers are saved to their Tasks work when this pack is assigned to them.", "تُحفظ إجابات الطلاب في عمل المهام عندما تكون هذه الحزمة مسندة إليهم.")}</p>
            </div>
          )}

          {!isHost && present.penId === selfId && <p className="text-center text-sm font-bold text-emerald-800 dark:text-emerald-200">{tr("You have the pen — draw on the board.", "القلم معك — ارسم على السبورة.")}</p>}
        </div>
      )}
    </section>
  );
}
