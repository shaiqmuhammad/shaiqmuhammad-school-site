"use client";

import { mpShown } from "@/lib/lms";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { AssessmentTracker } from "@/components/tracker/AssessmentTracker";

/** Teacher view of Progress Check QA — their own classes and subjects only (server-enforced). */
export function LmsQaPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  return (
    <AssessmentShell title={tr("Progress Check QA", "ضمان جودة فحص التقدم")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-[1200px] flex-1 px-3 py-6 sm:px-6" data-testid="lms-qa-page">
        {!ready ? null : !actor || actor.role !== "teacher" ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in as a teacher.", "سجّل الدخول كمعلم.")}</p>
          : !mpShown(actor, "qa") ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900" data-testid="qa-no-access">{tr("You don't have access to Progress Check QA.", "ليس لديك صلاحية.")}</p>
          : <AssessmentTracker initialView="pc" />}
      </div>
    </AssessmentShell>
  );
}
