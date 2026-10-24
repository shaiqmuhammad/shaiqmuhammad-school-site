"use client";

import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { lmsSession, LmsError } from "@/lib/lms";
import { getServerSession } from "@/lib/adminServer";
import { modCall } from "@/lib/lmsMods";

/** t315: Lesson Packs — white slides with elements. Positions/sizes are % of a 16:9 slide; text size is px on a 1600-wide slide. */
export type ElText = { t: "text"; text: string; color: string; bg?: string; font: string; size: number; bold?: boolean; italic?: boolean; align?: "start" | "center" | "end" };
export type ElImg = { t: "img"; src: string };
export type ElAudio = { t: "audio"; src: string };
export type ElDraw = { t: "draw"; paths: { c: string; w: number; d: number[] }[] };
export type ElYt = { t: "yt"; vid: string; title?: string };
export type ElAct = { t: "act"; code?: string; quiz?: string; label?: string };
export type ElQuran = { t: "quran"; surah: number; from: number; to: number; reciter?: string; memorise?: boolean; memoAudio?: boolean; translit?: boolean; translation?: boolean; notes?: string };
export type El = { id: string; x: number; y: number; w: number; h: number; by?: "t" | "s" } & (ElText | ElImg | ElAudio | ElDraw | ElYt | ElAct | ElQuran);
export type Slide = { id: string; bg: string; els: El[] };
export type PackType = "material" | "homework" | "quran";
export type Topic = { cur?: string; title?: string; yr?: string; term?: string; std?: string[] };
export type Pack = { id: string; owner: string; ownerName: string; title: string; type: PackType; subject: string; aud: string[]; students: string[]; topic: Topic; mode: "self" | "live"; assignAt: number; due: number; status: "draft" | "published"; hw: string; live: number; tpl: boolean; created: number; updated: number; slides?: Slide[]; count?: number };
export type Acc = { show: boolean; view: boolean; add: boolean; edit: boolean; delete: boolean };
export type Progress = { student: string; seen: number; total: number; updated: number; status: string };
export const FONTS = ["Nunito", "Arial", "Georgia", "Times New Roman", "Courier New", "Comic Sans MS", "Amiri", "Tajawal", "Verdana"];
export const TYPE_LABEL: Record<PackType, [string, string, string]> = { material: ["📚", "Learning Material", "مادة تعليمية"], homework: ["📝", "Homework", "واجب"], quran: ["📖", "Quran Homework", "واجب القرآن"] };
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
