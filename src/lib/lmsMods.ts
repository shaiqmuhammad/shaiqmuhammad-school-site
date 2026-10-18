"use client";

import { getServerSession } from "@/lib/adminServer";
import { dlGrant } from "@/lib/dl";
import { downloadBlob } from "@/lib/exportUtils";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { lmsSession, LmsError } from "@/lib/lms";

/** Client for the Attendance / Behaviour / Curriculum modules (see workers/assessment-session/src/lmsmods.ts). */
export type Status = "P" | "A" | "L" | "E";
export const STATUS_LABEL: Record<Status, [string, string]> = { P: ["Present", "حاضر"], A: ["Absent", "غائب"], L: ["Late", "متأخر"], E: ["Excused", "بعذر"] };
export const STATUS_CLS: Record<Status, string> = {
  P: "bg-emerald-600 text-white border-emerald-700",
  A: "bg-rose-600 text-white border-rose-700",
  L: "bg-amber-500 text-[#2b1d00] border-amber-600",
  E: "bg-sky-600 text-white border-sky-700",
};
export type AttStudent = { id: string; name: string; cls: string; section: string; status: Status | ""; note: string; by: string; alerted: boolean; parentEmail: boolean };
export type AttRoster = { day: string; period: string; periods: string[]; editable: boolean; canEdit: boolean; settings: { windowDays: number; low: number }; students: AttStudent[] };
export type AttRow = { id: string; name: string; cls: string; section: string; P: number; A: number; L: number; E: number; total: number; pct: number | null; low: boolean };
export type AttReport = { from: string; to: string; settings: { windowDays: number; low: number }; students: AttRow[]; daily: { day: string; P: number; A: number; L: number; E: number }[]; records?: { day: string; period: string; status: Status; note: string; by: string }[] };
export type AttGroup = { cls: string; section: string; students: number; P: number; A: number; L: number; E: number; marked: number; periods: string[]; by: string[] };
export type Beh = { id: string; student: string; name: string; cls: string; section: string; day: string; kind: "positive" | "concern"; category: string; severity: number; note: string; action: string; follow: "none" | "open" | "in_progress" | "done"; followNote: string; sensitive: boolean; restricted: boolean; by: string; mine: boolean; at: number };
export type CurLesson = { title: string; note: string; done?: boolean };
export type CurUnit = { id: string; subject: string; yr: string; term: string; title: string; objectives: string; lessons: CurLesson[]; resources: { label: string; url: string }[]; wkFrom: number; wkTo: number; status: "planned" | "in_progress" | "taught"; quiz: string; page: string; ord: number; by: string; updated: number; notes?: string; links?: CurLink[] };
export type CurLink = { t: "hw" | "quiz"; id: string; title?: string; mode?: string };
export type Roster = { id: string; name: string; cls: string; section: string };
export type Cat = { subjects: { id: string; name: string }[]; classes: { id: string; name: string }[]; sections: { id: string; name: string; classId: string; cls: string }[] };

/** Staff modules switch (View / Add-Edit) from the teacher's permission strings. Admin: always both. */
export const modPerm = (perms: string[] | undefined, isAdmin: boolean, m: "att" | "beh" | "cur") => ({ view: isAdmin || !!perms?.includes(`${m}:view`) || !!perms?.includes(`${m}:edit`) || !!perms?.includes(`${m}:delete`), edit: isAdmin || !!perms?.includes(`${m}:edit`), del: isAdmin || !!perms?.includes(`${m}:delete`) });

