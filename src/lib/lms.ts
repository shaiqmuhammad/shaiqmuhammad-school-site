"use client";

import { getServerSession } from "@/lib/adminServer";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";

/** LMS phase 1 client (see workers/assessment-session/src/lms.ts). */
export type Role = "student" | "teacher";
export type LmsUser = { id: string; username: string; name: string; role: Role; cls: string; section: string; subjects: string[]; scope: string[]; perms: string[]; disabled: boolean; hasPin: boolean; email?: string; created: number; lastLogin: number | null };
export type Catalog = { subjects: { id: string; name: string }[]; classes: { id: string; name: string }[]; sections: { id: string; name: string; classId: string; cls: string }[] };
export type DashStudent = { id: string; name: string; cls: string; section: string };
/** Teacher scope entry: "Year 2" (whole class) or "Year 2|2A" (one section). */
export const scopeLabel = (s: string) => s.replace("|", " · ");
export type Actor = { id: string; role: Role | "admin"; name: string; cls: string; perms: string[]; viewAs?: boolean };
export type Slide = { title: string; text: string; image: string };
export type QuranData = { surah: number; from: number; to: number; reciter: string; notes: string; translit?: boolean; translation?: boolean };
export type GeneralData = { slides: Slide[]; question: string };
export type Homework = { id: string; kind: "quran" | "general"; title: string; cls: string; section?: string; students: string[]; data: QuranData | GeneralData; due: number | null; createdBy: string; created: number; locked?: boolean; lockedBy?: { surah: number; from: number; to: number; title: string } | null; late?: boolean };
export type Comment = { by: string; text: string; at: number; audio?: string };
export type Announcement = { id: string; title: string; body: string; aud: "all" | "students" | "teachers" | "class"; cls: string; section: string; by: string; created: number };
export type MsgContact = { id: string; name: string; role: string; cls: string };
export type MsgThread = { thread: string; with: string; withName: string; people: string[]; mine: boolean; last: number; preview: string; unread: number };
export type Msg = { id: string; sender: string; body: string; created: number; mine: boolean };
export type Note = { id: string; kind: "hw_new" | "sub_new" | "feedback" | "feedback_audio" | "approved" | "returned" | "graded" | "reminder" | "revise" | "mistakes" | "announcement" | "message"; data: { hw?: string; title?: string; by?: string; student?: string; grade?: Grade; overdue?: boolean; count?: number; surah?: number }; created: number; read: boolean };
export type Level = 1 | 2 | 3;
/** Makharij / Tajweed / Recitation levels (1 Needs practice · 2 Good · 3 Excellent) + generated feedback. */
export type Scores = { m: Level; t: Level; r: Level; notes?: { m?: string; t?: string; r?: string }; fb?: { en: string; ar: string } };
export type Submission = { id: string; status: "draft" | "submitted" | "approved" | "returned"; text: string; practised: boolean; liked: boolean; comments: Comment[]; audio?: string; grade?: Grade | ""; scores?: Scores | null; attempts?: Attempt[]; mistakes?: Mistake[]; submittedAt?: number; updated: number };
export type Grade = "green" | "yellow" | "red";
export type Attempt = { n: number; audio: string; grade: Grade; by: string; at: number; scores?: Scores };
export type TrackerRow = { surah: number; from: number; to: number; approved: number; grade?: Grade; hw?: string; revCount?: number; revDue?: number; scores?: Scores | null };
export type Progress = { stars: number; streak: number; greens: number; yellows: number; handed: number; badges: string[]; activeDays: number };
export type Mistake = { ayah: number; word: number; text: string; note: string };
export type MapRow = { id: string; name: string; cls: string; section: string; cells: Record<number, { grade: string; verses: number }> };

export const PERMS = ["assign", "review", "manageUsers", "viewAll"] as const;

export class LmsError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

const SESSION_KEY = "sm_lms_session_v1";
type Session = { token: string; exp: number; user: Actor };

export function lmsSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as Session | null;
    if (s?.token && s.exp > Date.now()) return s;
  } catch {
    // ignore
  }
  return null;
}
export function lmsSignOut() {
  localStorage.removeItem(SESSION_KEY);
}

/** Admin read-only "view as" (this browser tab only; never touches the user's real LMS session). */
export type QrLink = { student: string; name: string; cls: string; section: string; token: string };
export type QrView = { student: string; cls: string; section: string; homework: { title: string; kind: "quran" | "general"; data: Partial<QuranData> }; status: string; grade: Grade | ""; scores?: Scores | null; recordings: string[]; attempts: { n: number; grade: Grade; audio: string; at: number; scores?: Scores }[]; feedback: { by: string; text: string; audio: string; at: number }[]; tracker: TrackerRow[] };
export type ViewAs = { id: string; name: string; role: "student" | "teacher"; cls: string };
export function viewAs(): ViewAs | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(sessionStorage.getItem("sm_view_as") || "null") as ViewAs | null;
    return v && getServerSession() ? v : null;
  } catch {
    return null;
  }
}
export function exitViewAs() {
  try { sessionStorage.removeItem("sm_view_as"); } catch { /* ignore */ }
}
function authHeaders(asAdmin = false): Record<string, string> {
  const va = !asAdmin ? viewAs() : null;
  if (va) return { Authorization: `Bearer ${getServerSession()!.token}`, "X-View-As": va.id };
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
  if (!res.ok) throw new LmsError(data.error || "error", res.status);
  return data;
}

