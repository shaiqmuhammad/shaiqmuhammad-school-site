"use client";

import { getServerSession } from "@/lib/adminServer";
import { lmsSession } from "@/lib/lms";

/** Which area (LMS or Admin) the visitor is working in. Set by the LMS rail and the admin chrome; read by activities/assessments so Exit/close goes back to the SAME area. */
export type Origin = "lms" | "admin" | "";

export function setOrigin(o: "lms" | "admin") {
  try { sessionStorage.setItem("sm-origin", o); localStorage.setItem("sm-origin-last", o); } catch { /* ignore */ }
}
export function getOrigin(): Origin {
  try {
    const v = sessionStorage.getItem("sm-origin") || localStorage.getItem("sm-origin-last") || "";
    return v === "lms" || v === "admin" ? v : "";
  } catch { return ""; }
}
/** Whose identity the current page should use. With both sessions in one browser, the area we came from decides; admin and LMS sessions are never merged or replaced. */
export function actingAs(): "admin" | "lms" | null {
  const lms = !!lmsSession(), adm = !!getServerSession();
  if (lms && adm) return getOrigin() === "lms" ? "lms" : "admin";
  return lms ? "lms" : adm ? "admin" : null;
}
/** The signed-in LMS user's own dashboard. */
export function ownHome(): string {
  return lmsSession()?.user.role === "parent" ? "/lms/family" : "/lms";
}
