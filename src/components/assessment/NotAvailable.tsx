"use client";

import Link from "next/link";
import { AssessmentShell, ghostBtn, panelCls } from "@/components/assessment/AssessmentShell";
import { useAssessmentText } from "@/lib/assessmentI18n";

export function NotAvailable() {
  const { a } = useAssessmentText();
  return (
    <AssessmentShell title={a("assessment")}>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
        <div className={panelCls}>
          <p className="text-xl font-semibold">{a("notAvailable")}</p>
          <Link href="/assessments" className={`${ghostBtn} mt-6`}>
            {a("allAssessments")}
          </Link>
        </div>
      </div>
    </AssessmentShell>
  );
}
