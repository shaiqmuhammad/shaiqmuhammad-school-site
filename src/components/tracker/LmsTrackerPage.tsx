"use client";

import { mpShown } from "@/lib/lms";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { AssessmentTracker } from "./AssessmentTracker";

/** Teacher view of the Assessment Tracker — limited to their classes; switches enforced by the server. */
export function LmsTrackerPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  return (
    <AssessmentShell title={tr("Assessment Tracker", "متتبع التقييم")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-6 sm:px-6" data-testid="lms-tracker-page">
        {!ready ? null : !actor || actor.role !== "teacher" ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in as a teacher.", "سجّل الدخول كمعلم.")}</p>
          : actor.perms?.includes("trk:view:off") || !mpShown(actor, "trk") ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900" data-testid="trk-no-access">{tr("You don't have access to the Assessment Tracker.", "ليس لديك صلاحية لمتتبع التقييم.")}</p>
          : <AssessmentTracker />}
      </div>
    </AssessmentShell>
  );
}