export async function modCall<T>(action: string, body: unknown, asAdmin: boolean): Promise<T> {
  const tok = asAdmin ? getServerSession()?.token : lmsSession()?.token;
  let res: Response;
  try {
    res = await fetch(`${ASSESSMENT_API_BASE}/api/lms/${action}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new LmsError("network", 0); }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new LmsError(data.error || "error", res.status);
  return data;
}
export const modErr = (e: unknown, tr: (en: string, ar: string) => string) => {
  const c = e instanceof LmsError ? e.code : "error";
  const m: Record<string, [string, string]> = {
    forbidden: ["You don't have permission for this.", "ليست لديك صلاحية لذلك."], not_your_class: ["That student isn't in your classes.", "هذا الطالب ليس في صفوفك."],
    edit_window_closed: ["The edit window for that date has closed. Ask the admin.", "انتهت مدة التعديل لهذا التاريخ. اطلب من الإدارة."], bad_day: ["Pick a valid date (not in the future).", "اختر تاريخًا صحيحًا (ليس في المستقبل)."],
    note_required: ["Write a note or an action taken.", "اكتب ملاحظة أو الإجراء المتخذ."], sensitive: ["That entry is restricted to its author and the admin.", "هذا السجل مقيّد بكاتبه والإدارة."],
    missing_fields: ["Subject, year and title are required.", "المادة والسنة والعنوان مطلوبة."], unknown_subject: ["Unknown subject (add it in Classes & Subjects).", "مادة غير معروفة."], unknown_year: ["Unknown year group.", "سنة غير معروفة."],
    not_allowed: ["That subject / year isn't one of yours.", "هذه المادة / السنة ليست من نصيبك."], not_absent: ["The student isn't marked absent that day.", "الطالب ليس غائبًا في ذلك اليوم."], no_parent_email: ["No parent email on file.", "لا يوجد بريد لولي الأمر."],
    network: ["Network problem — try again.", "مشكلة في الاتصال — أعد المحاولة."], only_author: ["Only the author or admin can delete this.", "للكاتب أو الإدارة فقط حذف هذا."],
  };
  const x = m[c]; return x ? tr(x[0], x[1]) : tr("Something went wrong.", "حدث خطأ ما.");
};

export const ymd = (d: Date) => new Date(d.getTime() + 4 * 3600e3).toISOString().slice(0, 10);
export const todayStr = () => ymd(new Date());
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export function weekStart(d: string) { const x = new Date(`${d}T00:00:00Z`); return addDays(d, -((x.getUTCDay() + 6) % 7)); }

/** Excel download of one table. */
export async function xlsxTable(sheet: string, headers: string[], rows: (string | number)[][], filename: string, widths?: number[]) {
  if (!(await dlGrant("export"))) return;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(sheet.slice(0, 30));
  ws.columns = headers.map((h, i) => ({ header: h, key: `c${i}`, width: widths?.[i] || Math.min(50, Math.max(12, h.length + 4)) }));
  rows.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: { row: 1, column: headers.length } };
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

/** PDF of one table, drawn on canvas first so Arabic text shapes correctly (jsPDF alone can't). */
export async function pdfTable(opts: { title: string; subtitle?: string; headers: string[]; rows: (string | number)[][]; filename: string; rtl?: boolean }) {
  if (!(await dlGrant("export"))) return;
  const { jsPDF } = await import("jspdf");
  const W = 842, H = 595, M = 28, S = 2, RH = 20, HEAD = 62;
  const font = `"Nunito", "Segoe UI", Arial, "Noto Naskh Arabic", sans-serif`;
  const probe = document.createElement("canvas").getContext("2d")!; probe.font = `11px ${font}`;
  const n = opts.headers.length;
  const want = opts.headers.map((h, i) => Math.min(260, Math.max(48, Math.max(probe.measureText(h).width, ...opts.rows.slice(0, 80).map((r) => probe.measureText(String(r[i] ?? "")).width)) + 14)));
  const k = Math.min(1, (W - 2 * M) / want.reduce((a, b) => a + b, 0));
  const cw = want.map((w) => w * k);
  const perPage = Math.floor((H - HEAD - M - 14) / RH) - 1;
  const pages = Math.max(1, Math.ceil(opts.rows.length / perPage));
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  for (let p = 0; p < pages; p++) {
    const cv = document.createElement("canvas"); cv.width = W * S; cv.height = H * S;
    const c = cv.getContext("2d")!; c.scale(S, S); c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#12324a"; c.font = `700 18px ${font}`; c.textBaseline = "middle"; c.direction = "ltr"; c.fillText(opts.title, M, 30);
    c.fillStyle = "#5a6b7a"; c.font = `11px ${font}`; if (opts.subtitle) c.fillText(opts.subtitle, M, 48);
    const cut = (t: string, w: number) => { let s = t; if (c.measureText(s).width <= w - 8) return s; while (s.length > 1 && c.measureText(s + "…").width > w - 8) s = s.slice(0, -1); return s + "…"; };
    let y = HEAD;
    const row = (cells: (string | number)[], head: boolean, i: number) => {
      c.fillStyle = head ? "#12324a" : i % 2 ? "#f2f6f9" : "#fff"; c.fillRect(M, y, W - 2 * M, RH);
      let x = M; c.font = `${head ? "700" : "400"} 11px ${font}`; c.fillStyle = head ? "#fff" : "#1b2f44";
      cells.forEach((v, j) => { const t = String(v ?? ""); const ar = /[\u0600-\u06FF]/.test(t); c.direction = ar ? "rtl" : "ltr"; c.textAlign = ar ? "right" : "left"; c.fillText(cut(t, cw[j]), ar ? x + cw[j] - 4 : x + 4, y + RH / 2); x += cw[j]; });
      c.textAlign = "left"; c.direction = "ltr"; y += RH;
    };
    row(opts.headers, true, 0);
    opts.rows.slice(p * perPage, (p + 1) * perPage).forEach((r, i) => row(r, false, i));
    c.fillStyle = "#8a97a3"; c.font = `10px ${font}`; c.fillText(`shaiqmuhammad.com · ${new Date().toLocaleDateString("en-GB")} · ${p + 1}/${pages}`, M, H - 16);
    void n;
    if (p) pdf.addPage();
    pdf.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 842, 595);
  }
  pdf.save(opts.filename);
}

/** Quran Homework switches from a teacher's permission strings (no saved set = full legacy access). Server enforces the same rules. */
export const qhwPerm = (perms: string[] | undefined, isAdmin = false) => {
  if (isAdmin) return { show: true, view: true, add: true, edit: true, del: true };
  const p = perms || [];
  if (!p.includes("qhw:set")) return { show: true, view: true, add: true, edit: true, del: true };
  const h = (x: string) => p.includes(`qhw:${x}`);
  const show = h("show");
  return { show, view: show && (h("view") || h("add") || h("edit") || h("delete")), add: show && h("add"), edit: show && h("edit"), del: show && h("delete") };
};
