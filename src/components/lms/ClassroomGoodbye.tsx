"use client";

import { useEffect, useState } from "react";
import { ClassroomBrand } from "@/components/lms/ClassroomBrand";
import { useTr } from "@/components/lms/useLms";
import { CLASSROOM_HOME, GOODBYE_REDIRECT_MS } from "@/lib/classroomHome";

export { CLASSROOM_HOME, GOODBYE_REDIRECT_MS } from "@/lib/classroomHome";

export type GoodbyeKind = "goodbye" | "expired";

function goHome() {
  window.location.assign(CLASSROOM_HOME);
}

/** Farewell after a live class ends, or a polite expired-link page that never rejoins. */
export function ClassroomGoodbye({ kind }: { kind: GoodbyeKind }) {
  const { tr } = useTr();
  const [left, setLeft] = useState(kind === "goodbye" ? Math.ceil(GOODBYE_REDIRECT_MS / 1000) : null);

  useEffect(() => {
    if (kind !== "goodbye") return;
    const start = Date.now();
    const tick = () => {
      const remain = Math.max(0, Math.ceil((GOODBYE_REDIRECT_MS - (Date.now() - start)) / 1000));
      setLeft(remain);
    };
    tick();
    const iv = setInterval(tick, 250);
    const t = setTimeout(goHome, GOODBYE_REDIRECT_MS);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [kind]);

  return (
    <div className={`lb-goodbye is-${kind}`} data-testid={kind === "goodbye" ? "live-goodbye" : "live-class-ended"} role="status" aria-live="polite">
      <div className="lb-goodbye-card">
        <div className="lb-goodbye-mark" aria-hidden>
          <span className="lb-goodbye-glow" />
          <ClassroomBrand variant="page" testId="live-goodbye-brand" />
        </div>
        {kind === "goodbye" ? (
          <>
            <h1 className="lb-goodbye-title">{tr("Good Bye", "مع السلامة")}</h1>
            <p className="lb-goodbye-sub">{tr("Class has ended. Thank you for being here.", "انتهت الحصة. شكرًا لحضوركم.")}</p>
            {left != null && (
              <p className="lb-goodbye-count" data-testid="live-goodbye-count">
                {tr(`Taking you to the website in ${left}…`, `سننقلك إلى الموقع خلال ${left}…`)}
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="lb-goodbye-title">{tr("This class has ended", "انتهت هذه الحصة")}</h1>
            <p className="lb-goodbye-sub">{tr("This room is no longer open. You can go back to the website.", "هذه الحصة لم تعد مفتوحة. يمكنك العودة إلى الموقع.")}</p>
          </>
        )}
        <a className="lb-goodbye-btn" href={CLASSROOM_HOME} data-testid="live-goodbye-home" onClick={(e) => { e.preventDefault(); goHome(); }}>
          {tr("Go to website", "الذهاب إلى الموقع")}
        </a>
      </div>
    </div>
  );
}
