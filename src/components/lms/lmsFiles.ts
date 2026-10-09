"use client";

import { downloadBlob, safeFileName } from "@/lib/exportUtils";
import { qrImageUrl } from "@/lib/groupSession";
import { homeworkUrl, lmsApi, type GeneralData, type Homework, type LmsUser, type QuranData } from "@/lib/lms";
import { makeZip } from "@/lib/zip";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const excel = async () => (await import("exceljs")).default;

/** Template for bulk user upload. */
export async function downloadUsersTemplate() {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Users");
  ws.columns = [
    { header: "username", key: "username", width: 18 },
    { header: "name", key: "name", width: 26 },
    { header: "role", key: "role", width: 10 },
    { header: "class", key: "cls", width: 10 },
    { header: "pin", key: "pin", width: 10 },
    { header: "permissions", key: "perms", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ username: "aisha.k", name: "Aisha Khan", role: "student", cls: "3A", pin: "", perms: "" });
  ws.addRow({ username: "omar.s", name: "Omar Saleh", role: "student", cls: "3A", pin: "4821", perms: "" });
  ws.addRow({ username: "ms.huda", name: "Ms Huda", role: "teacher", cls: "3A", pin: "", perms: "assign, review" });
  const help = wb.addWorksheet("Help");
  [
    "username: 3–40 characters, letters/numbers/dot/dash, unique (stored in lower case).",
    "role: student or teacher. class: e.g. 3A — homework can be assigned to a whole class.",
    "pin: 4–8 digits. Leave empty to generate a random 6-digit PIN (shown once after import).",
    "permissions (teachers only, comma separated): assign, review, manageUsers, viewAll.",
    "Existing usernames are updated (a PIN is only changed when you fill it in).",
  ].forEach((t) => help.addRow([t]));
  help.getColumn(1).width = 110;
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), "users-template.xlsx");
}

/** Reads the uploaded .xlsx into user rows (header names as in the template). */
export async function parseUsersXlsx(file: File): Promise<Partial<LmsUser & { pin: string }>[]> {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const head: Record<number, string> = {};
  ws.getRow(1).eachCell((c, i) => (head[i] = String(c.text || "").trim().toLowerCase()));
  const rows: Partial<LmsUser & { pin: string }>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Record<string, string> = {};
    row.eachCell((c, i) => (r[head[i]] = String(c.text ?? "").trim()));
    if (!r.username && !r.name) return;
    rows.push({
      username: r.username,
      name: r.name,
      role: r.role?.toLowerCase() === "teacher" ? "teacher" : "student",
      cls: r.class || r.cls || "",
      pin: r.pin || undefined,
      perms: (r.permissions || r.perms || "").split(/[,\s]+/).filter(Boolean),
    });
  });
  return rows;
}

