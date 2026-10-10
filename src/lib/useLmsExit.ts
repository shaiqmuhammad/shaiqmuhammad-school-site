"use client";

import { useEffect, useState } from "react";
import { lmsSession } from "@/lib/lms";
import { getServerSession } from "@/lib/adminServer";

/**
 * Where assessment screens should return to. A signed-in student/teacher always stays inside the LMS
 * (/lms/assessments); everyone else gets the given public/admin fallback.
 */
export function useLmsExit(fallback: string): string {
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage is only readable after hydration */
    // Admin hosting keeps going back to /admin when an admin session exists.
    if (fallback === "/admin" && getServerSession()) setHref(fallback);
    else if (lmsSession() && (fallback === "/assessments" || fallback === "/admin" || fallback === "/")) setHref("/lms/assessments");
    else setHref(fallback);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fallback]);
  return href;
}