export const lmsApi = {
  hwLocks: (hw: string, opts: { student?: string; unlock?: boolean } = {}, asAdmin = false) => (opts.student ? call<{ locks: { student: string; name: string; section: string; lockedBy: Homework["lockedBy"]; unlocked: boolean }[] }>("hw-unlock", { hw, ...opts }, { asAdmin }) : call<{ locks: { student: string; name: string; section: string; lockedBy: Homework["lockedBy"]; unlocked: boolean }[] }>("hw-unlock", undefined, { asAdmin, query: { hw } })),
  qrLinks: (hw: string, opts: { student?: string; reset?: boolean; revoke?: boolean } = {}, asAdmin = false) => (opts.student ? call<{ links: QrLink[]; teacher: string }>("qr-links", { hw, ...opts }, { asAdmin }) : call<{ links: QrLink[]; teacher: string }>("qr-links", undefined, { asAdmin, query: { hw } })),
  qrView: (t: string) => call<QrView>("qr", undefined, { query: { t } }),
  qrAudioUrl: (t: string, id: string) => `${ASSESSMENT_API_BASE}/api/lms/qr-audio?t=${encodeURIComponent(t)}&id=${encodeURIComponent(id)}`,
  viewAsLog: () => call<{ items: { uid: string; name: string; role: string; at: number }[] }>("viewas-log", undefined, { asAdmin: true }),
  async login(username: string, pin: string) {
    const r = await call<{ token: string; exp: number; user: LmsUser }>("login", { username, pin });
    const s: Session = { token: r.token, exp: r.exp, user: { id: r.user.id, role: r.user.role, name: r.user.name, cls: r.user.cls, perms: r.user.perms } };
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    localStorage.setItem("sm_lms_login_at", String(Date.now()));
    return s;
  },
  me: () => call<{ user: Actor }>("me"),
  dashboard: (asAdmin = false) =>
    call<{ homework: (Homework & { sub?: Submission | null; counts?: Record<string, number>; assigned?: number })[]; tracker?: TrackerRow[]; progress?: Progress; leaderboard?: boolean; classes?: { cls: string; students: number }[]; students?: DashStudent[]; catalog?: Catalog; scope?: string[] }>("dashboard", undefined, { asAdmin }),
  users: (asAdmin = true) => call<{ users: LmsUser[] }>("users", undefined, { asAdmin }),
  saveUsers: (users: Partial<LmsUser & { pin: string }>[], asAdmin = true) => call<{ saved: number; pins: { username: string; name: string; pin: string }[]; errors: { row: number; username: string; error: string }[] }>("users", { users }, { asAdmin }),
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
  saveSub: (hw: string, text: string, practised: boolean, submit: boolean) => call<{ ok: true; sub: Submission }>("sub-save", { hw, text, practised, submit }),
  review: (id: string, patch: { comment?: string; like?: boolean; status?: "approved" | "returned"; grade?: Grade; scores?: { m: Level; t: Level; r: Level; notes?: { m?: string; t?: string; r?: string } } }, asAdmin = false) => call<{ ok: true }>("sub-review", { id, ...patch }, { asAdmin }),
  catalog: (asAdmin = false) => call<Catalog>("catalog", undefined, { asAdmin }),
  catalogSave: (item: { kind: "subject" | "class" | "section"; id?: string; name: string; parent?: string }) => call<Catalog & { ok: true; id: string }>("catalog-save", item, { asAdmin: true }),
  catalogDelete: (id: string) => call<Catalog & { ok: true }>("catalog-delete", { id }, { asAdmin: true }),
  /** Admin only: decrypted PINs (null = stored before PIN viewing existed → reset to view). */
  pinsView: (ids?: string[]) => call<{ pins: Record<string, string | null> }>("pins-view", { ids }, { asAdmin: true }),
  notes: (asAdmin = false) => call<{ items: Note[]; unread: number }>("notes", undefined, { asAdmin }),
  notesRead: (ids?: string[], asAdmin = false) => call<{ ok: true }>("notes-read", { ids }, { asAdmin }),
  adminPrefs: (p?: { quick: { tab: string; label: string; icon?: string }[]; dashIcon?: string }) => call<{ quick: { tab: string; label: string; icon?: string }[] | null; dashIcon: string }>("admin-prefs", p, { asAdmin: true }),
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
  async audioUrl(id: string, asAdmin = false) {
    const res = await fetch(`${ASSESSMENT_API_BASE}/api/lms/audio?id=${encodeURIComponent(id)}`, { headers: authHeaders(asAdmin) }).catch(() => null);
    if (!res?.ok) throw new LmsError(res ? "not_found" : "network", res?.status || 0);
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), type: blob.type };
  },
  exportAll: (asAdmin = false) => call<{ exportedAt: number; homework: Homework[]; subs: (Submission & { hw: string; student: string })[]; users: { id: string; username: string; name: string; role: string; cls: string }[]; tracker: (TrackerRow & { student: string; hw: string })[] }>("export", undefined, { asAdmin }),
};

export function lmsErrorText(e: unknown, tr: (en: string, ar: string) => string): string {
  const c = e instanceof LmsError ? e.code : "";
  const m: Record<string, [string, string]> = {
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
