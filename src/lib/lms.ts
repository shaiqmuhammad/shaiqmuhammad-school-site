"use client";

import { getServerSession } from "@/lib/adminServer";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";

/** LMS phase 1 client (see workers/assessment-session/src/lms.ts). */
export type Role = "student" | "teacher" | "parent";
export type LmsUser = { id: string; username: string; name: string; nameAr?: string; role: Role; cls: string; section: string; subjects: string[]; scope: string[]; perms: string[]; groups?: { id: string; name: string; subject: string }[]; subject?: string; phase?: string; disabled: boolean; hasPin: boolean; firstName?: string; lastName?: string; parentEmail?: boolean; parentName?: string; gender?: string; avatar?: string; email?: string; dob?: string; phone?: string; semail?: string; nationality?: string; prefLang?: string; sen?: boolean; eal?: boolean; gt?: boolean; /** Tracker Target (as entered), scaled score, and the effective Target (Target, else from scaled score) */ target?: string; scaled?: string; targetEff?: string; /** iSAMS (admin only) */ isamsId?: string; isamsSurname?: string; created: number; lastLogin: number | null; lastSeen?: number };
export type Catalog = { subjects: { id: string; name: string }[]; classes: { id: string; name: string }[]; sections: { id: string; name: string; classId: string; cls: string }[] };
export type DashStudent = { id: string; name: string; cls: string; section: string };
/** Teacher scope entry: "Year 2" (whole class) or "Year 2|2A" (one section). */
export const scopeLabel = (s: string) => s.replace("|", " · ");
/** t292: module permissions (Assessment Tracker, Department Report, Attainment & Progress report). */
export const MP_MODS = ["trk", "rep", "aps", "tt", "lp"] as const;
export const MP_KEYS = ["show", "view", "add", "edit", "delete", "xlsx", "pdf", "isams", "share"] as const;
export type MpMod = (typeof MP_MODS)[number];
export type MpKey = (typeof MP_KEYS)[number];
export type MpAcc = Record<MpKey, boolean>;
export type MpPart = Partial<Record<MpMod, Partial<MpAcc>>>;
export type MpCfg = { global: MpPart; roles: Record<string, MpPart>; subjects: Record<string, MpPart> };
export const mpShown = (a: Actor | null | undefined, m: MpMod) => !a?.mods || !!a.mods[m]?.view;
export type Actor = { id: string; role: Role | "admin"; name: string; nameAr?: string; cls: string; perms: string[]; scope?: string[]; viewAs?: boolean; subj?: string[]; subjects?: string[]; subject?: string; arabic?: boolean; mods?: Record<MpMod, MpAcc> };
export type Slide = { title: string; text: string; image: string };
export type QuranData = { surah: number; from: number; to: number; reciter: string; notes: string; translit?: boolean; translation?: boolean; extra?: string; memorise?: boolean; memoAudio?: boolean };
export type GeneralData = { slides: Slide[]; question: string };
export type Homework = { id: string; kind: "quran" | "general"; title: string; cls: string; section?: string; students: string[]; data: QuranData | GeneralData; due: number | null; createdBy: string; created: number; locked?: boolean; lockedBy?: { surah: number; from: number; to: number; title: string } | null; late?: boolean };
export type Comment = { by: string; text: string; at: number; audio?: string };
export type RosterStudent = { id: string; name: string; cls: string; section: string; avatar: string; parentEmail: boolean; points: number; seen: number };
export type PointCat = { id: string; label: string; pts: number; icon: string };
export type PointRow = { id: string; student: string; name: string; label: string; pts: number; icon: string; by: string; at: number };
export type WallClass = { key: string; label: string; group?: boolean; count?: number; members?: { id: string; name: string }[] };
export type StudentGroup = { id: string; name: string; subject?: string; students: string[]; owner: string; assigned?: boolean; adminGroup?: boolean; classes?: string[]; teachers?: string[]; rawStudents?: string[] };
export type ReportView = { kind: "points" | "quran"; id: string; name: string; cls: string; section: string; avatar: string; points?: { label: string; pts: number; icon: string; by: string; at: number }[]; tracker?: TrackerRow[]; progress?: unknown };
export type Assignment = { id: string; quiz: string; title: string; mode: "individual" | "group"; cls: string; section: string; students: string[]; due: number | null; by: string; created: number };
export type Announcement = { id: string; title: string; body: string; aud: "all" | "students" | "teachers" | "class"; cls: string; section: string; by: string; created: number };
export type WallComment = { id: string; name: string; role: string; text: string; at: number };
/** Likes/comments of one group's copy of a post (each group wall keeps its own). */
export type WallGroupInter = { key: string; post: string; likes: number; liked: boolean; comments: WallComment[] };
export type WallPost = { keys?: string[]; groups?: WallGroupInter[]; id: string; name: string; text: string; hasImage: boolean; hasAudio: boolean; pinned: boolean; at: number; likes: number; liked: boolean; comments: { id: string; name: string; role: string; text: string; at: number }[] };
export type LiveActivity = { code: string; type: string; title: string; teacher: string; at: number };
export type MsgContact = { id: string; name: string; role: string; cls: string; seen?: number };
export type CorrectedItem = { id: string; hw: string; title: string; data: QuranData; student: string; name: string; cls: string; section: string; grade: Grade; status: string; scores: Scores | null; gradedAt: number; by: string };
export type MsgThread = { thread: string; with: string; withName: string; people: string[]; mine: boolean; last: number; preview: string; unread: number };
export type ParentContact = { student: string; studentName: string; cls: string; parentName: string; canMail: boolean };
export type ParentThread = { thread: string; student: string; studentName: string; cls: string; parentName: string; teacherName: string; last: number; count: number; unread: number; preview: string; lastDir: string };
export type ParentMsg = { id: string; dir: "in" | "out"; subject: string; body: string; created: number };
export type Msg = { id: string; sender: string; body: string; created: number; mine: boolean };
export type Note = { id: string; kind: "hw_new" | "sub_new" | "feedback" | "feedback_audio" | "approved" | "returned" | "graded" | "reminder" | "revise" | "mistakes" | "announcement" | "message"; data: { hw?: string; title?: string; by?: string; student?: string; grade?: Grade; overdue?: boolean; count?: number; surah?: number }; created: number; read: boolean };
export type Level = 1 | 2 | 3;
/** Makharij / Tajweed / Recitation levels (1 Needs practice · 2 Good · 3 Excellent) + generated feedback. */
export type Scores = { m: Level; t: Level; r: Level; h?: Level; notes?: { m?: string; t?: string; r?: string; h?: string }; fb?: { en: string; ar: string } };
/** t328: one submission on a Surah (all its homework), numbered v1, v2… */
export type Version = { v: number; hw: string; title: string; from: number; to: number; audio: string; at: number; grade: Grade | ""; scores: Scores | null; by: string; pending: boolean; feedback: string[] };
export type HwShare = { teachers: string[]; correct: boolean };
export type Submission = { versions?: Version[]; id: string; status: "draft" | "submitted" | "approved" | "returned"; text: string; practised: boolean; liked: boolean; comments: Comment[]; audio?: string; grade?: Grade | ""; scores?: Scores | null; attempts?: Attempt[]; mistakes?: Mistake[]; submittedAt?: number; updated: number };
export type Grade = "green" | "yellow" | "red";
export type Attempt = { n: number; audio: string; grade: Grade; by: string; at: number; scores?: Scores };
export type TrackerRow = { surah: number; from: number; to: number; approved: number; grade?: Grade; hw?: string; revCount?: number; revDue?: number; scores?: Scores | null };
export type Progress = { stars: number; streak: number; greens: number; yellows: number; handed: number; badges: string[]; activeDays: number };
export type Mistake = { ayah: number; word: number; text: string; note: string };
export type MapRow = { id: string; name: string; cls: string; section: string; cells: Record<number, { grade: string; verses: number }> };

