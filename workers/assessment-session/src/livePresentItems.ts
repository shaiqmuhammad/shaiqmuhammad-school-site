export type LivePresentItemKind = "lesson" | "task" | "activity" | "homework" | "quran" | "upload" | "youtube" | "board";

export const LIVE_PRESENT_ITEM_KINDS: LivePresentItemKind[] = ["lesson", "task", "activity", "homework", "quran", "upload", "youtube", "board"];

export type PresentStroke = { c: string; w: number; d: number[]; by: string };

export type LivePresentItem = {
  id: string;
  kind: LivePresentItemKind;
  title: string;
  packId: string;
  slide: number;
  strokes: PresentStroke[];
  src?: string;
};

export type PresentItemsState = {
  packId: string;
  packTitle: string;
  slide: number;
  strokes: PresentStroke[];
  items?: LivePresentItem[];
  activeId?: string;
  src?: string;
};

const KIND_SET = new Set<string>(LIVE_PRESENT_ITEM_KINDS);

export function youtubeVideoId(raw: string): string {
  const s = String(raw || "").trim();
  const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|[?&]v=)([\w-]{11})/) || s.match(/^([\w-]{11})$/);
  return m ? m[1] : "";
}

export function presentItemId(kind: LivePresentItemKind, packId: string, src = ""): string {
  if (kind === "board") return "board";
  if (kind === "youtube") return `youtube:${src}`;
  if (kind === "upload") return `upload:${packId || src}`;
  return `${kind}:${packId}`;
}

export function asPresentKind(v: unknown, packId = "", src = ""): LivePresentItemKind {
  const k = String(v || "");
  if (KIND_SET.has(k)) return k as LivePresentItemKind;
  if (src || youtubeVideoId(packId)) return "youtube";
  return packId ? "lesson" : "board";
}

export function boardPresentItem(): LivePresentItem {
  return { id: "board", kind: "board", title: "Whiteboard", packId: "", slide: 0, strokes: [], src: "" };
}

function clampSlide(n: unknown): number {
  return Math.max(0, Math.min(59, Math.trunc(Number(n) || 0)));
}

function normalizeItem(raw: Partial<LivePresentItem> | null | undefined): LivePresentItem | null {
  if (!raw) return null;
  const src = String(raw.src || "").trim().slice(0, 80);
  const packId = String(raw.packId || "").trim().slice(0, 40);
  const kind = asPresentKind(raw.kind, packId, src);
  const id = String(raw.id || presentItemId(kind, packId, src)).slice(0, 80);
  if (!id) return null;
  return {
    id,
    kind,
    title: String(raw.title || (kind === "youtube" ? "YouTube" : kind === "board" ? "Whiteboard" : "Lesson")).trim().slice(0, 80),
    packId,
    slide: clampSlide(raw.slide),
    strokes: Array.isArray(raw.strokes) ? raw.strokes.slice(-200) : [],
    src,
  };
}

export function normalizePresentItems(p: PresentItemsState): LivePresentItem[] {
  let items = Array.isArray(p.items) ? p.items.map((x) => normalizeItem(x)).filter((x): x is LivePresentItem => !!x) : [];
  if (!items.length) {
    items = [boardPresentItem()];
    if (p.packId || p.src) {
      const src = String(p.src || "").trim();
      const kind = asPresentKind(undefined, p.packId, src);
      const id = presentItemId(kind, p.packId, src);
      items.push({
        id,
        kind,
        title: p.packTitle || (kind === "youtube" ? "YouTube" : "Lesson"),
        packId: p.packId || "",
        slide: clampSlide(p.slide),
        strokes: Array.isArray(p.strokes) ? p.strokes.slice(-200) : [],
        src,
      });
    } else if (Array.isArray(p.strokes) && p.strokes.length) {
      items[0].strokes = p.strokes.slice(-200);
    }
  }
  if (!items.some((i) => i.id === "board")) items = [boardPresentItem(), ...items];
  const seen = new Set<string>();
  items = items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true))).slice(0, 12);
  p.items = items;
  if (!items.some((i) => i.id === p.activeId)) {
    p.activeId = (p.packId || p.src) ? (items.find((i) => i.id !== "board")?.id || "board") : "board";
  }
  return items;
}

export function stashActivePresentItem(p: PresentItemsState): void {
  const items = normalizePresentItems(p);
  const it = items.find((i) => i.id === p.activeId);
  if (!it) return;
  it.slide = clampSlide(p.slide);
  it.strokes = Array.isArray(p.strokes) ? p.strokes : [];
  if (p.packId) it.packId = p.packId;
  if (p.packTitle) it.title = p.packTitle;
  if (p.src) it.src = p.src;
}

export function applyActivePresentItem(p: PresentItemsState): void {
  const items = normalizePresentItems(p);
  const it = items.find((i) => i.id === p.activeId) || items[0];
  p.activeId = it.id;
  p.packId = it.packId;
  p.packTitle = it.title;
  p.slide = it.slide;
  p.strokes = it.strokes;
  p.src = it.src || "";
}

export function openPresentItem(p: PresentItemsState, start: { packId?: string; packTitle?: string; kind?: string; src?: string; slide?: number }): LivePresentItem {
  stashActivePresentItem(p);
  const src = String(start.src || "").trim().slice(0, 80);
  const packId = String(start.packId || "").trim().slice(0, 40);
  const kind = asPresentKind(start.kind, packId, src);
  const id = presentItemId(kind, packId, src);
  const title = String(start.packTitle || (kind === "youtube" ? "YouTube" : kind === "board" ? "Whiteboard" : "Lesson")).trim().slice(0, 80);
  const existing = (p.items || []).find((i) => i.id === id);
  if (existing) {
    p.activeId = existing.id;
    if (title) existing.title = title;
    if (typeof start.slide === "number") existing.slide = clampSlide(start.slide);
  } else if (kind === "board") {
    p.activeId = "board";
  } else {
    const item: LivePresentItem = {
      id,
      kind,
      title,
      packId,
      slide: clampSlide(start.slide),
      strokes: [],
      src,
    };
    p.items = [...(p.items || []), item].slice(0, 12);
    p.activeId = id;
  }
  applyActivePresentItem(p);
  return (p.items || []).find((i) => i.id === p.activeId) || boardPresentItem();
}

export function closePresentItem(p: PresentItemsState, closeId: string): void {
  if (!closeId || closeId === "board") return;
  stashActivePresentItem(p);
  p.items = (p.items || []).filter((i) => i.id !== closeId);
  if (!p.items.some((i) => i.id === "board")) p.items.unshift(boardPresentItem());
  if (p.activeId === closeId) p.activeId = p.items.find((i) => i.id !== "board")?.id || "board";
  applyActivePresentItem(p);
}

export function closeLibraryPresentItems(p: PresentItemsState): void {
  stashActivePresentItem(p);
  const board = (p.items || []).find((i) => i.id === "board") || boardPresentItem();
  p.items = [board];
  p.activeId = "board";
  applyActivePresentItem(p);
}

export function activatePresentItem(p: PresentItemsState, activeId: string): void {
  if (!activeId) return;
  stashActivePresentItem(p);
  if ((p.items || []).some((i) => i.id === activeId)) p.activeId = activeId;
  applyActivePresentItem(p);
}
