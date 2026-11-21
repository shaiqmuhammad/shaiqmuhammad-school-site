"use client";

import { useState } from "react";
import { useTr } from "@/components/lms/useLms";

/** Shared visual for the My Classes tools tray and the live-room tools tray. */
export const TRAY_BTN =
  "group flex w-[4.6rem] shrink-0 snap-start min-w-0 flex-col items-center gap-0.5 rounded-2xl border px-1 py-1.5 text-center text-[10px] font-extrabold leading-tight text-white shadow-sm backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-lg sm:w-auto sm:shrink sm:text-[11px]";

export function TrayBtn({
  id, icon, en, ar, color, on, onClick, title, testId,
}: {
  id: string; icon: string; en: string; ar: string; color: string;
  on?: boolean; onClick: () => void; title?: string; testId?: string;
}) {
  const { tr } = useTr();
  const label = tr(en, ar);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title || label}
      className={TRAY_BTN}
      style={{ background: on ? color : `linear-gradient(160deg, ${color}66, ${color}26)`, borderColor: `${color}99` }}
      data-testid={testId || `tray-${id}`}
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/85 text-2xl shadow-inner transition group-hover:scale-110" aria-hidden>{icon}</span>
      <span className="line-clamp-2 drop-shadow">{label}</span>
    </button>
  );
}

export const LIVE_TOOLS = [
  { id: "board", icon: "✏️", en: "Whiteboard", ar: "السبورة", color: "#93c5fd" },
  { id: "wheel", icon: "🎡", en: "Spin", ar: "العجلة", color: "#f87171" },
  { id: "rand", icon: "🎲", en: "Randomiser", ar: "اختيار عشوائي", color: "#60a5fa" },
  { id: "timer", icon: "⏱️", en: "Timer", ar: "المؤقت", color: "#22d3ee" },
  { id: "award", icon: "🃏", en: "Reward Cards", ar: "بطاقات المكافآت", color: "#f5c542" },
  { id: "tasks", icon: "📝", en: "Tasks", ar: "المهام", color: "#a78bfa" },
] as const;

export const LIBRARY_TOOL = { id: "open", icon: "📚", en: "Library", ar: "المكتبة", color: "#34d399" } as const;

export type LiveToolId = (typeof LIVE_TOOLS)[number]["id"];

export function LiveToolsTray({
  canPresent, tool, onTool, onTimer, onTasks, taskOn, docked, onOpen, openOn, horizontal,
}: {
  canPresent: boolean;
  tool: string;
  onTool: (id: "" | "board" | "wheel" | "rand" | "award") => void;
  onTimer: (seconds: number | null) => void;
  onTasks?: () => void;
  taskOn?: boolean;
  docked?: boolean;
  onOpen?: () => void;
  openOn?: boolean;
  horizontal?: boolean;
}) {
  const { tr } = useTr();
  const [open, setOpen] = useState(true);
  const [timerOpen, setTimerOpen] = useState(false);
  const show = docked || open;
  return (
    <aside
      className={horizontal
        ? "lb-tools-bar"
        : docked
        ? "flex h-full w-full flex-col items-center justify-evenly overflow-visible"
        : "fixed end-2 top-1/2 z-[85] flex max-h-[80dvh] -translate-y-1/2 flex-col items-center gap-1 overflow-y-auto rounded-3xl border border-white/30 bg-[#1b3a57]/90 p-1.5 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/95"}
      data-testid="live-tools-tray"
      data-focus-keep
      aria-label={tr("Classroom tools", "أدوات الصف")}
    >
      {!docked && (
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-sm font-black text-white hover:bg-white/25"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={open ? tr("Hide tools", "إخفاء الأدوات") : tr("Show tools", "إظهار الأدوات")}
          data-testid="live-tools-toggle"
        >
          {open ? "»" : "🧰"}
        </button>
      )}
      {show && onOpen && (
        <LibraryBtn on={!!openOn} onClick={onOpen} disabled={!canPresent} />
      )}
      {show && LIVE_TOOLS.map((x) => {
        if (x.id === "timer") {
          return (
            <div key={x.id} className="relative">
              <TrayBtn id={x.id} icon={x.icon} en={x.en} ar={x.ar} color={x.color} on={timerOpen} onClick={() => { if (!canPresent) return; setTimerOpen((v) => !v); }} title={canPresent ? tr("Timer", "المؤقت") : tr("Only the teacher can set the timer", "المعلم فقط يضبط المؤقت")} />
              {canPresent && timerOpen && (
                <div className={`absolute z-10 w-28 rounded-2xl bg-[#1b3a57] p-2 text-white shadow-xl ring-1 ring-white/20 ${horizontal ? "bottom-full end-0 mb-2" : "start-full top-0 ms-2"}`} data-testid="live-timer-pop">
                  {[["30", "0:30"], ["60", "1:00"], ["120", "2:00"], ["300", "5:00"], ["600", "10:00"], ["0", tr("Clear", "مسح")]].map(([v, lab]) => (
                    <button key={v} type="button" className="block w-full rounded-xl px-2 py-1 text-left text-xs font-bold hover:bg-white/15" onClick={() => { onTimer(v === "0" ? null : Number(v)); setTimerOpen(false); }}>{lab}</button>
                  ))}
                </div>
              )}
            </div>
          );
        }
        if (x.id === "tasks") {
          return <TrayBtn key={x.id} id={x.id} icon={x.icon} en={x.en} ar={x.ar} color={x.color} on={!!taskOn} onClick={() => onTasks?.()} />;
        }
        const tid = x.id as "board" | "wheel" | "rand" | "award";
        return (
          <TrayBtn
            key={x.id}
            id={x.id}
            icon={x.icon}
            en={x.en}
            ar={x.ar}
            color={x.color}
            on={tool === tid}
            onClick={() => { if (!canPresent) return; onTool(tool === tid ? "" : tid); }}
            title={canPresent ? tr(x.en, x.ar) : tr("The teacher is using this tool", "المعلم يستخدم هذه الأداة")}
          />
        );
      })}
    </aside>
  );
}