/** Student-account switches. Legacy "Manage students" with none of the stu:* flags set means all four. */
export const stuUi = (perms: string[], op: "view" | "add" | "edit" | "block" | "delete") => { if (!perms.includes("manageUsers")) return false; const has = perms.filter((p) => p.startsWith("stu:")); return has.length ? has.includes(`stu:${op}`) : true; };
export const PERMS = ["assign", "review", "manageUsers", "viewAll", "shareCorrect", "viewAsStudent"] as const;

export class LmsError extends Error {
  data?: Record<string, unknown>;
  constructor(public code: string, public status: number) {
    super(code);
  }
}

const SESSION_KEY = "sm_lms_session_v1";
type Session = { token: string; exp: number; user: Actor };

export function lmsSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    let s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as Session | null;
    if (!s?.token) {
      // Fallback copy in a first-party cookie (some phone browsers clear site storage); restore it.
      const m = document.cookie.match(/(?:^|; )sm_lms_s=([^;]*)/);
      if (m) { s = JSON.parse(decodeURIComponent(m[1])) as Session; if (s?.token) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
    }
    if (s?.token && s.exp > Date.now()) return s;
  } catch {
    // ignore
  }
  return null;
}
function storeSession(r: { token: string; exp: number; user: LmsUser }): Session {
  const s: Session = { token: r.token, exp: r.exp, user: { id: r.user.id, role: r.user.role, name: r.user.name, cls: r.user.cls, perms: r.user.perms, scope: r.user.scope, ...(r.user.role === "teacher" ? { subjects: r.user.subjects || [] } : {}) } as Actor };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  localStorage.setItem("sm_lms_login_at", String(Date.now()));
  localStorage.setItem("sm_lms_renew_at", String(Date.now()));
  writeSessionCookie(s);
  return s;
}
function writeSessionCookie(s: Session | null) {
  try {
    if (!s) { document.cookie = "sm_lms_s=; Max-Age=0; Path=/; SameSite=Lax; Secure"; return; }
    let v = encodeURIComponent(JSON.stringify(s));
    if (v.length > 3800) v = encodeURIComponent(JSON.stringify({ ...s, user: { ...s.user, scope: [] } }));
    if (v.length <= 3900) document.cookie = `sm_lms_s=${v}; Max-Age=${3650 * 86400}; Path=/; SameSite=Lax; Secure`;
  } catch { /* ignore */ }
}
export type LoginCard = { id: string; name: string; nameAr?: string; username: string; cls: string; section: string; avatar: string; disabled: boolean; pin: string | null; token: string };
let renewing = false;
/** Sliding renewal: keep a signed-in LMS session alive (30 days from the last visit) without any prompt. */
export async function lmsRenew(force = false) {
  const s = lmsSession();
  if (!s || renewing || typeof window === "undefined") return;
  // Sliding renewal on visits (at most once a day): the session never runs out while it is being used.
  if (!force && Date.now() - Number(localStorage.getItem("sm_lms_renew_at") || 0) < 864e5) return;
  renewing = true;
  try {
    const r = await call<{ token: string; exp: number; user: LmsUser }>("refresh", {});
    storeSession({ token: r.token, exp: r.exp, user: { ...r.user, perms: r.user.perms, scope: r.user.scope } as LmsUser });
  } catch { /* offline or rejected: the next real call decides */ }
  renewing = false;
}
export function lmsSignOut() {
  localStorage.removeItem(SESSION_KEY);
  writeSessionCookie(null);
}

