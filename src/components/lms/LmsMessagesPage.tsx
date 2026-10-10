"use client";

import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { MessagesPanel } from "@/components/lms/Messages";
import { lmsSession } from "@/lib/lms";
import { useTr } from "@/components/lms/useLms";

export function LmsMessagesPage() {
  const { tr } = useTr();
  const [on, setOn] = useState<boolean | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOn(!!lmsSession()), []);
  return (
    <AssessmentShell title={tr("Messages", "الرسائل")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-6xl flex-1 px-3 py-6 sm:px-6">
        {on === false ? <p className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">{tr("Please sign in first.", "سجّل الدخول أولًا.")} <a className="font-bold underline" href="/lms/login">{tr("Student / Teacher login", "دخول الطالب / المعلم")}</a></p> : on && <MessagesPanel />}
      </div>
    </AssessmentShell>
  );
}
