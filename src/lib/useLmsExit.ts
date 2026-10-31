"use client";

import { useEffect, useState } from "react";
import { lmsSession } from "@/lib/lms";
import { actingAs, ownHome } from "@/lib/origin";

/**
 * Where an activity/assessment screen returns to (exit ×, close, back, "go home"). A signed-in student/teacher/parent working
 * from the LMS always returns to their OWN dashboard — never /admin or the public site; admins keep the given fallback.
 */
export function useLmsExit(fallback: string): string {
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- storage is only readable after hydration */
    if (actingAs() !== "lms") { setHref(fallback); return; }
    const p = window.location.pathname;
    const teacher = lmsSession()?.user.role === "teacher";
    // Teachers closing a classroom activity return to Classroom activities; a hosted assessment returns to Assessments.
    // t376: started from a My Classes group → always back to that same group.
    let back = "";
    try { const code = new URLSearchParams(window.location.search).get("code") || ""; back = (code && localStorage.getItem(`sm-act-back-${code.toUpperCase()}`)) || (/^\/activities\/(wheel|randomiser)/.test(p) ? sessionStorage.getItem("sm-act-back") || "" : ""); } catch { /* */ }
    if (teacher && back.startsWith("/lms/classes")) { setHref(back); return; }
    setHref(teacher && p.startsWith("/activities") ? "/lms/activities" : teacher && p.startsWith("/assessments") ? "/lms/assessments" : ownHome());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fallback]);
  return href;
}
