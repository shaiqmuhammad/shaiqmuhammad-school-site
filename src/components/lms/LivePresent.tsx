"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTr } from "@/components/lms/useLms";
import { firstSlideOf, lp, packHasPart, type Pack, type Part } from "@/lib/packs";
import { SlideView } from "@/components/lms/packs/SlideView";
import { lmsApi, lmsErrorText, normalizePtrKind, type LiveMember, type LivePresent as Present, type LivePtr, type PointCat, type PtrKind } from "@/lib/lms";
import { primaryBtn } from "@/components/assessment/AssessmentShell";
import { createPortal } from "react-dom";
import { LiveToolsTray, TeachToolsTray } from "@/components/lms/ClassroomTray";

function presentStudents(members: LiveMember[]) {
  return members.filter((m) => m.role !== "teacher" && m.present);
}

export function LivePresent({ roomId, present, isHost, canPresent, asAdmin, selfId, members, onPresent, onRoomFocus: _onRoomFocus, roomFocused: _roomFocused, layout = "full", trayRoot, teachRoot, ptrs = [], onPtr }: {
  roomId: string; present?: Present | null; isHost: boolean; canPresent: boolean; asAdmin: boolean;
  selfId: string; members: LiveMember[]; onPresent: (p: Present | null) => void;
  onRoomFocus?: () => void; roomFocused?: boolean; layout?: "full" | "side" | "compact" | "board";
  trayRoot?: HTMLElement | null; teachRoot?: HTMLElement | null;
  ptrs?: LivePtr[]; onPtr?: (x: number | null, y: number | null, kind?: PtrKind) => void;
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
  const [tasksOpen, setTasksOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const [contentKind, setContentKind] = useState<ContentKind>("lesson");
  const pendingKind = useRef<Part | "">("");
  const draw = useRef<{ pts: number[]; drawing: boolean }>({ pts: [], drawing: false });
  const svgRef = useRef<SVGSVGElement>(null);
  const [ptrKind, setPtrKind] = useState<PtrKind>("pen");
  const [drawTool, setDrawTool] = useState<"draw" | "highlighter" | "eraser">("draw");
  const [ink, setInk] = useState("#1b3a57");

  useEffect(() => {
    if (!present?.packId) setErr("");
    if (!canPresent && !present?.packId) return;
    lp.list(asAdmin).then((r) => setPacks(r.items || [])).catch(() => undefined);
  }, [asAdmin, canPresent, present?.packId]);
  useEffect(() => {
    if (!present?.packId) { setPack(null); return; }
    lmsApi.livePack(roomId, present.packId, asAdmin)
      .then((r) => {
        const next = r.pack as Pack;
        setPack(next);
        setErr("");
        const kind = pendingKind.current;
        if (kind && isHost) {
          const n = firstSlideOf(next.slides, kind, next.type);
          pendingKind.current = "";
          if (n > 0) void lmsApi.livePresent(roomId, { op: "nav", slide: n }, asAdmin).then((res) => { if (res.present !== undefined) onPresent(res.present || null); }).catch(() => undefined);
        }
      })
      .catch((e) => setErr(lmsErrorText(e, tr, ["Couldn't open that lesson pack.", "تعذر فتح حزمة الدرس."], tr("Open pack", "فتح الحزمة"))));
  }, [present?.packId, asAdmin, tr, roomId, isHost, onPresent]);
  useEffect(() => {
    if (!isHost) return;
    lmsApi.pcatList(asAdmin).then((r) => setCats(r.items || [])).catch(() => undefined);
  }, [isHost, asAdmin]);
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
  useEffect(() => { setTasksOpen(!!isTask); }, [isTask, slide]);
  const canDraw = !!(present && (isHost || present.penId === selfId));
  const left = present?.timerEnd ? Math.max(0, Math.ceil((present.timerEnd - now) / 1000)) : null;

  const call = useCallback(async (body: Record<string, unknown>) => {
    const r = await lmsApi.livePresent(roomId, body, asAdmin);
    if (r.present !== undefined) onPresent(r.present || null);
    return r;
  }, [roomId, asAdmin, onPresent]);

  async function startPack(p: Pack, kind: Part) {
    setBusy(true); setErr("");
    pendingKind.current = kind;
    try {
      const slide = firstSlideOf(p.slides, kind, p.type);
      await call({ op: "start", packId: p.id, packTitle: p.title, slide, follow: true });
      setContentOpen(false);
    } catch (e) {
      pendingKind.current = "";
      setErr(lmsErrorText(e, tr, ["Couldn't start presenting that lesson pack.", "تعذر بدء عرض حزمة الدرس."], tr("Present pack", "عرض الحزمة")));
    } finally { setBusy(false); }
  }
  async function start() {
    const p = packs.find((x) => x.id === pick);
    if (!p) return;
    await startPack(p, partForKind(contentKind));
  }
  async function go(n: number) {
    const next = Math.max(0, Math.min(slides.length - 1, n));
    if (isHost) await call({ op: "nav", slide: next }).catch((e) => setErr(lmsErrorText(e, tr, undefined, tr("Change slide", "تغيير الشريحة"))));
    else setLocalSlide(next);
  }

  const boardOn = !!(present && (present.tool === "board" || layout === "board"));
  const canLaser = !!(present && (isHost || present.penId === selfId));
  const hasPack = !!(present?.packId);
  function inkStroke() {
    if (drawTool === "highlighter") return { c: "rgba(245,197,66,0.45)", w: 18 };
    if (drawTool === "eraser") return { c: "erase", w: 18 };
    return { c: ink || "#1b3a57", w: 3 };
  }
  function pointer(e: React.PointerEvent<SVGSVGElement>, end = false) {
    if (!present) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    if (canLaser && (e.type === "pointermove" || e.type === "pointerdown") && !end) onPtr?.(x, y, ptrKind);
    if (end || e.type === "pointerup" || e.type === "pointercancel" || e.type === "pointerleave") onPtr?.(null, null, ptrKind);
    if (!canDraw || !boardOn) return;
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
      if (d.length >= 4) lmsApi.livePresent(roomId, { op: "stroke", stroke: { ...inkStroke(), d } }, asAdmin).catch(() => undefined);
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
      const r = await lmsApi.ptsAward(cat, ids, asAdmin);
      setErr("");
      await call({ op: "nav", tool: "award", randText: tr(`Awarded ${r.count} student(s).`, `تم منح ${r.count} من الطلاب.`) });
    } catch (e) { setErr(lmsErrorText(e, tr, undefined, tr("Award cards", "بطاقات المكافآت"))); }
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
    } catch (e) { setErr(lmsErrorText(e, tr, undefined, tr("Send answer", "إرسال الإجابة"))); }
    finally { setBusy(false); }
  }

  if (!present && !canPresent) return null;

  const people = presentStudents(members);
  const wheelNames = people.length ? people : [];

  const tray = (
    <LiveToolsTray
      docked
      isHost={isHost && canPresent}
      tool={present?.tool || ""}
      onTool={(id) => {
        if (id === "board" && !present) void lmsApi.livePresent(roomId, { op: "board" }, asAdmin).then((r) => { if (r.present !== undefined) onPresent(r.present || null); }).catch((e) => setErr(lmsErrorText(e, tr, undefined, tr("Whiteboard", "السبورة"))));
        else if (present) void call({ op: "nav", tool: id });
      }}
      onTimer={(s) => { if (present) void call({ op: "nav", timerEnd: s == null ? null : Date.now() + s * 1000 }); }}
      onTasks={() => setTasksOpen((v) => !v)}
      taskOn={!!isTask && tasksOpen}
      onOpen={() => setContentOpen((v) => !v)}
      openOn={contentOpen || (!present && canPresent && layout !== "board")}
    />
  );

  const toolOverlay = present && (present.tool === "wheel" || present.tool === "rand" || present.tool === "award" || (isTask && tasksOpen)) ? (
    <div className="lb-overlay" data-testid="live-tool-overlay">
      {present.tool === "wheel" && (
        <div className="lb-wheel-card" data-testid="live-wheel">
          <div className="relative mx-auto h-48 w-48">
            <div className="absolute start-1/2 top-0 z-10 -translate-x-1/2 text-2xl">▼</div>
            <div className="h-full w-full rounded-full shadow-inner ring-4 ring-[#1b3a57]" style={{ background: wheelNames.length ? `conic-gradient(${wheelNames.map((_, i) => `${["#fde68a", "#a5f3fc", "#bbf7d0", "#fecdd3", "#ddd6fe", "#fed7aa"][i % 6]} ${i * (360 / wheelNames.length)}deg ${(i + 1) * (360 / wheelNames.length)}deg`).join(", ")})` : "#e5e7eb", transform: `rotate(${present.wheelSpinTo || present.wheelAngle || 0}deg)`, transition: present.wheelAt ? "transform 3.2s cubic-bezier(0.12, 0.7, 0.08, 1)" : "none" }} />
          </div>
          {isHost && <button type="button" className="lb-spin mt-3" onClick={spin} disabled={wheelNames.length < 1}>🎡 {tr("Spin", "أدر")}</button>}
          {present.winnerName && <p className="mt-2 text-xl font-black" dir="auto">⭐ {present.winnerName}</p>}
        </div>
      )}
      {present.tool === "rand" && (
        <div className="lb-tool-card" data-testid="live-rand">
          {isHost && <div className="mb-2 flex flex-wrap justify-center gap-2">
            <button type="button" className={primaryBtn} onClick={() => randomise("one")}>{tr("Pick a student", "اختر طالبًا")}</button>
            <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" onClick={() => randomise("groups")}>{tr("Make groups", "كوّن مجموعات")}</button>
            <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" onClick={() => randomise("number")}>{tr("Random number", "رقم عشوائي")}</button>
          </div>}
          {present.randText && <p className="text-lg font-black" dir="auto">{present.randText}</p>}
        </div>
      )}
      {present.tool === "award" && isHost && (
        <div className="lb-tool-card" data-testid="live-award">
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
          {present.randText && <p className="mt-2 font-bold">{present.randText}</p>}
        </div>
      )}
      {isTask && tasksOpen && !isHost && (
        <form className="lb-tool-card flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); sendAnswer(); }} id="live-task-panel" data-testid="live-task">
          <label className="text-sm font-bold">{tr("Your answer", "إجابتك")}
            <textarea className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 dark:bg-slate-900" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={1000} />
          </label>
          <button type="submit" className={primaryBtn} disabled={busy || !answer.trim()}>{tr("Send to teacher", "أرسل إلى المعلم")}</button>
        </form>
      )}
      {isHost && isTask && tasksOpen && (
        <div className="lb-tool-card" id="live-task-panel" data-testid="live-task-host">
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
    </div>
  ) : null;

  const teacherId = members.find((m) => m.role === "teacher")?.id || "";
  const teach = (canLaser || canDraw) ? (
    <TeachToolsTray
      canPoint={canLaser}
      canDraw={!!(canDraw && boardOn)}
      ptrKind={ptrKind}
      onPtrKind={(id) => { setPtrKind(id); }}
      drawTool={drawTool}
      onDrawTool={setDrawTool}
      ink={ink}
      onInk={(c) => { setInk(c); setDrawTool("draw"); }}
      onUndo={isHost && canPresent && boardOn ? () => { void call({ op: "nav", strokes: (present?.strokes || []).slice(0, -1) }); } : undefined}
      onClear={isHost && canPresent && boardOn ? () => { void call({ op: "nav", strokes: [] }); } : undefined}
      penId={present?.penId}
      onPen={isHost && canPresent && boardOn ? (id) => { void call({ op: "nav", penId: id || teacherId }); } : undefined}
      people={people}
    />
  ) : null;

  return (
    <section className="lb-present flex min-h-0 flex-1 flex-col" data-testid="live-present" data-layout={layout}>
      {trayRoot ? createPortal(tray, trayRoot) : null}
      {teachRoot && teach ? createPortal(teach, teachRoot) : teach}
      {err && <p className="m-2 rounded-2xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-100" role="alert">{err}</p>}

      {!present && canPresent && layout === "board" && (
        <div className="lb-slide-body lb-board-on" data-testid="live-board-opening">
          <div className="lb-slide-wrap"><div className="lb-board-surface" /><p className="relative z-[1] font-bold opacity-70">{tr("Opening the whiteboard…", "جارٍ فتح السبورة…")}</p></div>
        </div>
      )}

      {canPresent && (contentOpen || (!present && layout !== "board")) && (
        <ContentPicker
          packs={packs}
          kind={contentKind}
          onKind={setContentKind}
          busy={busy}
          onOpen={(p, kind) => void startPack(p, kind)}
          onClose={present ? () => setContentOpen(false) : undefined}
        />
      )}

      {present && (
        <>
          <div className="lb-slide-bar">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="lb-eyebrow">{boardOn && !hasPack ? tr("Whiteboard", "السبورة") : contentEyebrow(cur?.part || pack?.type, tr)}</div>
                <h3 dir="auto">{hasPack ? present.packTitle : tr("Whiteboard", "السبورة")}</h3>
                {hasPack && <div className="lb-slide-sub">{`${slide + 1} / ${slides.length || 1}`}</div>}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {left !== null && (
                  <span className={`rounded-full px-3 py-1 font-mono text-base font-extrabold tabular-nums ${left === 0 ? "bg-rose-600 text-white" : left <= 30 ? "animate-pulse bg-amber-400 text-[#1b2f44]" : "bg-[#f5c542] text-[#1b3a57]"}`} data-testid="live-present-timer">⏱ {left === 0 ? tr("Time's up!", "انتهى الوقت!") : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
                )}
                {isHost && canPresent && (
                  <>
                    <button type="button" className={`rounded-full px-3 py-1 text-xs font-bold ${present.follow ? "bg-emerald-300 text-[#10331c]" : "bg-white/15 text-white"}`} onClick={() => call({ op: "nav", follow: !present.follow })} data-testid="live-follow">{present.follow ? tr("Follow me: on", "تابعني: تشغيل") : tr("Follow me: off", "تابعني: إيقاف")}</button>
                    <button type="button" className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800" onClick={() => call({ op: "stop" })}>{tr("Stop presenting", "إيقاف العرض")}</button>
                  </>
                )}
                {!isHost && (
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold text-white">{follow ? tr("Following your teacher", "تتابع معلمك") : tr("You can move freely", "يمكنك التنقل بحرية")}</span>
                )}
              </div>
            </div>
          </div>

          <div className={`lb-slide-body${boardOn ? " lb-board-on" : ""}`}>
            <div className="lb-slide-wrap" style={{ containerType: "inline-size" }}>
              {boardOn && <div className="lb-board-surface" aria-hidden />}
              {cur && !boardOn && <div className="lb-zoom"><SlideView slide={cur} asAdmin={asAdmin} live testId="live-present-slide" /></div>}
              {cur && boardOn && <div className="lb-slide-bg"><SlideView slide={cur} asAdmin={asAdmin} live testId="live-present-slide" /></div>}
              {!cur && hasPack && !boardOn && <p className="flex-1 py-8 text-center font-semibold opacity-70">{tr("Loading slides…", "جارٍ تحميل الشرائح…")}</p>}
              <svg ref={svgRef} viewBox="0 0 100 56.25" preserveAspectRatio={boardOn ? "none" : "xMidYMid meet"} className={boardOn || canLaser ? "lb-board-svg touch-none" : "pointer-events-none absolute inset-0 h-full w-full"} onPointerDown={pointer} onPointerMove={pointer} onPointerUp={(e) => pointer(e, true)} onPointerCancel={(e) => pointer(e, true)} onPointerLeave={(e) => pointer(e, true)} data-testid="live-board">
                {(present.strokes || []).map((st, i) => (
                  <polyline key={i} fill="none" stroke={st.c === "erase" ? "#000" : (st.c || "#1b3a57")} strokeWidth={((st.w || 3) / 1600) * 100} strokeLinecap="round" strokeLinejoin="round" style={st.c === "erase" ? ({ mixBlendMode: "destination-out" } as unknown as CSSProperties) : undefined} points={Array.from({ length: Math.floor((st.d || []).length / 2) }, (_, k) => `${st.d[k * 2]},${(st.d[k * 2 + 1] * 56.25) / 100}`).join(" ")} />
                ))}
              </svg>
              {ptrs.filter((pt) => pt.on !== false).map((pt) => (
                <PointerMark key={pt.userId} pt={pt} />
              ))}
            </div>

            {hasPack && !boardOn && (
              <div className="lb-nav">
                <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" disabled={(isHost || !follow) ? slide <= 0 : follow} onClick={() => go(slide - 1)}>◀</button>
                <span className="font-extrabold">{slide + 1} / {slides.length || 1}</span>
                <button type="button" className="rounded-full bg-black/10 px-4 py-2 font-bold dark:bg-white/10" disabled={(isHost || !follow) ? slide >= slides.length - 1 : follow} onClick={() => go(slide + 1)}>▶</button>
              </div>
            )}


            {toolOverlay}
            {!isHost && present.penId === selfId && <p className="absolute bottom-24 start-0 end-0 z-[9] text-center text-sm font-bold text-emerald-800 dark:text-emerald-200">{tr("You have the pen — draw on the board.", "القلم معك — ارسم على السبورة.")}</p>}
          </div>
        </>
      )}
    </section>
  );
}


function PointerMark({ pt }: { pt: LivePtr }) {
  const kind = normalizePtrKind(pt.kind);
  return (
    <div className="lb-ptr" style={{ left: `${pt.x}%`, top: `${pt.y}%`, color: pt.color }} data-kind={kind} data-testid="live-laser">
      <PointerGlyph kind={kind} color={pt.color} />
      <div className="lb-ptr-name" dir="auto">{pt.name}</div>
    </div>
  );
}

function PointerGlyph({ kind, color }: { kind: PtrKind; color: string }) {
  if (kind === "laser") return <div className="lb-ptr-laser" />;
  if (kind === "hand") return <span className="lb-ptr-icon" aria-hidden>✋</span>;
  if (kind === "finger") return <span className="lb-ptr-icon" aria-hidden>👆</span>;
  if (kind === "arrow") {
    return (
      <svg className="lb-ptr-svg" viewBox="0 0 32 32" aria-hidden>
        <path d="M4 2 L4 24 L11 18 L16 30 L20 28 L15 16 L26 16 Z" fill={color} stroke="#fff8ec" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "stick") {
    return (
      <svg className="lb-ptr-svg" viewBox="0 0 72 72" aria-hidden>
        <line x1="62" y1="66" x2="16" y2="18" stroke="#8b5a2b" strokeWidth="5" strokeLinecap="round" />
        <line x1="62" y1="66" x2="16" y2="18" stroke="#d6a36a" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="14" cy="14" r="7" fill={color} stroke="#fff8ec" strokeWidth="2" />
      </svg>
    );
  }
  // default: a tidy felt-tip pen nib
  return (
    <svg className="lb-ptr-svg" viewBox="0 0 40 40" aria-hidden>
      <g transform="rotate(-35 20 20)">
        <rect x="17" y="8" width="6" height="20" rx="1.4" fill="#1b3a57" />
        <rect x="17" y="8" width="6" height="8" rx="1.2" fill="#f3c969" />
        <path d="M17 28 L23 28 L20 36 Z" fill={color} stroke="#1b3a57" strokeWidth="0.6" />
        <rect x="18.4" y="4" width="3.2" height="5" rx="1" fill="#24557a" />
      </g>
    </svg>
  );
}


type ContentKind = "lesson" | "task" | "activity" | "homework" | "quran";

const CONTENT_TABS: { id: ContentKind; icon: string; en: string; ar: string }[] = [
  { id: "lesson", icon: "🎤", en: "Lesson", ar: "درس" },
  { id: "task", icon: "✏️", en: "Task", ar: "مهمة" },
  { id: "activity", icon: "🎯", en: "Activity", ar: "نشاط" },
  { id: "homework", icon: "📝", en: "Homework", ar: "واجب" },
  { id: "quran", icon: "📖", en: "Quran Homework", ar: "واجب القرآن" },
];

function partForKind(kind: ContentKind): Part {
  if (kind === "task" || kind === "activity") return "activity";
  if (kind === "homework") return "homework";
  if (kind === "quran") return "quran";
  return "lesson";
}

function packMatches(p: Pack, kind: ContentKind): boolean {
  if (kind === "lesson") return packHasPart(p, "lesson") || (!packHasPart(p, "activity") && !packHasPart(p, "homework") && !packHasPart(p, "quran") && (p.type === "lesson" || p.type === "material" || !p.type));
  if (kind === "task") return packHasPart(p, "activity");
  if (kind === "activity") return p.type === "activity" || p.mode === "live" || packHasPart(p, "activity");
  if (kind === "homework") return packHasPart(p, "homework");
  return packHasPart(p, "quran");
}

function contentEyebrow(part: string | undefined, tr: (en: string, ar: string) => string) {
  if (part === "activity") return tr("Task", "مهمة");
  if (part === "homework") return tr("Homework", "واجب");
  if (part === "quran") return tr("Quran Homework", "واجب القرآن");
  if (part === "lesson") return tr("Lesson", "درس");
  return tr("Live lesson", "حصة مباشرة");
}

function ContentPicker({ packs, kind, onKind, busy, onOpen, onClose }: {
  packs: Pack[]; kind: ContentKind; onKind: (k: ContentKind) => void; busy: boolean;
  onOpen: (p: Pack, kind: Part) => void; onClose?: () => void;
}) {
  const { tr } = useTr();
  const items = packs.filter((p) => packMatches(p, kind));
  const tab = CONTENT_TABS.find((x) => x.id === kind);
  return (
    <div className="lb-content-picker" data-testid="live-content-picker">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-[#1b3a57] dark:text-[#fff8ec]">{tr("Library", "المكتبة")}</p>
          <p className="text-xs font-semibold text-[#334155] dark:text-[#cbd5e1]">{tr("Students follow you. Turn Follow me off if they should move freely.", "يتابعك الطلاب. أوقف «تابعني» إن أردت أن يتنقلوا بأنفسهم.")}</p>
        </div>
        {onClose && <button type="button" className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-[#1b3a57] dark:bg-white/15 dark:text-[#fff8ec]" onClick={onClose} data-testid="live-content-close">{tr("Close", "إغلاق")}</button>}
      </div>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label={tr("Content type", "نوع المحتوى")}>
        {CONTENT_TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={kind === x.id}
            className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${kind === x.id ? "bg-[#1b3a57] text-[#fff8ec] dark:bg-[#f3c969] dark:text-[#1b3a57]" : "bg-[#e8eef5] text-[#1b3a57] dark:bg-[#1b3a57] dark:text-[#fff8ec]"}`}
            onClick={() => onKind(x.id)}
            data-testid={`live-content-tab-${x.id}`}
          >{x.icon} {tr(x.en, x.ar)}</button>
        ))}
      </div>
      {!items.length ? (
        <p className="rounded-2xl bg-[#eef2f6] px-4 py-6 text-center text-sm font-semibold text-[#1b3a57] dark:bg-[#1b3a57] dark:text-[#fff8ec]" data-testid="live-content-empty">
          {tr(`No ${tab?.en || "items"} here yet. Add them in Lesson Builder, then open them for the class.`, `لا يوجد ${tab?.ar || "محتوى"} هنا بعد. أضفه في منشئ الدروس ثم افتحه للصف.`)}
        </p>
      ) : (
        <ul className="grid max-h-[50vh] gap-2 overflow-auto sm:grid-cols-2" data-testid="live-content-list">
          {items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-3 text-start text-[#1b3a57] shadow-sm ring-1 ring-black/10 hover:bg-[#fff8ec] disabled:opacity-60 dark:bg-[#10263b] dark:text-[#fff8ec] dark:ring-white/15 dark:hover:bg-[#1b3a57]"
                onClick={() => onOpen(p, partForKind(kind))}
                data-testid="live-content-item"
              >
                <span className="text-2xl" aria-hidden>{tab?.icon || "📑"}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate" dir="auto">{p.title}</b>
                  <span className="text-xs font-semibold opacity-80">{p.subject || p.ownerName || ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
