"use client";

import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { lmsSession, LmsError } from "@/lib/lms";
import { getServerSession } from "@/lib/adminServer";
import { modCall } from "@/lib/lmsMods";

/** t315: Lesson Packs — white slides with elements. Positions/sizes are % of a 16:9 slide; text size is px on a 1600-wide slide. */
export type ElText = { t: "text"; text: string; html?: string; color: string; bg?: string; font: string; size: number; bold?: boolean; italic?: boolean; align?: "start" | "center" | "end" };
export type ElImg = { t: "img"; src: string; rot?: number; crop?: { l: number; t: number; r: number; b: number } };
export type ElAudio = { t: "audio"; src: string };
export type ElVideo = { t: "video"; src: string };
export type ElDraw = { t: "draw"; paths: { c: string; w: number; d: number[] }[] };
export type ElYt = { t: "yt"; vid: string; title?: string };
export type ElAct = { t: "act"; code?: string; quiz?: string; label?: string };
export type ElDoc = { t: "doc"; src: string; kind: "pptx" | "pdf"; name?: string; rot?: number; crop?: { l: number; t: number; r: number; b: number } };
export type ElQuran = { t: "quran"; surah: number; from: number; to: number; reciter?: string; memorise?: boolean; memoAudio?: boolean; translit?: boolean; translation?: boolean; notes?: string };
export type El = { id: string; x: number; y: number; w: number; h: number; by?: "t" | "s"; /** t429: teacher lock — can't be moved or deleted until unlocked */ lock?: boolean; rot?: number; crop?: { l: number; t: number; r: number; b: number } } & (ElText | ElImg | ElAudio | ElVideo | ElDraw | ElYt | ElAct | ElQuran | ElDoc);
/** "quran" (t646): a Quran Homework slide — assigned as its own Quran homework when the pack is assigned. */
export type Part = "lesson" | "activity" | "homework" | "quran";
/** t429: part (lesson / activity / homework), timer seconds, instructions for students (+ recorded audio id). */
export type Slide = { id: string; bg: string; els: El[]; part?: Part; timer?: number; instr?: string; instrAudio?: string; rot?: number };
export const PART_LABEL: Record<Part, [string, string, string, string]> = { lesson: ["🎤", "Lesson", "درس", "bg-[#1b3a57] text-[#f5c542]"], activity: ["✏️", "Task", "مهمة", "bg-violet-600 text-white"], homework: ["📝", "Homework", "واجب", "bg-amber-500 text-[#1b2f44]"], quran: ["📖", "Quran Homework", "واجب القرآن", "bg-emerald-700 text-white"] };
export const PARTS: Part[] = ["lesson", "activity", "homework"];
/** t646: the slide types a teacher can choose. A slide with no type stays a normal lesson slide. */
export const SLIDE_PARTS: Part[] = ["activity", "homework", "quran"];
/** t646: "Activity" is called "Task" everywhere (teachers and students). The stored value stays "activity". */
export function partText(part: Part, student: boolean): [string, string] {
  void student;
  return [PART_LABEL[part][1], PART_LABEL[part][2]];
}
/** A slide with no type follows the pack, so older packs still open on one page. */
export function slideKind(s: { part?: string }, packType?: string): Part | "" {
  if (s.part === "lesson" || s.part === "activity" || s.part === "homework" || s.part === "quran") return s.part;
  if (packType === "lesson" || packType === "activity" || packType === "homework") return packType;
  return "";
}
/** Which pages an assigned pack belongs on. Explicit slide types win; otherwise the pack type. */
export function packParts(p: { type?: string; parts?: string[]; slides?: { part?: string }[] }): Part[] {
  const marked = (p.slides || []).map((s) => s.part).filter((x): x is Part => x === "lesson" || x === "activity" || x === "homework");
  const given = (p.parts || []).filter((x): x is Part => x === "lesson" || x === "activity" || x === "homework");
  const raw = given.length ? given : marked;
  const uniq = PARTS.filter((k) => raw.includes(k));
  if (uniq.length) return uniq;
  return p.type === "lesson" || p.type === "activity" || p.type === "homework" ? [p.type] : [];
}
/** Whether a pack can be opened as this classroom content type (list rows may only have type/parts). */
export function packHasPart(p: { type?: string; parts?: string[]; slides?: { part?: string }[] }, part: Part): boolean {
  if (p.type === part) return true;
  if ((p.parts || []).includes(part)) return true;
  if ((p.slides || []).some((s) => s.part === part)) return true;
  if (part === "lesson" && !p.type && !(p.parts || []).length && !(p.slides || []).some((s) => s.part)) return true;
  return false;
}
export function firstSlideOf(slides: { part?: string }[] | undefined, part: Part, packType?: string): number {
  const i = (slides || []).findIndex((s) => slideKind(s, packType) === part);
  return i >= 0 ? i : 0;
}

