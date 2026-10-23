"use client";

import { mpShown } from "@/lib/lms";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { AdminReports } from "./AdminReports";

/** Teacher (and later Inspector/Leadership) view of the Department Report: read-only, limited to their classes, switches applied by the server. */
export function LmsReportsPage() {
  const { tr } = useTr();
  const { actor, ready } = useLmsActor();
  return (
    <AssessmentShell title={tr("Department Report", "تقرير القسم")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-6" data-testid="lms-reports-page">
        {!ready ? null : !actor || actor.role !== "teacher" ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in as a teacher.", "سجّل الدخول كمعلم.")}</p>
          : !actor.perms?.includes("rep:view") || !mpShown(actor, "rep") ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900" data-testid="rep-no-access">{tr("You don't have access to the Department Report.", "ليس لديك صلاحية لتقرير القسم.")}</p>
          : <AdminReports admin={false} />}
      </div>
    </AssessmentShell>
  );
}