export function LibraryBtn({ on, onClick, disabled }: { on?: boolean; onClick: () => void; disabled?: boolean }) {
  const { tr } = useTr();
  return (
    <TrayBtn
      id={LIBRARY_TOOL.id}
      icon={LIBRARY_TOOL.icon}
      en={LIBRARY_TOOL.en}
      ar={LIBRARY_TOOL.ar}
      color={LIBRARY_TOOL.color}
      on={!!on}
      onClick={() => { if (disabled) return; onClick(); }}
      title={disabled ? tr("The teacher opens class work", "المعلم يفتح عمل الصف") : tr("Open a lesson, task, activity, homework or Quran homework", "افتح درسًا أو مهمة أو نشاطًا أو واجبًا أو واجب القرآن")}
    />
  );
}

export const PTR_KIND_TOOLS = [
  { id: "pen", icon: "🖊️", en: "Pen", ar: "قلم" },
  { id: "hand", icon: "✋", en: "Hand", ar: "يد" },
  { id: "finger", icon: "👆", en: "Finger", ar: "إصبع" },
  { id: "stick", icon: "☝️", en: "Stick", ar: "عصا" },
  { id: "arrow", icon: "➤", en: "Arrow", ar: "سهم" },
  { id: "laser", icon: "🔆", en: "Laser", ar: "ليزر" },
] as const;

export const DRAW_TOOLS = [
  { id: "draw", icon: "✏️", en: "Draw", ar: "رسم", color: "#93c5fd" },
  { id: "highlighter", icon: "🟨", en: "Highlighter", ar: "تظليل", color: "#f5c542" },
  { id: "eraser", icon: "🧽", en: "Eraser", ar: "ممحاة", color: "#fb7185" },
] as const;

const INK = ["#1b3a57", "#be123c", "#1d4ed8", "#047857", "#0f172a"] as const;

export const SHAPE_TOOLS = [
  { id: "rect", icon: "▭", en: "Rectangle", ar: "مستطيل" },
  { id: "circle", icon: "◯", en: "Circle", ar: "دائرة" },
  { id: "line", icon: "／", en: "Line", ar: "خط" },
  { id: "arrow", icon: "➤", en: "Arrow", ar: "سهم" },
  { id: "triangle", icon: "△", en: "Triangle", ar: "مثلث" },
  { id: "star", icon: "☆", en: "Star", ar: "نجمة" },
  { id: "hexagon", icon: "⬡", en: "Hexagon", ar: "سداسي" },
] as const;

export const MATH_SHAPE_TOOLS = [
  { id: "numberline", icon: "➖", en: "Number line", ar: "خط الأعداد" },
  { id: "axes", icon: "➕", en: "Axes / graph", ar: "محاور / رسم" },
  { id: "angle", icon: "∠", en: "Angle", ar: "زاوية" },
  { id: "fraction", icon: "◑", en: "Fractions circle", ar: "دائرة الكسور" },
  { id: "cube", icon: "⬜", en: "Cube", ar: "مكعب" },
  { id: "cylinder", icon: "🛢️", en: "Cylinder", ar: "أسطوانة" },
  { id: "cone", icon: "▲", en: "Cone", ar: "مخروط" },
  { id: "protractor", icon: "⌒", en: "Protractor", ar: "منقلة" },
  { id: "ruler", icon: "📏", en: "Ruler", ar: "مسطرة" },
] as const;

