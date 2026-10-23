"use client";

import { downloadBlob, safeFileName } from "@/lib/exportUtils";
import { qrImageUrl } from "@/lib/groupSession";
import { homeworkUrl, lmsApi, type Catalog, type GeneralData, type Homework, type LmsUser, type QuranData, type Role } from "@/lib/lms";
import { clsNum, secLetter, resolveClass, resolveSection } from "@/lib/classFmt";
import { makeZip } from "@/lib/zip";

/** Student columns (admin only): header, key, width. Gender, DOB, contact, emails, nationality, language, SEN/EAL/G&T are private to admin. */
const STUDENT_COLS: [string, string, number][] = [["username", "username", 18], ["first name", "first", 16], ["last name", "last", 16], ["class", "cls", 14], ["section", "section", 12], ["pin", "pin", 10], ["gender", "gender", 10], ["dob (yyyy-mm-dd)", "dob", 16], ["contact no", "phone", 16], ["student email", "semail", 26], ["parent name", "pname", 22], ["parent email", "email", 26], ["nationality", "nat", 16], ["preferred language", "lang", 18], ["sen", "sen", 7], ["eal", "eal", 7], ["gifted & talented", "gt", 10], ["subject", "subject", 18], ["phase", "phase", 12]];
const yes = (v: string) => /^(y|yes|true|1|✓)$/i.test(v.trim());

/** Admin-only: every student field to Excel (no PINs). */
export async function exportStudentsXlsx(users: LmsUser[]) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.columns = STUDENT_COLS.filter((c) => c[1] !== "pin").map(([header, key, width]) => ({ header, key, width }));
  for (const u of users.filter((x) => x.role === "student")) ws.addRow({ username: u.username, first: u.firstName || "", last: u.lastName || "", cls: clsNum(u.cls), section: secLetter(u.section), gender: u.gender === "b" ? "Boy" : u.gender === "g" ? "Girl" : "", dob: u.dob || "", phone: u.phone || "", semail: u.semail || "", pname: u.parentName || "", email: u.email || "", nat: u.nationality || "", lang: u.prefLang || "", sen: u.sen ? "Yes" : "", eal: u.eal ? "Yes" : "", gt: u.gt ? "Yes" : "", subject: u.subject || "", phase: u.phase || "" });
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columnCount } };
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), "students-all-fields.xlsx");
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const excel = async () => (await import("exceljs")).default;

type Row = Partial<LmsUser & { pin: string }>;
/** Scope in Excel is written "Year 2/2A" (or just "Year 2"); stored as "Year 2|2A". */
const cellToScope = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.lastIndexOf("/"); return i > 0 ? `${x.slice(0, i).trim()}|${x.slice(i + 1).trim()}` : x; });

