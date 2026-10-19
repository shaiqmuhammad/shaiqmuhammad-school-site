"use client";

import { useEffect } from "react";
import { setOrigin } from "@/lib/origin";

/** Marks that the visitor is working in the Admin area (so activities opened from here return to Admin, even if an LMS session exists in the same browser). */
export function OriginMark({ area }: { area: "admin" | "lms" }) {
  useEffect(() => { setOrigin(area); }, [area]);
  return null;
}