/** Sign-in cards for newly created users (the only time PINs are visible). */
export async function downloadCredentials(pins: { username: string; name: string; pin: string }[]) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sign-in details");
  ws.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Username", key: "username", width: 20 },
    { header: "PIN", key: "pin", width: 10 },
    { header: "Sign in at", key: "url", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  pins.forEach((p) => ws.addRow({ ...p, url: `${window.location.origin}/lms/login` }));
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), `sign-in-details-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

/** A printable A5 QR card for one homework (drawn on a canvas so Arabic titles render), saved as PDF. */
export async function homeworkQrPdf(hw: Homework, subtitle: string) {
  const url = homeworkUrl(hw.id);
  const W = 1240;
  const H = 1748; // A5 at 150 dpi
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#16324f";
  g.fillRect(0, 0, W, 220);
  g.fillStyle = "#f2c14e";
  g.font = "bold 54px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText(hw.kind === "quran" ? "Quran homework · واجب القرآن" : "Homework · واجب", W / 2, 135);
  g.fillStyle = "#16324f";
  g.font = "bold 64px system-ui, sans-serif";
  const words = hw.title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > W - 160 && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  lines.slice(0, 3).forEach((l, i) => g.fillText(l, W / 2, 340 + i * 80));
  g.font = "40px system-ui, sans-serif";
  g.fillStyle = "#3b5770";
  g.fillText(subtitle, W / 2, 340 + Math.min(lines.length, 3) * 80 + 30);
  const qr = await loadImage(qrImageUrl(url, 800));
  g.drawImage(qr, (W - 760) / 2, 640, 760, 760);
  g.fillStyle = "#16324f";
  g.font = "bold 40px system-ui, sans-serif";
  g.fillText("Scan, sign in with your username + PIN", W / 2, 1490);
  g.fillText("امسح الرمز وسجّل الدخول باسم المستخدم والرقم السري", W / 2, 1550);
  g.font = "28px system-ui, sans-serif";
  g.fillStyle = "#3b5770";
  g.fillText(url, W / 2, 1640);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a5" });
  pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 148, 210);
  pdf.save(`${safeFileName(hw.title)}-qr-card.pdf`);
}

/** "Export all homework": one ZIP with a summary workbook, a workbook per homework and the raw JSON. */
export async function exportAllHomeworkZip(asAdmin: boolean) {
  const d = await lmsApi.exportAll(asAdmin);
  const ExcelJS = await excel();
  const users = new Map(d.users.map((u) => [u.id, u]));
  const status = (s: string) => ({ draft: "Draft", submitted: "Submitted", approved: "Approved", returned: "Returned" })[s] || s;
  const files: { name: string; data: Uint8Array | string }[] = [];

  const sum = new ExcelJS.Workbook();
  const ws = sum.addWorksheet("Homework");
  ws.columns = [
    { header: "Title", key: "title", width: 40 },
    { header: "Type", key: "kind", width: 10 },
    { header: "Class", key: "cls", width: 10 },
    { header: "Details", key: "details", width: 30 },
    { header: "Due", key: "due", width: 14 },
    { header: "Submitted", key: "sub", width: 11 },
    { header: "Approved", key: "app", width: 11 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const h of d.homework) {
    const subs = d.subs.filter((s) => s.hw === h.id);
    const q = h.data as QuranData;
    ws.addRow({ title: h.title, kind: h.kind, cls: h.cls || "All", details: h.kind === "quran" ? `Surah ${q.surah}: ${q.from}-${q.to}` : `${(h.data as GeneralData).slides?.length || 0} slides`, due: h.due ? new Date(h.due).toLocaleDateString() : "", sub: subs.filter((s) => s.status !== "draft").length, app: subs.filter((s) => s.status === "approved").length });

    const wb = new ExcelJS.Workbook();
    const sh = wb.addWorksheet("Submissions");
    sh.columns = [
      { header: "Student", key: "name", width: 26 },
      { header: "Username", key: "username", width: 18 },
      { header: "Class", key: "cls", width: 10 },
      { header: "Status", key: "status", width: 12 },
      { header: "Practised", key: "practised", width: 10 },
      { header: "Response", key: "text", width: 60 },
      { header: "Teacher liked", key: "liked", width: 12 },
      { header: "Teacher comments", key: "comments", width: 50 },
      { header: "Updated", key: "updated", width: 20 },
    ];
    sh.getRow(1).font = { bold: true };
    subs.forEach((s) => {
      const u = users.get(s.student);
      sh.addRow({ name: u?.name || "?", username: u?.username || "", cls: u?.cls || "", status: status(s.status), practised: s.practised ? "yes" : "", text: s.text, liked: s.liked ? "yes" : "", comments: s.comments.map((c) => `${c.by}: ${c.text}`).join(" | "), updated: new Date(s.updated).toLocaleString() });
    });
    files.push({ name: `homework/${safeFileName(h.title)}-${h.id.slice(-6)}.xlsx`, data: new Uint8Array(await wb.xlsx.writeBuffer()) });
  }
  const tr = sum.addWorksheet("Quran tracker");
  tr.columns = [
    { header: "Student", key: "name", width: 26 },
    { header: "Class", key: "cls", width: 10 },
    { header: "Surah", key: "surah", width: 8 },
    { header: "From", key: "from", width: 8 },
    { header: "To", key: "to", width: 8 },
    { header: "Approved", key: "approved", width: 20 },
  ];
  tr.getRow(1).font = { bold: true };
  d.tracker.forEach((t) => tr.addRow({ name: users.get(t.student)?.name || "?", cls: users.get(t.student)?.cls || "", surah: t.surah, from: t.from, to: t.to, approved: new Date(t.approved).toLocaleString() }));
  files.unshift({ name: "summary.xlsx", data: new Uint8Array(await sum.xlsx.writeBuffer()) });
  files.push({ name: "data.json", data: JSON.stringify({ ...d, users: d.users.map(({ id, username, name, role, cls }) => ({ id, username, name, role, cls })) }, null, 2) });
  files.push({ name: "README.txt", data: `Homework export ${new Date(d.exportedAt).toISOString()}\n\nsummary.xlsx – every homework + Quran tracker\nhomework/*.xlsx – one workbook per homework with each student's submission\ndata.json – everything in machine-readable form\n\nRecordings will be included once file storage is enabled.\n` });
  downloadBlob(makeZip(files), `homework-export-${new Date().toISOString().slice(0, 10)}.zip`);
}
