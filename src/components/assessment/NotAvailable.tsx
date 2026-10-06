"use client";

import Link from "next/link";
import { AssessmentShell, ghostBtn, panelCls } from "@/components/assessment/AssessmentShell";
import { useAssessmentText } from "@/lib/assessmentI18n";

/** Shown for assessments that are hidden from the website or not active yet (`notYet`). */
export function NotAvailable({ notYet = false }: { notYet?: boolean }) {
  const { a, lang } = useAssessmentText();
  return (
    <AssessmentShell title={a("assessment")}>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
        <div className={panelCls}>
          <p className="text-xl font-semibold" data-testid="not-available">{notYet ? (lang === "ar" ? "هذا التقييم غير متاح بعد. يُرجى العودة لاحقًا." : "This assessment is not available yet. Please check back later.") : a("notAvailable")}</p>
          <Link href="/assessments" className={`${ghostBtn} mt-6`}>
            {a("allAssessments")}
          </Link>
        </div>
      </div>
    </AssessmentShell>
  );
}
