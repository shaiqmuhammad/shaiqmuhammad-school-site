"use client";

import { useEffect, useState } from "react";
import { lmsSession } from "@/lib/lms";

/**
 * Where assessment screens should return to. A signed-in student/teacher always stays inside the LMS
 * (/lms/assessments); everyone else gets the given public/admin fallback.
 */
export function useLmsExit(fallback: string): string {
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
    if (lmsSession() && (fallback === "/assessments" || fallback === "/admin" || fallback === "/")) setHref("/lms/assessments");
    else setHref(fallback);
  }, [fallback]);
  return href;
}