/** Bulk-upload template for one role, with dropdowns from Classes & Subjects. */
export async function downloadUsersTemplate(role: Role = "student", catalog?: Catalog) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(role === "teacher" ? "Teachers" : "Students");
  const lists = wb.addWorksheet("Lists");
  const classes = [...new Set(catalog?.classes.map((c) => clsNum(c.name)) || [])];
  const sections = [...new Set(catalog?.sections.map((c) => secLetter(c.name)) || [])];
  const subjects = catalog?.subjects.map((c) => c.name) || [];
  lists.getColumn(1).values = ["Classes", ...classes];
  lists.getColumn(2).values = ["Sections", ...sections];
  lists.getColumn(3).values = ["Subjects", ...subjects];
  lists.getColumn(4).values = ["Class/Section (teachers)", ...classes, ...(catalog?.sections.map((x) => `${x.cls}/${x.name}`) || [])];
  [1, 2, 3, 4].forEach((i) => (lists.getColumn(i).width = 24));
  lists.getRow(1).font = { bold: true };
  const c1 = catalog?.classes[0]?.name || "Year 3";
  const s1 = catalog?.sections.find((x) => x.cls === c1)?.name || "";
  if (role === "student") {
    ws.columns = STUDENT_COLS.map(([header, key, width]) => ({ header, key, width }));
    ws.addRow({ username: "aisha.k", first: "Aisha", last: "Khan", cls: clsNum(c1), section: secLetter(s1), pin: "", gender: "Girl", dob: "2017-05-14", phone: "", semail: "", pname: "Mr. Khan", email: "parent@example.com", nat: "", lang: "English", sen: "", eal: "Yes", gt: "" });
    ws.addRow({ username: "omar.s", first: "Omar", last: "Saleh", cls: clsNum(c1), section: secLetter(s1), pin: "4821", gender: "Boy", dob: "2016-11-02" });
    lists.getColumn(5).values = ["Yes/No", "Yes", "No"];
    lists.getColumn(6).values = ["Gender", "Boy", "Girl"];
    for (let r = 2; r <= 1000; r++) {
      if (classes.length) ws.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$A$2:$A$${classes.length + 1}`], showErrorMessage: true, error: "Pick a class from the list" };
      if (sections.length) ws.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`Lists!$B$2:$B$${sections.length + 1}`], showErrorMessage: true, error: "Pick a section from the list" };
      ws.getCell(`G${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$F$2:$F$3"], showErrorMessage: true, error: "Boy or Girl" };
      ws.getCell(`H${r}`).numFmt = "@";
      for (const col of ["N", "O", "P"]) ws.getCell(`${col}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$E$2:$E$3"], showErrorMessage: true, error: "Yes or No" };
      ws.getCell(`S${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"EYFS,Primary,Secondary"'], showErrorMessage: true, error: "EYFS, Primary or Secondary" };
      for (const col of ["J", "K"]) ws.getCell(`${col}${r}`).dataValidation = { type: "custom", allowBlank: true, formulae: [`ISNUMBER(FIND("@",${col}${r}))`], showErrorMessage: true, error: "Enter a valid email" };
    }
  } else {
    ws.columns = [
      { header: "username", key: "username", width: 18 },
      { header: "name", key: "name", width: 26 },
      { header: "subjects", key: "subjects", width: 26 },
      { header: "phase", key: "phase", width: 22 },
      { header: "pin", key: "pin", width: 10 },
      { header: "permissions", key: "perms", width: 30 },
    ];
    ws.addRow({ username: "ms.huda", name: "Ms Huda", subjects: subjects.slice(0, 2).join(", ") || "Quran", phase: "Primary", pin: "", perms: "assign, review" });
  }
  ws.getRow(1).font = { bold: true };
  const help = wb.addWorksheet("Help");
  [
    "username: 3–40 characters, letters/numbers/dot/dash, unique (stored in lower case).",
    role === "student" ? "class and section: pick from the dropdowns (they come from Admin → Classes & Subjects)." : "subjects: comma separated, from the Lists sheet. phase: EYFS, Primary and/or Secondary (comma separated). Students are assigned to teachers through Groups in Admin → Members → Groups, not in this sheet.",
    "pin: 4–8 digits. Leave empty to generate a random 6-digit PIN.",
    role === "teacher" ? "permissions (comma separated): assign, review, manageUsers, viewAll; optional student switches: stu:view, stu:add, stu:edit, stu:block, stu:delete (none = all four when manageUsers)." : "",
    "Existing usernames are updated (upsert). A PIN is only changed when you fill it in; empty cells leave stored values unchanged.",
    role === "student" ? "gender: Boy/Girl · dob: yyyy-mm-dd · SEN / EAL / gifted & talented: Yes or blank. These private fields are visible to admin only." : "",
  ].filter(Boolean).forEach((t) => help.addRow([t]));
  help.getColumn(1).width = 120;
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), `${role === "teacher" ? "teachers" : "students"}-template.xlsx`);
}

