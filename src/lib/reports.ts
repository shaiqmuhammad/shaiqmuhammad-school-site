"use client";

import { getServerSession } from "@/lib/adminServer";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";

/** Department Report client (read-only endpoints in workers/assessment-session/src/reports.ts). */
export type Band = "above" | "at" | "below";
export type PBand = "better" | "expected" | "below";
export type ReportFilters = Partial<Record<"subject" | "phase" | "year" | "section" | "group" | "gender" | "sen", string>>;
export type ReportSettings = { above: number; at: number; progBetter: number; progExpected: number };
export type Hw3 = { exp: number; done: number; onTime: number };
export type RStudent = { id: string; name: string; cls: string; section: string; gender: string; sen: string; phase: string; subject: string; n: number; att: number | null; attBand: Band | null; first: number | null; latest: number | null; delta: number | null; progBand: PBand | null; quran: { green: number; yellow: number; red: number } | null; hw: Hw3 | null };
export type DeptReport = {
  generated: number; options: { subjects: string[]; phases: string[]; years: string[]; sections: string[]; groups: { id: string; name: string }[] };
  notSet: { subject: number; phase: number; gender: number; sen: number }; settings: ReportSettings;
  kpis: { students: number; withScores: number; atOrAbove: number | null; expectedOrBetter: number | null; onTime: number | null; completion: number | null; quranGreen: number | null; coverage: number | null; results: { total: number; unmatched: number; ambiguous: number } };
  attainment: { year: string; students: number; above: number; at: number; below: number; noData: number }[];
  progress: { byYear: { year: string; students: number; better: number; expected: number; below: number; noData: number }[]; distribution: { lo: number; hi: number; n: number }[]; trend: { month: string; byYear: Record<string, number> }[] };
  quran: { year: string; students: number; withData: number; green: number; yellow: number; red: number }[];
  homework: Hw3 & { assignments: number; byYear: (Hw3 & { year: string })[]; trend: (Hw3 & { week: string })[] };
  coverage: { year: string; total: number; taught: number; inProgress: number; assessed: number }[];
  students: RStudent[];
};
export type StudentDetail = {
  student: RStudent & { groups: string[] }; settings: ReportSettings;
  scores: { t: number; p: number; title: string; kind: string; band: Band }[];
  homework: { title: string; kind: string; due: number | null; status: string; submittedAt: number | null; onTime: boolean }[];
  quran: { surah: number; from: number; to: number; grade: string; at: number }[];
};

async function call<T>(action: string, body: unknown): Promise<T> {
  const tok = getServerSession()?.token; // admin today; a future read-only inspector token goes through the same call
  const res = await fetch(`${ASSESSMENT_API_BASE}/api/lms/${action}`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `error ${res.status}`);
  return data;
}
export const reportsApi = {
  dept: (filters: ReportFilters) => call<DeptReport>("report-dept", { filters }),
  student: (id: string) => call<StudentDetail>("report-student", { id }),
  settings: (save?: ReportSettings) => call<{ settings: ReportSettings; defaults: ReportSettings }>("report-settings", save ? { save } : {}),
};