/** Admin read-only "view as" (this browser tab only; never touches the user's real LMS session). */
export type QrLink = { student: string; name: string; nameAr?: string; arabic?: boolean; cls: string; section: string; token: string };
export type QrView = { versions?: Version[]; dl?: boolean; student: string; studentAr?: string; arabic?: boolean; cls: string; section: string; homework: { title: string; kind: "quran" | "general"; data: Partial<QuranData> }; status: string; grade: Grade | ""; scores?: Scores | null; recordings: string[]; recAt?: Record<string, number>; attempts: { n: number; grade: Grade; audio: string; at: number; scores?: Scores }[]; feedback: { by: string; text: string; audio: string; at: number }[]; tracker: TrackerRow[] };
import type { ResultRecord } from "@/lib/resultsRecord";
export type ViewAs = { id: string; name: string; role: "student" | "teacher"; cls: string; by?: "t" };
export function viewAs(): ViewAs | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(sessionStorage.getItem("sm_view_as") || "null") as ViewAs | null;
    if (!v) return null;
    // t329: a teacher's "log in as student" uses the teacher's own LMS session; admin's uses the admin session.
    if (v.by === "t") return lmsSession()?.user?.role === "teacher" ? v : null;
    return getServerSession() ? v : null;
  } catch {
    return null;
  }
}
export function exitViewAs() {
  try { sessionStorage.removeItem("sm_view_as"); } catch { /* ignore */ }
}
function authHeaders(asAdmin = false): Record<string, string> {
  const va = !asAdmin ? viewAs() : null;
  if (va) return { Authorization: `Bearer ${va.by === "t" ? lmsSession()!.token : getServerSession()!.token}`, "X-View-As": va.id };
  const tok = bearer(asAdmin);
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

/** Admin pages send ONLY the admin token; the LMS (/lms) sends ONLY the student/teacher token. Never mixed. */
function bearer(asAdmin = false): string | null {
  return asAdmin ? (getServerSession()?.token ?? null) : (lmsSession()?.token ?? null);
}

async function call<T>(action: string, body?: unknown, opts: { asAdmin?: boolean; query?: Record<string, string> } = {}): Promise<T> {
  const q = opts.query ? "?" + new URLSearchParams(opts.query).toString() : "";
  let res: Response;
  try {
    res = await fetch(`${ASSESSMENT_API_BASE}/api/lms/${action}${q}`, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...authHeaders(opts.asAdmin) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new LmsError("network", 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && !opts.asAdmin && !viewAs() && lmsSession() && !["login", "qr-login", "refresh"].includes(action)) {
    // The session was ended on the server (blocked account / PIN changed elsewhere / expired): back to the right login, then return here.
    lmsSignOut();
    try {
      const p = window.location.pathname;
      if (p.startsWith("/lms") && !p.startsWith("/lms/login") && !p.startsWith("/lms/qr") && Date.now() - Number(sessionStorage.getItem("sm_lms_relogin") || 0) > 20_000) {
        sessionStorage.setItem("sm_lms_relogin", String(Date.now()));
        window.location.assign(`/lms/login/?next=${encodeURIComponent(p + window.location.search)}`);
      }
    } catch { /* ignore */ }
  }
  if (!res.ok) { const er = new LmsError(data.error || "error", res.status); er.data = data as Record<string, unknown>; throw er; }
  return data;
}

/** The Class Wall also opens inside the admin area (admin token) — set by the admin Wall tab. */
let wallAdmin = false;
export const setWallAdmin = (v: boolean) => { wallAdmin = v; };

export const lmsApi = {
  hwLocks: (hw: string, opts: { student?: string; unlock?: boolean } = {}, asAdmin = false) => (opts.student ? call<{ locks: { student: string; name: string; section: string; lockedBy: Homework["lockedBy"]; unlocked: boolean }[] }>("hw-unlock", { hw, ...opts }, { asAdmin }) : call<{ locks: { student: string; name: string; section: string; lockedBy: Homework["lockedBy"]; unlocked: boolean }[] }>("hw-unlock", undefined, { asAdmin, query: { hw } })),
  qrLinks: (hw: string, opts: { student?: string; reset?: boolean; revoke?: boolean } = {}, asAdmin = false) => (opts.student ? call<{ links: QrLink[]; teacher: string }>("qr-links", { hw, ...opts }, { asAdmin }) : call<{ links: QrLink[]; teacher: string }>("qr-links", undefined, { asAdmin, query: { hw } })),
  qrView: (t: string) => call<QrView>("qr", undefined, { query: { t } }),
  hwShareGet: (hw: string, asAdmin = false) => call<{ share: HwShare; teachers: { id: string; name: string; permitted: boolean }[]; own: boolean }>("hw-share", undefined, { asAdmin, query: { hw } }),
  hwShareSet: (hw: string, share: HwShare, asAdmin = false) => call<{ ok: true; share: HwShare }>("hw-share", { hw, ...share }, { asAdmin }),
  qpreGet: (asAdmin = false) => call<{ presets: Record<string, [string, string][]> | null }>("qpre-get", {}, { asAdmin }),
  qpreSave: (presets: Record<string, [string, string][]>) => call<{ ok: true }>("qpre-save", { presets }, { asAdmin: true }),
  qrAudioUrl: (t: string, id: string, dl = false) => `${ASSESSMENT_API_BASE}/api/lms/qr-audio?t=${encodeURIComponent(t)}&id=${encodeURIComponent(id)}${dl ? "&dl=1" : ""}`,
  viewAsLog: () => call<{ items: { uid: string; name: string; role: string; at: number; by?: string }[] }>("viewas-log", undefined, { asAdmin: true }),
  async login(username: string, pin: string) {
    const r = await call<{ token: string; exp: number; user: LmsUser }>("login", { username, pin });
    return storeSession(r);
  },
  me: () => call<{ user: Actor }>("me"),
  modpermGet: () => call<{ cfg: MpCfg }>("modperm-get", {}, { asAdmin: true }),
  modpermSave: (cfg: MpCfg) => call<{ cfg: MpCfg }>("modperm-save", { cfg }, { asAdmin: true }),
  nameMode: (asAdmin = false) => call<{ mode: string }>("name-mode", undefined, { asAdmin }),
  setNameMode: (mode: string) => call<{ mode: string }>("name-mode", { mode }, { asAdmin: true }),
  dashboard: (asAdmin = false) =>
    call<{ homework: (Homework & { sub?: Submission | null; counts?: Record<string, number>; assigned?: number })[]; tracker?: TrackerRow[]; progress?: Progress; leaderboard?: boolean; classes?: { cls: string; students: number }[]; students?: DashStudent[]; catalog?: Catalog; scope?: string[] }>("dashboard", undefined, { asAdmin }),
  users: (asAdmin = true) => call<{ users: LmsUser[]; now?: number; adminSeen?: number }>("users", undefined, { asAdmin }),
  saveUsers: (users: Partial<LmsUser & { pin: string }>[], asAdmin = true) => call<{ saved: number; pins: { username: string; name: string; pin: string }[]; errors: { row: number; username: string; error: string }[] }>("users", { users }, { asAdmin }),
  parentContacts: (asAdmin = false) => call<{ items: ParentContact[] }>("parent-contacts", undefined, { asAdmin }),
  parentPreview: (student: string, subject: string, body: string, asAdmin = false) => call<{ html: string; to: string; subject: string }>("parent-mail-preview", { student, subject, body }, { asAdmin }),
  parentSend: (student: string, subject: string, body: string, asAdmin = false) => call<{ ok: true; thread: string }>("parent-mail-send", { student, subject, body, confirm: true }, { asAdmin }),
  parentThreads: (sync: boolean, asAdmin = false) => call<{ items: ParentThread[]; unread: number }>("parent-threads", { sync }, { asAdmin }),
  parentThread: (thread: string, asAdmin = false) => call<{ items: ParentMsg[] }>("parent-thread", { thread }, { asAdmin }),
  parentLog: (student: string, asAdmin = false) => call<{ items: (ParentMsg & { teacherName: string })[] }>("parent-log", { student }, { asAdmin }),
  parentDelete: (thread: string) => call<{ ok: true }>("parent-delete-all", { thread }, { asAdmin: true }),
  vidAdminList: (status = "") => call<{ items: { id: string; vid: string; name: string; role: string; text: string; at: number; status: string }[]; pending: number }>("vid-admin-list", { status }, { asAdmin: true }),
  vidAdminSet: (id: string, status: "ok" | "hidden" | "delete") => call<{ ok: true }>("vid-admin-set", { id, status }, { asAdmin: true }),
  setStatus: (ids: string[], disabled: boolean, asAdmin = true) => call<{ ok: true; changed: number }>("users-status", { ids, disabled }, { asAdmin }),
  progress: (id: string, asAdmin = false) => call<{ student: LmsUser; homework: { id: string; title: string; kind: string; data: QuranData | GeneralData; due: number | null; status: string; grade: string; attempts: number; late: boolean }[]; tracker: TrackerRow[]; progress: Progress; parentLink: string }>("progress", { id }, { asAdmin }),
  quranMap: (cls = "", section = "", asAdmin = false) => call<{ rows: MapRow[]; surahs: number[] }>("quran-map", { cls, section }, { asAdmin }),
  revise: (hw: string) => call<{ ok: true; tracker: TrackerRow[] }>("revise", { hw }),
  practice: () => call<{ ok: true }>("practice", {}),
  settings: (patch?: { leaderboard: "off" | "on" | "top3" }, asAdmin = false) => call<{ leaderboard: "off" | "on" | "top3" }>("settings", patch, { asAdmin }),
  leaderboard: (cls = "", asAdmin = false) => call<{ mode: string; cls: string; list: { rank: number; name: string; stars: number; me: boolean }[] }>("leaderboard", { cls }, { asAdmin }),
  parentLink: (id: string, opts: { reset?: boolean; revoke?: boolean } = {}, asAdmin = false) => call<{ token: string }>("parent-link", { id, ...opts }, { asAdmin }),
  parent: (t: string) => call<{ name: string; cls: string; section: string; homework: { id: string; title: string; kind: string; due: number | null; status: string; grade: string; late: boolean; comments: { by: string; text: string; at: number }[] }[]; tracker: TrackerRow[]; progress: Progress }>("parent", { t }),
  saveMistakes: (id: string, mistakes: Mistake[], asAdmin = false) => call<{ ok: true }>("mistakes", { id, mistakes }, { asAdmin }),
  deleteUser: (id: string, asAdmin = true) => call<{ ok: true }>("user-delete", { id }, { asAdmin }),
  resetPin: (id: string, pin?: string, asAdmin = true) => call<{ pin: string }>("user-pin", { id, pin }, { asAdmin }),
  saveHomework: (hw: Partial<Homework>, asAdmin = false) => call<{ ok: true; id: string }>("hw-save", hw, { asAdmin }),
  deleteHomework: (id: string, asAdmin = false) => call<{ ok: true }>("hw-delete", { id }, { asAdmin }),
  homework: (id: string, asAdmin = false) =>
    call<{ homework: Homework; sub?: Submission | null; subs?: (Submission & { student: string; name: string; cls: string })[]; notStarted?: { id: string; name: string }[] }>("hw", undefined, { asAdmin, query: { id } }),
  corrected: (asAdmin = false) => call<{ items: CorrectedItem[] }>("corrected", {}, { asAdmin }),
  saveSub: (hw: string, text: string, practised: boolean, submit: boolean) => call<{ ok: true; sub: Submission }>("sub-save", { hw, text, practised, submit }),
  review: (id: string, patch: { comment?: string; like?: boolean; status?: "approved" | "returned"; grade?: Grade; scores?: { m: Level; t: Level; r: Level; notes?: { m?: string; t?: string; r?: string } } }, asAdmin = false) => call<{ ok: true }>("sub-review", { id, ...patch }, { asAdmin }),
  catalog: (asAdmin = false) => call<Catalog>("catalog", undefined, { asAdmin }),
  catalogSave: (item: { kind: "subject" | "class" | "section"; id?: string; name: string; parent?: string }) => call<Catalog & { ok: true; id: string }>("catalog-save", item, { asAdmin: true }),
  catalogDelete: (id: string, force = false) => call<Catalog & { ok: true }>("catalog-delete", { id, force }, { asAdmin: true }),
  /** Admin only: decrypted PINs (null = stored before PIN viewing existed → reset to view). */
  pinsView: (ids?: string[], asAdmin = true) => call<{ pins: Record<string, string | null> }>("pins-view", { ids }, { asAdmin }),
  loginsList: (asAdmin = false) => call<{ items: LoginCard[] }>("logins-list", undefined, { asAdmin }),
  loginTokenReset: (id: string, asAdmin = false) => call<{ token: string }>("login-token-reset", { id }, { asAdmin }),
  changePin: async (next: string) => { const r = await call<{ ok: true; token?: string; exp?: number }>("pin-change", { next }); const s = lmsSession(); if (r.token && r.exp && s) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, token: r.token, exp: r.exp })); return { ok: true as const }; },
  async qrLogin(t: string) {
    const r = await call<{ token: string; exp: number; user: LmsUser }>("qr-login", { t });
    return storeSession(r);
  },
  notes: (asAdmin = false) => call<{ items: Note[]; unread: number }>("notes", undefined, { asAdmin }),
  notesRead: (ids?: string[], asAdmin = false) => call<{ ok: true }>("notes-read", { ids }, { asAdmin }),
  adminPrefs: (p?: { quick: { tab: string; label: string; icon?: string }[]; dashIcon?: string }) => call<{ quick: { tab: string; label: string; icon?: string }[] | null; dashIcon: string }>("admin-prefs", p, { asAdmin: true }),
  classRoster: (asAdmin = false) => call<{ students: RosterStudent[]; canManage: boolean; now?: number }>("class-roster", undefined, { asAdmin }),
  pcatList: () => call<{ items: PointCat[] }>("pcat-list"),
  pcatSave: (c: Partial<PointCat>) => call<{ ok: true }>("pcat-save", c),
  pcatDelete: (id: string) => call<{ ok: true }>("pcat-delete", { id }),
  ptsAward: (cat: string, students: string[]) => call<{ ok: true; batch: string; count: number }>("pts-award", { cat, students }),
  ptsUndo: (batch?: string) => call<{ ok: true; removed: number }>("pts-undo", { batch }),
  ptsList: (q: { students?: string[]; cls?: string; section?: string; from?: number; to?: number }, asAdmin = false) => call<{ items: PointRow[] }>("pts-list", q, { asAdmin }),
  grpList: (asAdmin = false) => call<{ items: StudentGroup[] }>("grp-list", undefined, { asAdmin }),
  grpSave: (g: { id?: string; name: string; students: string[] }) => call<{ ok: true }>("grp-save", g),
  grpAssign: (teacher: string, add: string[], remove: string[]) => call<{ ok: true }>("grp-admin-assign", { teacher, add, remove }, { asAdmin: true }),
  grpDelete: (id: string, asAdmin = false) => call<{ ok: true }>("grp-delete", { id }, { asAdmin }),
  userAvatar: (id: string) => call<{ avatar: string }>("user-avatar", { id }),
  reportEmail: (id: string, kind: "points" | "quran", preview: boolean) => call<{ ok?: true; to: string; subject: string; heading: string; paragraphs: string[]; url: string }>("report-email", { id, kind, preview }),
  reportLog: () => call<{ items: { id: string; student: string; kind: string; to: string; by: string; at: number; ok: boolean }[] }>("report-log"),
  reportView: (t: string) => call<ReportView>("report", undefined, { query: { t } }),
  assessResults: () => call<{ items: { id: string; kind: string; quizTitle: string; name: string; score: number; maxScore: number; percentage: number; level?: number; label?: string; correct: number; wrong: number; finishedAt: number; rank: number | null; sessionCode: string | null }[] }>("assess-results"),
  wallClasses: () => call<{ items: WallClass[]; canPost: boolean }>("wall-classes", undefined, { asAdmin: wallAdmin }),
  /** One wall or several selected group walls merged (a post sent to several of them shows once, with all its groups). */
  wallList: (keys: string | string[]) => call<{ posts: WallPost[]; canModerate: boolean }>("wall-list", Array.isArray(keys) ? { keys } : { key: keys }, { asAdmin: wallAdmin }),
  wallMedia: (id: string, dl = false) => call<{ image: string; audio: string }>("wall-media", dl ? { id, dl: true } : { id }, { asAdmin: wallAdmin }),
  wallPost: (keys: string | string[], text: string, image?: string, audio?: string) => call<{ ok: true; count?: number }>("wall-post", { ...(Array.isArray(keys) ? { keys } : { key: keys }), text, image, audio }, { asAdmin: wallAdmin }),
  wallComment: (post: string, text: string, key?: string) => call<{ ok: true }>("wall-comment", key ? { post, text, key } : { post, text }, { asAdmin: wallAdmin }),
  wallLike: (post: string, key?: string) => call<{ ok: true }>("wall-like", key ? { post, key } : { post }, { asAdmin: wallAdmin }),
  wallMod: (op: "delete" | "pin" | "unpin" | "delcom", id: string) => call<{ ok: true }>("wall-mod", { op, id }, { asAdmin: wallAdmin }),
  actPublish: (code: string, type: string, title: string, students: string[], locked = false) => call<{ ok: true; count: number }>("act-publish", { code, type, title, students, locked }),
  actLive: () => call<{ items: LiveActivity[] }>("act-live"),
  myAssess: () => call<{ items: (ResultRecord & { level?: number; label?: string })[] }>("my-assess"),
  assessList: (asAdmin = false) => call<{ items: Assignment[] }>("assess-list", undefined, { asAdmin }),
  assessAssign: (a: { quiz: string; title: string; mode: "individual" | "group"; cls?: string; section?: string; students?: string[]; due?: number | null }, asAdmin = false) => call<{ ok: true; id: string; sent: number }>("assess-assign", a, { asAdmin }),
  assessUnassign: (id: string, asAdmin = false) => call<{ ok: true }>("assess-unassign", { id }, { asAdmin }),
  tquizList: (asAdmin = false) => call<{ items: { id: string; owner: string; ownerName: string; title: string; updated: number }[] }>("tquiz-list", undefined, { asAdmin }),
  tquizGet: (id: string, asAdmin = false) => call<{ quiz: unknown }>("tquiz-get", { id }, { asAdmin }),
  tquizSave: (quiz: unknown, asAdmin = false) => call<{ ok: true; id: string }>("tquiz-save", { quiz }, { asAdmin }),
  tquizDelete: (id: string, asAdmin = false) => call<{ ok: true }>("tquiz-delete", { id }, { asAdmin }),
  annList: (asAdmin = false) => call<{ items: Announcement[] }>("ann-list", undefined, { asAdmin }),
  annSave: (a: { title: string; body: string; aud: Announcement["aud"]; cls?: string; section?: string }) => call<{ ok: true; sent: number }>("ann-save", a, { asAdmin: true }),
  annDelete: (id: string) => call<{ ok: true }>("ann-delete", { id }, { asAdmin: true }),
  msgContacts: (asAdmin = false) => call<{ items: MsgContact[] }>("msg-contacts", undefined, { asAdmin }),
  msgThreads: (asAdmin = false) => call<{ items: MsgThread[]; unread: number }>("msg-threads", undefined, { asAdmin }),
  msgThread: (q: { thread?: string; with?: string }, asAdmin = false) => call<{ thread: string; items: Msg[] }>("msg-thread", q, { asAdmin }),
  msgSend: (to: string, body: string, asAdmin = false) => call<{ ok: true; thread: string }>("msg-send", { to, body }, { asAdmin }),
  msgDelete: (id: string) => call<{ ok: true }>("msg-delete", { id }, { asAdmin: true }),
  audioDelete: (id: string, asAdmin = false) => call<{ ok: true }>("audio-delete", { id }, { asAdmin }),
  /** Uploads a recording: student → {hw}, teacher → {sub}. Raw body, so not via call(). */
  async audioUpload(target: { hw?: string; sub?: string }, blob: Blob, asAdmin = false) {
    const tok = bearer(asAdmin);
    const q = new URLSearchParams(target as Record<string, string>).toString();
    let res: Response;
    try {
      res = await fetch(`${ASSESSMENT_API_BASE}/api/lms/audio-upload?${q}`, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: blob });
    } catch {
      throw new LmsError("network", 0);
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
    if (!res.ok) throw new LmsError(data.error || "error", res.status);
    return data as { ok: true; id: string };
  },
  /** Fetches a recording (auth header) and returns an object URL for <audio> / download. */
  async audioUrl(id: string, asAdmin = false, download = false) {
    const res = await fetch(`${ASSESSMENT_API_BASE}/api/lms/audio?id=${encodeURIComponent(id)}${download ? "&dl=1" : ""}`, { headers: authHeaders(asAdmin) }).catch(() => null);
    if (!res?.ok) throw new LmsError(res ? (res.status === 403 ? "download_not_allowed" : "not_found") : "network", res?.status || 0);
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), type: blob.type };
  },
  exportAll: (asAdmin = false) => call<{ exportedAt: number; homework: Homework[]; subs: (Submission & { hw: string; student: string })[]; users: { id: string; username: string; name: string; role: string; cls: string }[]; tracker: (TrackerRow & { student: string; hw: string })[] }>("export", undefined, { asAdmin }),
};