/** Reads an uploaded template into rows for one role. */
export async function parseUsersXlsx(file: File, role: Role = "student", catalog?: Catalog): Promise<Row[]> {
  const list = (v = "") => v.split(",").map((x) => x.trim()).filter(Boolean);
  // A section name maps to "Class|Section" through Classes & Subjects ("Class/Section" also accepted).
  const secScope = (v: string) => (v.includes("/") ? cellToScope(v)[0] : (catalog?.sections.filter((x) => x.name === v).map((x) => `${x.cls}|${x.name}`)[0] ?? v));
  // Teachers: classes = class numbers ("3, 4"); sections = letters ("A, B") that apply to those classes. Empty sections = whole classes.
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const head: Record<number, string> = {};
  ws.getRow(1).eachCell((c, i) => (head[i] = String(c.text || "").trim().toLowerCase()));
  const rows: Row[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r: Record<string, string> = {};
    row.eachCell((c, i) => (r[head[i]] = String(c.text ?? "").trim()));
    if (!r.username && !r.name) return;
    rows.push(
      role === "teacher"
        ? { username: r.username, name: r.name, role, cls: "", subjects: (r.subjects || "").split(",").map((x) => x.trim()).filter(Boolean), scope: [], phase: r.phase || "", pin: r.pin || undefined, perms: (r.permissions || r.perms || "assign, review").split(/[,\s]+/).filter(Boolean) }
        : { username: r.username, name: (`${r["first name"] || ""} ${r["last name"] || ""}`.trim() || r.name), firstName: r["first name"] || (r.name || "").split(/\s+/)[0], lastName: r["last name"] ?? (r.name || "").split(/\s+/).slice(1).join(" "), role, cls: resolveClass(r.class || r.cls || "", catalog), section: resolveSection(r.section || "", resolveClass(r.class || r.cls || "", catalog), catalog), pin: r.pin || undefined, perms: [], parentName: r["parent name"] || "", email: r["parent email"] || r.email || "", gender: /^(b|boy)$/i.test(r.gender || r["boy/girl"] || "") ? "b" : /^(g|girl)$/i.test(r.gender || r["boy/girl"] || "") ? "g" : "", dob: (r["dob (yyyy-mm-dd)"] || r.dob || "").slice(0, 10), phone: r["contact no"] || "", semail: r["student email"] || "", nationality: r.nationality || "", prefLang: r["preferred language"] || "", sen: yes(r.sen || ""), eal: yes(r.eal || ""), gt: yes(r["gifted & talented"] || ""), subject: r.subject || "", phase: r.phase || "" },
    );
  });
  // Blank cells must not wipe stored private fields on upsert.
  for (const r of rows as Record<string, unknown>[]) for (const k of ["gender", "dob", "phone", "semail", "nationality", "prefLang", "email", "parentName", "subject", "phase"]) if (r[k] === "") delete r[k];
  for (const r of rows as Record<string, unknown>[]) for (const k of ["sen", "eal", "gt"]) if (r[k] === false) delete r[k];
  return rows;
}

/** Sign-in sheet for a list of people. PINs come from the admin-only lookup (null = reset to view). */
export async function downloadSignInSheet(users: LmsUser[], pins: Record<string, string | null>, role: Role) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sign-in sheet");
  const url = `${window.location.origin}/lms/login`;
  ws.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Username", key: "username", width: 20 },
    { header: "PIN", key: "pin", width: 18 },
    ...(role === "student"
      ? [{ header: "Class", key: "cls", width: 14 }, { header: "Section", key: "section", width: 12 }]
      : [{ header: "Subjects", key: "subjects", width: 26 }, { header: "Phase", key: "phase", width: 18 }, { header: "Groups", key: "groups", width: 30 }]),
    { header: "Status", key: "status", width: 10 },
    { header: "Sign in at", key: "url", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const u of users) ws.addRow({ name: u.name, username: u.username, pin: pins[u.id] ?? "(reset PIN to view)", cls: clsNum(u.cls), section: secLetter(u.section), subjects: u.subjects.join(", "), phase: (u.phase || "").split(",").filter(Boolean).join(", "), groups: (u.groups || []).map((g) => g.name).join(", "), status: u.disabled ? "Blocked" : "Active", url });
  downloadBlob(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), `${role === "teacher" ? "teachers" : "students"}-sign-in-${new Date().toISOString().slice(0, 10)}.xlsx`);
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