export const SCIENCE_SHAPE_TOOLS = [
  { id: "beaker", icon: "🥤", en: "Beaker", ar: "كأس" },
  { id: "flask", icon: "🧪", en: "Flask", ar: "دورق" },
  { id: "testtube", icon: "🧫", en: "Test tube", ar: "أنبوب اختبار" },
  { id: "atom", icon: "⚛️", en: "Atom", ar: "ذرة" },
  { id: "magnet", icon: "🧲", en: "Magnet", ar: "مغناطيس" },
  { id: "battery", icon: "🔋", en: "Battery", ar: "بطارية" },
  { id: "resistor", icon: "⌇", en: "Resistor", ar: "مقاومة" },
  { id: "bulb", icon: "💡", en: "Bulb", ar: "مصباح" },
  { id: "switch", icon: "⏻", en: "Switch", ar: "مفتاح" },
  { id: "cycle", icon: "🔄", en: "Cycle diagram", ar: "مخطط دورة" },
  { id: "flow", icon: "➡️", en: "Flow arrows", ar: "أسهم التدفق" },
] as const;

export type LiveShapeKindId = import("@/lib/liveShapes").LiveShapeKind;
export type ShapeGrid = { rows: number; cols: number };

export function TeachToolsTray({
  canPoint, canDraw, ptrKind, onPtrKind, drawTool, onDrawTool, ink, onInk, onUndo, onClear, penId, onPen, people,
  shapeKind, onShapeKind, shapeGrid,
}: {
  canPoint: boolean;
  canDraw: boolean;
  ptrKind: string;
  onPtrKind: (id: "pen" | "hand" | "finger" | "stick" | "arrow" | "laser") => void;
  drawTool: "draw" | "highlighter" | "eraser";
  onDrawTool: (id: "draw" | "highlighter" | "eraser") => void;
  ink: string;
  onInk: (c: string) => void;
  onUndo?: () => void;
  onClear?: () => void;
  penId?: string;
  onPen?: (id: string) => void;
  people?: { id: string; name: string }[];
  shapeKind?: LiveShapeKindId | "";
  onShapeKind?: (id: LiveShapeKindId | "", grid?: ShapeGrid) => void;
  shapeGrid?: ShapeGrid;
}) {
  const { tr } = useTr();
  if (!canPoint && !canDraw) return null;
  return (
    <nav className="lb-teach-bar" data-testid="live-teach-tray" data-focus-keep aria-label={tr("Teaching tools", "أدوات التدريس")}>
      <div className="lb-teach-row">
        {canPoint && PTR_KIND_TOOLS.map((x) => (
          <TrayBtn
            key={x.id}
            id={`ptr-${x.id}`}
            icon={x.icon}
            en={x.en}
            ar={x.ar}
            color="#f3c969"
            on={ptrKind === x.id}
            onClick={() => onPtrKind(x.id)}
            testId={`live-ptr-${x.id}`}
          />
        ))}
        {canDraw && <span className="lb-teach-split" aria-hidden />}
        {canDraw && DRAW_TOOLS.map((x) => (
          <TrayBtn key={x.id} id={x.id} icon={x.icon} en={x.en} ar={x.ar} color={x.color} on={drawTool === x.id} onClick={() => onDrawTool(x.id)} testId={`live-draw-${x.id}`} />
        ))}
        {canDraw && onShapeKind && <ShapesBtn kind={shapeKind || ""} grid={shapeGrid} onKind={onShapeKind} />}
        {canDraw && INK.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={tr("Ink colour", "لون الحبر")}
            aria-pressed={ink === c}
            onClick={() => onInk(c)}
            className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 shadow-inner"
            style={{ background: c, borderColor: ink === c ? "#f3c969" : "rgba(255,248,236,.45)" }}
            data-testid={`live-ink-${c.replace("#", "")}`}
          />
        ))}
        {canDraw && onUndo && <TrayBtn id="undo" icon="↩️" en="Undo" ar="تراجع" color="#94a3b8" onClick={onUndo} testId="live-undo-stroke" />}
        {canDraw && onClear && <TrayBtn id="clear" icon="🧹" en="Clear" ar="مسح" color="#fb7185" onClick={onClear} testId="live-clear-board" />}
        {canDraw && onPen && (
          <label className="ms-1 flex min-w-[8.5rem] flex-col justify-center text-[10px] font-extrabold text-[#1b3a57] dark:text-[#fff8ec]">
            {tr("Give pen", "إعطاء القلم")}
            <select
              className="mt-0.5 rounded-full border border-white/30 bg-[#1b3a57] px-2 py-1 text-[11px] font-bold text-[#fff8ec]"
              value={penId || ""}
              onChange={(e) => onPen(e.target.value)}
              data-testid="live-pen"
            >
              <option value="">{tr("Teacher has the pen", "القلم مع المعلم")}</option>
              {(people || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        )}
      </div>
    </nav>
  );
}

