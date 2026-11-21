"use client";

import { ClassroomBrand } from "@/components/lms/ClassroomBrand";
import { useTr } from "@/components/lms/useLms";
import { CLASSROOM_HOME } from "@/lib/classroomHome";

/** Shown when the host removes an attendee. They may ask to join again and wait to be admitted. */
export function ClassroomRemoved({ onRejoin, busy }: { onRejoin: () => void; busy?: boolean }) {
  const { tr } = useTr();
  return (
    <div className="lb-goodbye is-removed" data-testid="live-removed" role="status" aria-live="polite">
      <div className="lb-goodbye-card">
        <div className="lb-goodbye-mark" aria-hidden>
          <span className="lb-goodbye-glow" />
          <ClassroomBrand variant="page" testId="live-removed-brand" />
        </div>
        <h1 className="lb-goodbye-title">{tr("You've been removed by the host", "أزالك المضيف من الحصة")}</h1>
        <p className="lb-goodbye-sub">{tr("You can ask to join again. You'll wait until the teacher lets you back in.", "يمكنك طلب الانضمام مجددًا. ستنتظر حتى يسمح لك المعلم بالعودة.")}</p>
        <div className="lb-goodbye-actions">
          <button type="button" className="lb-goodbye-btn" onClick={onRejoin} disabled={busy} data-testid="live-removed-rejoin">
            {tr("Ask to join again", "طلب الانضمام مجددًا")}
          </button>
          <a className="lb-goodbye-link" href={CLASSROOM_HOME} data-testid="live-removed-home">{tr("Go to website", "الذهاب إلى الموقع")}</a>
        </div>
      </div>
    </div>
  );
}