/** Per-student QR cards (A5, one page each). The QR opens the read-only token page /q?t=… — no username/PIN. */
export async function studentQrCardsPdf(hw: Homework, opts: { surahEn?: string; surahAr?: string; verses?: string; teacher: string; links: { name: string; nameAr?: string; cls: string; section: string; token: string }[]; lang?: string; mode?: "auto" | "ar" | "en" | "both" }) {
  const W = 1240, H = 1748;
  const { pickName } = await import("@/lib/studentName");
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a5" });
  const origin = window.location.origin;
  let first = true;
  for (const l of opts.links.filter((x) => x.token)) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fffaf0"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#16324f"; g.lineWidth = 18; g.strokeRect(30, 30, W - 60, H - 60);
    g.strokeStyle = "#f2c14e"; g.lineWidth = 6; g.strokeRect(62, 62, W - 124, H - 124);
    g.fillStyle = "#16324f"; g.fillRect(62, 62, W - 124, 170);
    g.textAlign = "center";
    g.fillStyle = "#f2c14e"; g.font = "bold 54px system-ui, sans-serif";
    g.fillText(hw.kind === "quran" ? "Quran homework · واجب القرآن" : "Homework · واجب", W / 2, 168);
    // Student name: Arabic, English or both per the admin setting (Arabic shaped by the canvas, RTL).
    const shown = pickName(l.name, l.nameAr, opts.lang || "en", opts.mode || "auto");
    const isAr = /[\u0600-\u06FF]/.test(shown);
    g.fillStyle = "#16324f"; g.font = isAr ? "bold 70px 'Noto Naskh Arabic', Amiri, 'Segoe UI', system-ui, sans-serif" : "bold 76px system-ui, sans-serif";
    g.direction = isAr ? "rtl" : "ltr";
    let nm = shown.slice(0, 60);
    while (nm.length > 4 && g.measureText(nm).width > W - 180) nm = nm.slice(0, -1);
    g.fillText(nm, W / 2, 340);
    g.direction = "ltr";
    g.font = "40px system-ui, sans-serif"; g.fillStyle = "#3b5770";
    g.fillText([l.cls, l.section].filter(Boolean).join(" · "), W / 2, 400);
    if (hw.kind === "quran" && opts.surahAr) {
      g.fillStyle = "#16324f"; g.font = "bold 84px 'Amiri Quran', Amiri, serif";
      g.fillText(`سورة ${opts.surahAr}`, W / 2, 520);
      g.font = "bold 44px system-ui, sans-serif";
      g.fillText(`Surah ${opts.surahEn} · ${opts.verses}`, W / 2, 590);
    } else {
      g.fillStyle = "#16324f"; g.font = "bold 56px system-ui, sans-serif";
      g.fillText(hw.title.slice(0, 36), W / 2, 540);
    }
    const qr = await loadImage(qrImageUrl(`${origin}/q?t=${l.token}`, 700));
    g.fillStyle = "#ffffff"; g.fillRect((W - 700) / 2 - 20, 650, 740, 740);
    g.drawImage(qr, (W - 700) / 2, 670, 700, 700);
    g.fillStyle = "#16324f"; g.font = "bold 36px system-ui, sans-serif";
    g.fillText("Scan to see your verses, recitation & feedback", W / 2, 1470);
    g.fillText("امسح لرؤية الآيات والتلاوة وملاحظات المعلم", W / 2, 1525);
    g.font = "32px system-ui, sans-serif"; g.fillStyle = "#3b5770";
    g.fillText(`Teacher: ${opts.teacher} · Shaiq Muhammad`, W / 2, 1610);
    if (!first) pdf.addPage("a5");
    first = false;
    pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 148, 210);
  }
  pdf.save(`${safeFileName(hw.title)}-student-qr-cards.pdf`);
}