function ShapesBtn({ kind, grid, onKind }: { kind: LiveShapeKindId | ""; grid?: ShapeGrid; onKind: (id: LiveShapeKindId | "", grid?: ShapeGrid) => void }) {
  const { tr } = useTr();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(grid?.rows || 3);
  const [cols, setCols] = useState(grid?.cols || 3);
  const pick = (id: LiveShapeKindId, extra?: ShapeGrid) => {
    onKind(kind === id && !extra ? "" : id, extra);
    setOpen(false);
  };
  const bump = (v: number, set: (n: number) => void, cur: number) => set(Math.max(1, Math.min(12, cur + v)));
  return (
    <div className="relative">
      <TrayBtn
        id="shapes"
        icon="⬡"
        en="Shapes"
        ar="أشكال"
        color="#7ee0d4"
        on={!!kind || open}
        onClick={() => setOpen((v) => !v)}
        testId="live-shapes"
      />
      {open && (
        <div className="lb-shape-pop" data-testid="live-shapes-pop" role="menu">
          <p className="lb-shape-cat">{tr("Basic shapes", "أشكال أساسية")}</p>
          <div className="lb-shape-grid">
            {SHAPE_TOOLS.map((x) => (
              <button key={x.id} type="button" role="menuitem" className={`lb-shape-opt ${kind === x.id ? "is-on" : ""}`} onClick={() => pick(x.id)} data-testid={`live-shape-${x.id}`}>
                <span aria-hidden>{x.icon}</span> {tr(x.en, x.ar)}
              </button>
            ))}
          </div>
          <p className="lb-shape-cat">{tr("Tables", "جداول")}</p>
          <div className="lb-shape-table" data-testid="live-shape-table">
            <label>
              {tr("Rows", "صفوف")}
              <span>
                <button type="button" onClick={() => bump(-1, setRows, rows)} aria-label={tr("Fewer rows", "أقل صفوفًا")}>−</button>
                <strong>{rows}</strong>
                <button type="button" onClick={() => bump(1, setRows, rows)} aria-label={tr("More rows", "المزيد من الصفوف")}>+</button>
              </span>
            </label>
            <label>
              {tr("Columns", "أعمدة")}
              <span>
                <button type="button" onClick={() => bump(-1, setCols, cols)} aria-label={tr("Fewer columns", "أقل أعمدة")}>−</button>
                <strong>{cols}</strong>
                <button type="button" onClick={() => bump(1, setCols, cols)} aria-label={tr("More columns", "المزيد من الأعمدة")}>+</button>
              </span>
            </label>
            <button type="button" className={`lb-shape-opt is-insert ${kind === "table" ? "is-on" : ""}`} onClick={() => pick("table", { rows, cols })} data-testid="live-shape-table-insert">
              {tr("Insert grid", "إدراج شبكة")}
            </button>
          </div>
          <p className="lb-shape-cat">{tr("Maths shapes", "أشكال رياضية")}</p>
          <div className="lb-shape-grid">
            {MATH_SHAPE_TOOLS.map((x) => (
              <button key={x.id} type="button" role="menuitem" className={`lb-shape-opt ${kind === x.id ? "is-on" : ""}`} onClick={() => pick(x.id)} data-testid={`live-shape-${x.id}`}>
                <span aria-hidden>{x.icon}</span> {tr(x.en, x.ar)}
              </button>
            ))}
          </div>
          <p className="lb-shape-cat">{tr("Science shapes", "أشكال علمية")}</p>
          <div className="lb-shape-grid">
            {SCIENCE_SHAPE_TOOLS.map((x) => (
              <button key={x.id} type="button" role="menuitem" className={`lb-shape-opt ${kind === x.id ? "is-on" : ""}`} onClick={() => pick(x.id)} data-testid={`live-shape-${x.id}`}>
                <span aria-hidden>{x.icon}</span> {tr(x.en, x.ar)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