/** Pages a homework row belongs on. `parts` is copied from the slides when the pack is assigned. */
export function hwParts(data: { activity?: boolean; parts?: unknown } | null | undefined, kind?: string): Part[] {
  // t650: lesson slides are never assigned to students, so a row's "lesson" page is ignored (old rows keep their other pages).
  const list = Array.isArray(data?.parts) ? data.parts.filter((x): x is Part => x === "activity" || x === "homework") : [];
  const uniq = PARTS.filter((k) => list.includes(k));
  if (uniq.length) return uniq;
  if (data?.activity) return ["activity"];
  if (kind === "quran" || kind === "general") return ["homework"];
  return [];
}
export const TIMERS = [0, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600];
export const fmtT = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`);
export type PackType = "lesson" | "activity" | "homework" | "quran" | "material";
export type Topic = { cur?: string; title?: string; yr?: string; term?: string; std?: string[]; /** t429 SOW panel */ lo?: string; sc?: string[]; kw?: string; stdText?: string; /** pack timer, seconds */ timer?: number; /** 0 unlimited, 1 one attempt, n a chosen cap */ tries?: number };
export type Pack = { id: string; owner: string; ownerName: string; title: string; type: PackType; subject: string; aud: string[]; students: string[]; topic: Topic; mode: "self" | "live"; assignAt: number; due: number; status: "draft" | "published"; hw: string; live: number; tpl: boolean; created: number; updated: number; slides?: Slide[]; count?: number; /** slide types present, so lists can open the matching page without the full deck */ parts?: Part[]; /** t422 */ years?: string[]; sections?: string[]; /** student list: submission status for the linked homework, if any */ subStatus?: string };
export type Acc = { show: boolean; view: boolean; add: boolean; edit: boolean; delete: boolean };
export type Progress = { student: string; seen: number; total: number; updated: number; status: string };
export const FONTS = ["Nunito", "Arial", "Georgia", "Times New Roman", "Courier New", "Comic Sans MS", "Amiri", "Tajawal", "Verdana"];
export const TYPE_LABEL: Record<PackType, [string, string, string]> = { lesson: ["🎤", "Lesson", "درس"], activity: ["✏️", "Task", "مهمة"], homework: ["📝", "Homework", "واجب"], quran: ["🎙️", "Quran Homework", "واجب القرآن"], material: ["📚", "Library material", "مادة المكتبة"] };
/** t429: product name + icon (user-facing; the route stays /lms/material). */
export const LB_EN = "Lesson Builder", LB_AR = "منشئ الدروس", LB_ICON = "📑";
/** t389: public link for an uploaded PowerPoint / PDF (rendered by the free Office / browser viewer). */
export const docUrl = (id: string) => `${ASSESSMENT_API_BASE}/api/lms/lp-doc?id=${encodeURIComponent(id)}`;
export const docViewer = (id: string, kind: "pptx" | "pdf") => (kind === "pdf" ? docUrl(id) : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(docUrl(id))}`);
export const uid = (p = "e") => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const blankSlide = (): Slide => ({ id: uid("s"), bg: "#ffffff", els: [] });

export const lp = {
  access: (asAdmin: boolean) => modCall<{ acc: Acc; staff: boolean }>("lp-access", {}, asAdmin),
  list: (asAdmin: boolean) => modCall<{ items: Pack[]; acc?: Acc }>("lp-list", {}, asAdmin),
  get: (id: string, asAdmin: boolean) => modCall<{ pack: Pack; acc?: Acc; work?: Slide[]; sub?: { status: string } | null }>("lp-get", { id }, asAdmin),
  save: (p: Partial<Pack>, asAdmin: boolean) => modCall<{ ok: true; pack: Pack }>("lp-save", p, asAdmin),
  publish: (id: string, off: boolean, asAdmin: boolean) => modCall<{ ok: true; pack: Pack }>("lp-publish", { id, off }, asAdmin),
  dup: (id: string, asAdmin: boolean) => modCall<{ ok: true; id: string }>("lp-dup", { id }, asAdmin),
  del: (id: string, asAdmin: boolean) => modCall<{ ok: true }>("lp-delete", { id }, asAdmin),
  live: (id: string, slide: number, off: boolean, asAdmin: boolean) => modCall<{ ok: true; live?: number }>("lp-live", { id, slide, off }, asAdmin),
  workSave: (id: string, slides: Slide[], seen: number[]) => modCall<{ ok: true }>("lp-work-save", { id, slides, seen }, false),
  work: (id: string, student: string | undefined, asAdmin: boolean) => modCall<{ pack?: Pack; work?: Slide[]; progress?: Progress[] }>("lp-work", { id, student }, asAdmin),
};

const bearer = (asAdmin: boolean) => (asAdmin ? getServerSession()?.token : lmsSession()?.token) || "";
/** Upload a picture/recording (raw body). Pictures are shrunk to max 1600px JPEG first. */
export async function mediaUpload(file: Blob, asAdmin: boolean): Promise<string> {
  let body: Blob = file;
  if (/^image\/(png|jpeg|webp)$/.test(file.type) && file.size > 300_000) body = await shrink(file);
  const res = await fetch(`${ASSESSMENT_API_BASE}/api/lms/lp-media-upload`, { method: "POST", headers: { "Content-Type": body.type || "application/octet-stream", Authorization: `Bearer ${bearer(asAdmin)}` }, body }).catch(() => null);
  if (!res) throw new LmsError("network", 0);
  const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !j.id) throw new LmsError(j.error || "error", res.status);
  return j.id;
}
async function shrink(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b || file), "image/jpeg", 0.85));
}
const cache = new Map<string, Promise<string>>();
/** Object URL for a media id (fetched with the sign-in token; cached for the page). */
export function mediaUrl(id: string, asAdmin: boolean): Promise<string> {
  if (!cache.has(id)) cache.set(id, fetch(`${ASSESSMENT_API_BASE}/api/lms/lp-media?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${bearer(asAdmin)}` } }).then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return URL.createObjectURL(await r.blob()); }));
  return cache.get(id)!;
}
/** YouTube id from a pasted link or id. */
export function ytId(s: string): string {
  const t = s.trim();
  const m = t.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(t) ? t : "";
}