export function lmsErrorText(e: unknown, tr: (en: string, ar: string) => string): string {
  const c = e instanceof LmsError ? e.code : "";
  if (c === "topic_taken") { const ex = (e as LmsError).data?.existing as { title?: string; slug?: string } | undefined; const t = ex?.title || ex?.slug || ""; return tr(`This curriculum topic already has an assessment: “${t}”. Only one assessment per topic.`, `هذا الموضوع له تقييم بالفعل: «${t}». لكل موضوع تقييم واحد فقط.`); }
  const m: Record<string, [string, string]> = {
    topic_required: ["Choose the curriculum topic first — every assessment must be linked to one.", "اختر موضوع المنهج أولًا — يجب ربط كل تقييم بموضوع."],
    topic_unknown: ["That curriculum topic no longer exists. Choose another.", "موضوع المنهج هذا لم يعد موجودًا. اختر موضوعًا آخر."],
    one_assessment_per_topic: ["A topic can have only one assessment.", "لكل موضوع تقييم واحد فقط."],
    download_not_allowed: ["Downloads are switched off for your account.", "التنزيل غير مفعّل لحسابك."],
    confirm_required: ["Please preview and confirm before sending.", "يرجى المعاينة والتأكيد قبل الإرسال."],
    mail_error: ["The email could not be sent. Try again later.", "تعذّر إرسال البريد. حاول لاحقًا."],
    no_add_permission: ["You don't have permission to add students.", "ليست لديك صلاحية إضافة الطلاب."],
    no_edit_permission: ["You don't have permission to edit students.", "ليست لديك صلاحية تعديل الطلاب."],
    no_parent_email: ["No parent email on file for this student. Ask the admin to add one.", "لا يوجد بريد لولي الأمر. اطلب من المسؤول إضافته."],
    mail_failed: ["The email could not be sent. Try again later.", "تعذّر إرسال البريد. حاول لاحقًا."],
    nothing_to_undo: ["Nothing to undo.", "لا شيء للتراجع عنه."],
    slow_down: ["Slow down a little.", "تمهّل قليلًا."],
    bad_media: ["That picture or recording is too large.", "الصورة أو التسجيل كبير جدًا."],
    empty: ["Write something first.", "اكتب شيئًا أولًا."],
    not_your_class: ["That student is not in your classes.", "هذا الطالب ليس في صفوفك."],
    bad_login: ["Wrong username or PIN.", "اسم المستخدم أو الرقم السري غير صحيح."],
    locked: ["Finish the earlier verses first — this unlocks when your teacher passes them.", "أكمل الآيات السابقة أولًا — تُفتح عندما يجتازها معلمك."],
    leaderboard_off: ["The leaderboard is turned off.", "لوحة المتصدرين متوقفة."],
    blocked: ["Your account is blocked. Please contact your teacher.", "حسابك موقوف. يرجى التواصل مع معلمك."],
    too_many_attempts: ["Too many tries — wait 15 minutes and try again.", "محاولات كثيرة — انتظر 15 دقيقة ثم حاول."],
    unauthorized: ["Please sign in again.", "يرجى تسجيل الدخول مجددًا."],
    forbidden: ["You don't have permission for that.", "ليست لديك صلاحية لذلك."],
    network: ["No connection — try again.", "لا يوجد اتصال — حاول مرة أخرى."],
    verses: ["Check the surah and verse range.", "تحقق من السورة ونطاق الآيات."],
    title: ["Add a title.", "أضف عنوانًا."],
    unknown_class: ["Pick a class from the list (Classes & Subjects).", "اختر صفًا من القائمة (الصفوف والمواد)."],
    unknown_section: ["That section isn't in this class.", "هذه الشعبة ليست في هذا الصف."],
    unknown_subject: ["Pick subjects from the list.", "اختر المواد من القائمة."],
    unknown_scope: ["Pick classes/sections from the list.", "اختر الصفوف/الشعب من القائمة."],
    out_of_scope: ["You can only assign to your own classes/sections.", "يمكنك الإسناد لصفوفك وشعبك فقط."],
    in_use: ["Still in use — move the students/teachers/homework first.", "ما زال مستخدمًا — انقل الطلاب/المعلمين/الواجبات أولًا."],
    duplicate: ["That name already exists.", "هذا الاسم موجود."],
    admin_only: ["Only the admin can do that.", "فقط المدير يمكنه ذلك."],
    pin_key_missing: ["PIN viewing isn't set up on the server.", "عرض الرقم السري غير مُعدّ على الخادم."],
    audio_too_long: ["That recording is too long (max 3 minutes).", "التسجيل طويل جدًا (3 دقائق كحد أقصى)."],
    audio_user_full: ["Recording space for this account is full.", "مساحة التسجيل لهذا الحساب ممتلئة."],
    audio_full: ["Recording storage is full — ask the admin.", "مساحة التسجيلات ممتلئة — أخبر المدير."],
    audio_type: ["This browser's recording format isn't supported.", "صيغة التسجيل في هذا المتصفح غير مدعومة."],
    already_approved: ["Your teacher has already approved this.", "وافق المعلم على هذا مسبقًا."],
  };
  return m[c] ? tr(m[c][0], m[c][1]) : tr("Something went wrong.", "حدث خطأ ما.");
}

