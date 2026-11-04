"use client";

import { useEffect, useRef, useState } from "react";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { ClassNames, loadNames, randInt, saveNames } from "@/components/activity/ClassNames";
import { useI18n } from "@/lib/i18n";
import { sfxChime, sfxTick } from "@/lib/sfx";
import { SfxToggle } from "@/components/activity/SfxToggle";
import { PickedAward } from "@/components/activity/PickedAward";
import { FocusCorner, FocusToggle, useFocus } from "@/components/FocusMode";

const COLORS = ["#16324f", "#f2c14e", "#2a9d8f", "#e76f51", "#3a86ff", "#8e7dbe", "#90be6d", "#f4a261"];
const TEXT_ON = (c: string) => (c === "#f2c14e" || c === "#90be6d" || c === "#f4a261" ? "#16324f" : "#ffffff");
const SPIN_MS = 5200;

/** Teacher-only spinning wheel: names typed or pulled from a live activity; sound; optional remove-winner. */
export function SpinningWheel() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const [names, setNames] = useState<string[]>([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [removeWinner, setRemoveWinner] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const wheelRef = useRef<SVGGElement>(null);
  const focus = useFocus();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNames(loadNames());
  }, []);

  const n = names.length;
  const seg = n ? 360 / n : 360;

  function spin() {
    if (spinning || n < 2) return;
    const w = randInt(n);
    const base = rotation - (rotation % 360);
    const target = base + 360 * (6 + randInt(3)) + (360 - (w + 0.5) * seg) + (randInt(1000) / 1000 - 0.5) * seg * 0.7;
    setWinner(null);
    setSpinning(true);
    setRotation(target);
    // Ticks while the wheel passes each segment.
    const start = performance.now();
    let last = -1;
    const loop = () => {
      const el = wheelRef.current;
      if (el) {
        const m = getComputedStyle(el).transform;
        if (m && m !== "none") {
          const [a, b] = m.slice(m.indexOf("(") + 1, -1).split(",").map(Number);
          const deg = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
          const idx = Math.floor(deg / seg);
          if (idx !== last) {
            last = idx;
            sfxTick();
          }
        }
      }
      if (performance.now() - start < SPIN_MS) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    setTimeout(() => {
      setSpinning(false);
      setWinner(names[w]);
      setHistory((h) => [names[w], ...h].slice(0, 20));
      sfxChime();
    }, SPIN_MS + 80);
  }

  function closeWinner() {
    if (winner && removeWinner) {
      const next = names.filter((x) => x !== winner);
      setNames(next);
      saveNames(next);
    }
    setWinner(null);
  }

  const R = 200;
  const showLabels = n <= 60;
  const fontSize = n <= 8 ? 20 : n <= 16 ? 16 : n <= 30 ? 12 : 9;

  return (
    <AssessmentShell title={tr("Spinning wheel", "العجلة الدوارة")} exitHref="/admin" wide>
      <div className={`mx-auto grid w-full max-w-[1500px] flex-1 gap-6 px-3 py-5 sm:px-6 ${focus ? "" : "lg:grid-cols-[1fr_360px]"}`} data-testid="wheel-page">
        <div className="flex flex-col items-center gap-5">
          <FocusCorner exitLabel={tr("Exit focus mode", "الخروج من وضع التركيز")} />
          <div className="flex w-full flex-wrap items-center justify-end gap-2" data-focus-hide>
            <SfxToggle />
            <FocusToggle className="rounded-full bg-header px-3 py-1.5 text-sm font-bold text-sun" label={tr("Focus", "تركيز")} />
          </div>
          <div
            className={`relative w-full ${focus ? "max-w-[min(88vh,960px)]" : "max-w-[min(78vh,640px)]"} ${n >= 2 && !spinning ? "cursor-pointer" : ""} rounded-full outline-none focus-visible:ring-4 focus-visible:ring-sun`}
            role="button"
            tabIndex={0}
            aria-disabled={spinning || n < 2}
            aria-label={tr("Tap the wheel to spin", "اضغط على العجلة لتدور")}
            onClick={spin}
            onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); spin(); } }}
            data-testid="wheel-spin"
          >
            <div className="absolute start-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 rtl:translate-x-1/2" aria-hidden>
              <svg width="44" height="52" viewBox="0 0 44 52"><path d="M22 52L2 8a20 20 0 0 1 40 0z" fill="#e63946" stroke="#fff" strokeWidth="3" /></svg>
            </div>
            <svg viewBox="-210 -210 420 420" className="w-full drop-shadow-xl" role="img" aria-label={tr(`Wheel with ${n} names`, `عجلة بها ${n} اسمًا`)}>
              <g
                ref={wheelRef}
                style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.7, 0.08, 1)` : "none" }}
                data-testid="wheel-disc"
              >
                {n === 0 && <circle r={R} fill="#e9eef4" />}
                {n === 1 && <circle r={R} fill={COLORS[0]} />}
                {n > 1 &&
                  names.map((name, i) => {
                    const a0 = ((i * seg - 90) * Math.PI) / 180;
                    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
                    const large = seg > 180 ? 1 : 0;
                    const color = COLORS[(i % COLORS.length === 0 && i === n - 1 && n % COLORS.length === 1) ? 2 : i % COLORS.length];
                    const mid = (i + 0.5) * seg - 90;
                    return (
                      <g key={`${name}-${i}`}>
                        <path d={`M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`} fill={color} stroke="#fff" strokeWidth={n > 40 ? 0.5 : 1.5} />
                        {showLabels && (
                          <text
                            transform={`rotate(${mid}) translate(${R - 14} 0)`}
                            textAnchor="end"
                            dominantBaseline="middle"
                            fill={TEXT_ON(color)}
                            fontSize={fontSize}
                            fontWeight={700}
                          >
                            {name.length > 18 ? name.slice(0, 17) + "…" : name}
                          </text>
                        )}
                      </g>
                    );
                  })}
                {n === 1 && (
                  <text textAnchor="middle" dominantBaseline="middle" y={-110} fill="#fff" fontSize={22} fontWeight={700}>
                    {names[0]}
                  </text>
                )}
              </g>
              <circle r={34} fill="#16324f" stroke="#f2c14e" strokeWidth={5} />
              <text textAnchor="middle" dominantBaseline="middle" fill="#f2c14e" fontSize={16} fontWeight={800}>
                {n}
              </text>
            </svg>
          </div>
          <p className={`rounded-full bg-header px-5 py-2 text-lg font-extrabold text-sun shadow ${spinning ? "opacity-60" : "animate-pulse"}`} aria-live="polite" data-testid="wheel-hint">
            {spinning ? tr("Spinning…", "تدور…") : n >= 2 ? `👆 ${tr("Tap the wheel to spin", "اضغط على العجلة لتدور")}` : tr("Add names to spin", "أضف أسماء للتدوير")}
          </p>
          {n < 2 && <p className="text-sm opacity-75">{tr("Add at least two names to spin.", "أضف اسمين على الأقل للتدوير.")}</p>}
        </div>

        <aside className="space-y-4" data-focus-hide>
          <ClassNames names={names} setNames={setNames} />
          <div className="glass flex flex-col gap-2 rounded-3xl p-4 text-sm">
                        <label className="inline-flex items-center gap-2 font-semibold">
              <input type="checkbox" checked={removeWinner} onChange={(e) => setRemoveWinner(e.target.checked)} data-testid="wheel-remove-winner" /> ✂️ {tr("Remove the winner after each spin", "إزالة الفائز بعد كل دورة")}
            </label>
          </div>
          {history.length > 0 && (
            <div className="glass rounded-3xl p-4 text-sm">
              <p className="font-bold">{tr("Picked so far", "تم اختيارهم")}</p>
              <ol className="mt-2 list-decimal space-y-0.5 ps-5" data-testid="wheel-history">
                {history.map((h, i) => (
                  <li key={i} dir="auto">{h}</li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>

      {winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-header/90 p-6" role="dialog" aria-modal="true" aria-label={tr("Winner", "الفائز")} onClick={closeWinner} data-testid="wheel-winner">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {Array.from({ length: 40 }, (_, i) => (
              <span key={i} className="absolute animate-bounce text-3xl" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, animationDelay: `${(i % 10) * 0.1}s` }}>
                {["🎉", "⭐", "✨", "🎊"][i % 4]}
              </span>
            ))}
          </div>
          <div className="relative rounded-[28px] bg-white px-10 py-10 text-center shadow-2xl dark:bg-[#10263b]">
            <p className="text-lg font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">{tr("And the winner is…", "والفائز هو…")}</p>
            <p className="mt-3 break-words text-6xl font-black text-navy dark:text-sun sm:text-7xl" dir="auto">{winner}</p>
            <PickedAward name={winner} />
            <button type="button" className={`${primaryBtn} mt-8`} onClick={closeWinner}>
              {removeWinner ? tr("Remove & continue", "إزالة ومتابعة") : tr("Continue", "متابعة")}
            </button>
          </div>
        </div>
      )}
    </AssessmentShell>
  );
}
