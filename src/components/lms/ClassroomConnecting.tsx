"use client";

import { ClassroomBrand } from "@/components/lms/ClassroomBrand";
import { useTr } from "@/components/lms/useLms";

export type ConnectStep = "connecting" | "media" | "joining";

const STEPS: { id: ConnectStep; en: string; ar: string }[] = [
  { id: "connecting", en: "Connecting", ar: "جارٍ الاتصال" },
  { id: "media", en: "Camera & mic", ar: "الكاميرا والميكروفون" },
  { id: "joining", en: "Joining class", ar: "الانضمام إلى الصف" },
];

function stepIndex(step: ConnectStep) {
  const i = STEPS.findIndex((s) => s.id === step);
  return i < 0 ? 0 : i;
}

/** Premium join overlay: branding plus live progress, then a short fade when the room is ready. */
export function ClassroomConnecting({ step, fading }: { step: ConnectStep; fading?: boolean }) {
  const { tr } = useTr();
  const at = stepIndex(step);
  return (
    <div className={`lb-connect${fading ? " is-out" : ""}`} data-testid="live-connecting" data-step={step} aria-live="polite" aria-busy={!fading}>
      <div className="lb-connect-card">
        <div className="lb-connect-mark" aria-hidden>
          <span className="lb-connect-orbit" />
          <span className="lb-connect-orbit lb-connect-orbit-2" />
          <ClassroomBrand variant="page" testId="live-connect-brand" />
        </div>
        <p className="lb-connect-kicker">{tr("Getting your classroom ready", "نجهّز صفك الآن")}</p>
        <ol className="lb-connect-steps">
          {STEPS.map((s, i) => {
            const state = i < at ? "done" : i === at ? "now" : "wait";
            return (
              <li key={s.id} className={`lb-connect-step is-${state}`} data-testid={`live-connect-step-${s.id}`} data-state={state}>
                <span className="lb-connect-dot" aria-hidden>{state === "done" ? "✓" : i + 1}</span>
                <span>{tr(s.en, s.ar)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