/* ---------- Quran (api.quran.com text, everyayah.com audio) ---------- */
export type Chapter = { id: number; name_simple: string; name_arabic: string; verses_count: number };
let chaptersCache: Promise<Chapter[]> | null = null;
export function quranChapters(): Promise<Chapter[]> {
  chaptersCache ??= fetch("https://api.quran.com/api/v4/chapters?language=en")
    .then((r) => r.json())
    .then((d: { chapters: Chapter[] }) => d.chapters)
    .catch(() => {
      chaptersCache = null;
      return [];
    });
  return chaptersCache;
}
export async function quranVerses(surah: number, from: number, to: number): Promise<{ n: number; text: string }[]> {
  const out: { n: number; text: string }[] = [];
  for (let page = Math.floor((from - 1) / 50) + 1; page <= Math.floor((to - 1) / 50) + 1; page++) {
    const r = await fetch(`https://api.quran.com/api/v4/verses/by_chapter/${surah}?fields=text_uthmani&per_page=50&page=${page}`);
    const d = (await r.json()) as { verses: { verse_number: number; text_uthmani: string }[] };
    for (const v of d.verses) if (v.verse_number >= from && v.verse_number <= to) out.push({ n: v.verse_number, text: v.text_uthmani });
  }
  return out;
}
/** Transliteration (en.transliteration) and a translation (Sahih International in English, Tafsir al-Muyassar in Arabic) from api.alquran.cloud. */
const extrasCache = new Map<string, Promise<Map<number, { translit: string; translation: string }>>>();
export function quranExtras(surah: number, from: number, to: number, lang: "en" | "ar") {
  const ed = lang === "ar" ? "ar.muyassar" : "en.sahih";
  const key = `${surah}:${lang}`;
  if (!extrasCache.has(key)) {
    extrasCache.set(key, fetch(`https://api.alquran.cloud/v1/surah/${surah}/editions/en.transliteration,${ed}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((j: { data: { ayahs: { numberInSurah: number; text: string }[] }[] }) => {
        const m = new Map<number, { translit: string; translation: string }>();
        j.data[0].ayahs.forEach((a, i) => m.set(a.numberInSurah, { translit: a.text, translation: j.data[1]?.ayahs[i]?.text || "" }));
        return m;
      })
      .catch((e) => { extrasCache.delete(key); throw e; }));
  }
  return extrasCache.get(key)!.then((m) => new Map([...m].filter(([n]) => n >= from && n <= to)));
}

export const ayahAudio = (reciter: string, surah: number, ayah: number) => `https://everyayah.com/data/${reciter || "Alafasy_128kbps"}/${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;
export const RECITERS = [
  ["Alafasy_128kbps", "Mishary Alafasy"],
  ["Husary_128kbps", "Mahmoud Al-Husary"],
  ["Minshawy_Murattal_128kbps", "Al-Minshawi (Murattal)"],
  ["Abdul_Basit_Murattal_192kbps", "Abdul Basit (Murattal)"],
  ["Husary_Muallim_128kbps", "Al-Husary (Teacher / repeat)"],
] as const;

export const homeworkUrl = (id: string) => `${typeof window !== "undefined" ? window.location.origin : "https://www.shaiqmuhammad.com"}/lms/homework?id=${encodeURIComponent(id)}`;

/** Group name with its subject, for pickers and tabs. */
export const grpLabel = (g: { name: string; subject?: string }) => (g.subject ? `${g.name} · ${g.subject}` : g.name);
