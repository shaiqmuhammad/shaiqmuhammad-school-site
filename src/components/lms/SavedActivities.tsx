"use client";
import { siteConfig } from "@/content/site";
import { useEffect, useState } from "react";
import { AssessmentShell } from "@/components/assessment/AssessmentShell";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { useLmsActor, useTr } from "@/components/lms/useLms";
import { lmsApi, type SavedAct, type SavedRow } from "@/lib/lms";
import { ACTIVITY_LABELS, type ActivityType } from "@/lib/activity";

import { qrImageUrl } from "@/lib/groupSession";
import { MapBoard, mapNodes } from "@/components/activity/MindMap";
import { BoardArt, type WbStroke } from "@/components/activity/Whiteboard";
import type { ActivityItem, ActivityState } from "@/lib/activity";
import type { ReactNode } from "react";

type Full = SavedAct & { prompt: string; tok?: string; rows: SavedRow[] };

/** t370: saved activity results — list, and a colourful printable sheet (question, each answer with name, class). */
export function SavedActivitiesPage() {
  const { tr, lang } = useTr();
  const { actor, asAdmin } = useLmsActor();
  const canRename = asAdmin || actor?.role === "admin" || !!actor?.perms?.includes("act:rename");
  const [items, setItems] = useState<SavedAct[] | null>(null);
  const [one, setOne] = useState<Full | null>(null);
  const [err, setErr] = useState("");
  const [paper, setPaper] = useState<"A4" | "A3">("A4");
  const id = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("id") || "";
  useEffect(() => {
    if (id) lmsApi.actSaved({ id }).then((r) => { setOne(r.item as Full); if (new URLSearchParams(window.location.search).get("print")) setTimeout(() => window.print(), 600); }).catch(() => setErr(tr("Couldn't load this result.", "تعذر تحميل النتيجة.")));
    else lmsApi.actSaved().then((r) => setItems(r.items || [])).catch(() => { setItems([]); setErr(tr("Couldn't load saved results.", "تعذر تحميل النتائج.")); });
  }, [id, tr]);
  const fmt = (n: number) => new Date(n).toLocaleString(lang === "ar" ? "ar" : "en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
  const lab = (t: string) => ACTIVITY_LABELS[t as ActivityType];
  if (one) {
    const l = lab(one.type);
    return (
      <div className="min-h-screen bg-white p-4 text-[#1b2f44] print:p-0" data-testid="saved-print">
        <style>{`@media print { @page { size: ${paper} portrait; margin: 8mm } .noprint { display:none } body { -webkit-print-color-adjust: exact; print-color-adjust: exact } .rs-page { break-after: page; page-break-after: always } .rs-page:last-child { break-after: auto; page-break-after: auto } }`}</style>
        <div className="noprint mb-4 flex flex-wrap gap-2"><a data-testid="saved-close" href="/lms/activities/saved" aria-label={tr("Close result", "إغلاق النتيجة")} className="rounded-full border border-black/15 px-4 py-2 text-sm font-bold">✕ {tr("Close · Activity results", "إغلاق · نتائج الأنشطة")}</a><button type="button" className="rounded-full bg-[#1b3a57] px-4 py-2 text-sm font-bold text-[#f5c542]" onClick={() => window.print()} data-testid="saved-print-btn">🖨 {tr("Print / save PDF", "طباعة / PDF")}</button>
          <span className="inline-flex overflow-hidden rounded-full border border-black/15 text-sm font-bold" role="group" aria-label={tr("Paper size", "حجم الورق")}>{(["A4", "A3"] as const).map((p) => <button key={p} type="button" className={`px-3 py-2 ${paper === p ? "bg-[#f5c542] text-[#1b3a57]" : ""}`} aria-pressed={paper === p} onClick={() => setPaper(p)} data-testid={`saved-paper-${p}`}>📄 {p}</button>)}</span></div>
        <ResultSheet r={one} lang={lang} paper={paper} qr={one.tok ? `${window.location.origin}/result?t=${one.tok}` : ""} />
      </div>
    );
  }
  return (
    <AssessmentShell title={tr("Saved activity results", "نتائج الأنشطة المحفوظة")} exitHref="/lms" wide toolbar={<LmsStaffToolbar />}>
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-3 py-6 sm:px-6" data-testid="saved-list">
        <div className="flex flex-wrap items-center gap-2"><h1 className="me-auto text-2xl font-extrabold">💾 {tr("Saved activity results", "نتائج الأنشطة المحفوظة")}</h1><a className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#1b2f44] shadow" href="/lms/classes">← {tr("My classes", "صفوفي")}</a></div>
        {err && <p className="rounded-2xl bg-rose-100 px-4 py-2 text-sm text-rose-800">{err}</p>}
        {items === null ? <p className="opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p> : !items.length ? <p className="rounded-3xl bg-white p-8 text-center text-[#1b2f44]">{tr("No saved results yet. Results are saved when you end an activity.", "لا توجد نتائج محفوظة بعد. تُحفظ النتائج عند إنهاء النشاط.")}</p> : (
          <ul className="space-y-2">
            {items.map((x) => { const l = lab(x.type); return (
              <li key={x.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 text-[#1b2f44] shadow-sm" data-testid="saved-item">
                <span className="text-2xl" aria-hidden>{l?.icon || "🎯"}</span>
                <span className="min-w-0 flex-1"><b className="block truncate" dir="auto">{x.title}</b><span className="text-xs opacity-70">{x.cls ? `${x.cls} · ` : ""}{fmt(x.at)} · {tr(`${x.n ?? 0} answers`, `${x.n ?? 0} إجابة`)}</span></span>
                <a className="rounded-full bg-[#1b3a57] px-3 py-1.5 text-sm font-bold text-[#f5c542]" href={`/lms/activities/saved?id=${x.id}`}>👁 {tr("Open", "فتح")}</a>
                <a className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-bold" href={`/lms/activities/saved?id=${x.id}&print=1`}>🖨 PDF</a>
                {canRename && <button type="button" className="rounded-full border border-black/15 px-3 py-1.5 text-sm font-bold" data-testid="saved-rename" onClick={async () => { const next = window.prompt(tr("Rename this activity", "إعادة تسمية هذا النشاط"), x.title); if (next == null) return; const name = next.trim().slice(0, 160); if (!name) return; try { const r = await lmsApi.actSaved({ id: x.id, rename: name }); setItems(r.items || []); } catch { /* permission or network */ } }}>{tr("Rename", "إعادة التسمية")}</button>}
                <button type="button" className="rounded-full px-2 text-rose-600" onClick={() => { if (confirm(tr("Delete this saved result?", "حذف هذه النتيجة؟"))) lmsApi.actSaved({ del: x.id }).then((r) => setItems(r.items || [])); }} aria-label={tr("Delete", "حذف")}>🗑</button>
              </li>); })}
          </ul>
        )}
      </div>
    </AssessmentShell>
  );
}

const BUB = ["#0284c7", "#d97706", "#059669", "#e11d48", "#7c3aed", "#0d9488", "#1b3a57", "#c026d3", "#ea580c", "#4f46e5"];
/** t375: the printable / public sheet — answers as a packed word cloud (word cloud) or colourful cloud bubbles (other types). */
export function ResultSheet({ r, lang, qr, names = true, paper = "A4" }: { r: { type: string; title: string; prompt: string; cls: string; subject?: string; topic?: string; at: number; teacher?: string; rows: SavedRow[] }; lang: string; qr?: string; names?: boolean; paper?: "A4" | "A3" }) {
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const l = ACTIVITY_LABELS[r.type as ActivityType];
  const date = new Date(r.at).toLocaleString(lang === "ar" ? "ar" : "en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
  // t409: every answer is a colourful bubble with the student's name in small text right beside it (no separate list).
  type Bub = { answer: string; names: string[]; ok?: boolean };
  const bubbles = (rows: typeof r.rows): Bub[] => {
    if (r.type !== "wordcloud") return rows.map((x) => ({ answer: x.answer, names: x.name ? [x.name] : [], ok: x.ok }));
    const m = new Map<string, Bub>();
    rows.forEach((x) => { const k = x.answer.toLocaleLowerCase(); const b = m.get(k) || { answer: x.answer, names: [] }; if (x.name) b.names.push(x.name); else b.names.push(""); m.set(k, b); });
    return [...m.values()].sort((a, b) => b.names.length - a.names.length);
  };
  const groups: [string, typeof r.rows][] = (() => {
    if (!r.rows.some((x) => x.group)) return [["", r.rows]];
    const m = new Map<string, typeof r.rows>();
    r.rows.forEach((x) => { const g = x.group || ""; m.set(g, [...(m.get(g) || []), x]); });
    return [...m.entries()];
  })();
  let n = 0;
  const bubble = (b: Bub) => {
    const i = n++;
    const count = r.type === "wordcloud" ? b.names.length : 1;
    const who = names ? b.names.filter(Boolean) : [];
    return (
      <span key={i} className="inline-flex max-w-full items-baseline gap-1.5 rounded-[2rem] px-4 py-2 font-extrabold text-white shadow-md" style={{ background: b.ok === undefined ? BUB[i % BUB.length] : b.ok ? "#059669" : "#e11d48", fontSize: `${Math.min(2.2, (b.answer.length < 40 ? 1.1 : 0.95) + (count - 1) * 0.3)}rem`, transform: `rotate(${((i * 7) % 5) - 2}deg)` }} dir="auto" data-testid="result-answer">
        {b.ok !== undefined && <span aria-label={b.ok ? tr("correct", "صحيح") : tr("not correct", "غير صحيح")}>{b.ok ? "✓" : "✗"}</span>}
        <span className="whitespace-pre-wrap break-words">{b.answer}</span>
        {r.type === "wordcloud" && count > 1 && <span className="text-[0.6em] opacity-90">×{count}</span>}
        {who.length > 0 && <span className="text-[11px] font-semibold leading-none text-white/85" data-testid="result-name">— {who.join(", ")}</span>}
      </span>
    );
  };
  const meta: [string, string][] = [[tr("Class", "الصف"), r.cls], [tr("Subject", "المادة"), r.subject || ""], [tr("Topic", "الموضوع"), r.topic || r.title]];
  const bubbleBody = (rows: typeof r.rows) => (
      <div className="space-y-3 bg-[#fffbea] p-4">
        {!rows.length ? <p className="py-8 text-center opacity-70">{tr("No answers were given.", "لم تُقدَّم إجابات.")}</p> : (rows === r.rows ? groups : [["", rows] as [string, typeof r.rows]]).map(([g, rs]) => (
          <section key={g || "all"} className="rounded-[28px] bg-white p-4" data-testid="result-bubbles">
            {g && <p className="mb-2 inline-block rounded-full bg-[#1b3a57] px-4 py-1 text-sm font-extrabold text-[#f5c542]" style={{ color: "#f5c542" }} dir="auto" data-testid="result-group">{g}</p>}
            <div className="flex min-h-24 flex-wrap items-center justify-center gap-3">{bubbles(rs).map(bubble)}</div>
          </section>
        ))}
      </div>
  );
  // t423: each activity keeps its own live design on paper; long ones split into whole, meaningful pages.
  const pages: ReactNode[] = activityPages(r, { names, paper, tr }) || [bubbleBody(r.rows)];
  const widthMm = paper === "A3" ? 277 : 190;
  return (
    <div className="mx-auto space-y-6 print:space-y-0" style={{ maxWidth: `${widthMm}mm` }} data-testid="result-pages">
      {pages.map((body, k) => (
        <div key={k} className="rs-page overflow-hidden rounded-3xl border-4 border-[#1b3a57] bg-white text-[#1b2f44]" data-testid="result-sheet">
          {k === 0 ? (
            <header className="flex items-start gap-4 px-6 py-5 text-white" style={{ backgroundImage: "linear-gradient(135deg,#1b3a57,#2b5b85)" }}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-widest text-[#f5c542]">{l?.icon} {l ? (lang === "ar" ? l.ar : l.en) : r.type}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-white" style={{ color: "#ffffff" }} data-testid="result-meta">
            {meta.filter(([, v]) => v).map(([k, v]) => <span key={k}><b className="text-[#f5c542]">{k}:</b> <span dir="auto">{v}</span></span>)}
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-[#f5c542]">{tr("Question", "السؤال")}</p>
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl" style={{ color: "#ffffff" }} dir="auto" data-testid="result-question">{r.prompt || r.title}</h1>
          <p className="mt-1 text-sm text-white opacity-90" style={{ color: "#ffffff" }}>📅 {date}{r.teacher ? ` · ${r.teacher}` : ""} · {tr(`${r.rows.length} answers`, `${r.rows.length} إجابة`)}</p>
        </div>
        {qr && <div className="shrink-0 rounded-2xl bg-white p-1.5 text-center" data-testid="result-qr">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qrImageUrl(qr, 240)} alt={tr("QR code to view these results", "رمز QR لعرض النتائج")} width={110} height={110} className="h-[110px] w-[110px]" /><p className="text-[10px] font-bold text-[#1b3a57]">{tr("Scan to view", "امسح للعرض")}</p></div>}
      </header>
          ) : (
            <header className="flex items-center gap-3 px-6 py-2 text-white" style={{ backgroundImage: "linear-gradient(135deg,#1b3a57,#2b5b85)" }}>
              <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-white" style={{ color: "#ffffff" }} dir="auto">{l?.icon} {r.prompt || r.title}</p>
              <p className="shrink-0 text-xs font-bold text-[#f5c542]">{meta.filter(([, v]) => v).map(([, v]) => v).join(" · ")}</p>
            </header>
          )}
          {body}
          <footer className="flex justify-between bg-[#f5c542] px-6 py-2 text-xs font-bold text-[#1b3a57]"><span>{siteConfig.domain}</span>{pages.length > 1 && <span data-testid="result-pageno">{tr(`Page ${k + 1} of ${pages.length}`, `صفحة ${k + 1} من ${pages.length}`)}</span>}</footer>
        </div>
      ))}
    </div>
  );
}

const WALL_BG: Record<string, string> = { "": "#ffffff", yellow: "#fef3c7", teal: "#ccfbf1", rose: "#ffe4e6", sky: "#e0f2fe", violet: "#ede9fe", lime: "#ecfccb" };
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** t423: printable bodies that keep the live look (null = use the shared bubble layout). */
function activityPages(r: { type: string; title: string; prompt: string; rows: SavedRow[] }, { names, paper, tr }: { names: boolean; paper: "A4" | "A3"; tr: (en: string, ar: string) => string }): ReactNode[] | null {
  const big = paper === "A3";
  if (r.type === "whiteboard") {
    const bgRow = r.rows.find((x) => x.kind === "bg");
    const layout = (bgRow?.wb || {}) as Record<string, unknown>;
    const all = r.rows.filter((x) => x.kind === "stroke" || x.kind === "note" || x.kind === "pic");
    const maxPg = all.reduce((m, x) => Math.max(m, Math.floor(Number((x.wb as { pg?: number } | undefined)?.pg) || 0)), 0);
    const pagesN = Math.max(1, Math.min(30, Number(layout.pages) || 1), maxPg + 1);
    const who = [...new Set(r.rows.filter((x) => x.kind && x.kind !== "bg" && x.pid !== "host" && x.name).map((x) => x.name!))];
    const bgs = Array.isArray(layout.bgs) ? layout.bgs.map((x) => String(x)) : [];
    return Array.from({ length: pagesN }, (_, p) => {
      const strokes: WbStroke[] = all.filter((x) => Math.floor(Number((x.wb as { pg?: number } | undefined)?.pg) || 0) === p).map((x, i) => ({ id: x.id || String(i), pid: x.pid || "", author: x.name || "", kind: x.kind!, d: (x.wb || {}) as WbStroke["d"] }));
      const bg = String(bgs[p] || layout.bg || "blank");
      return (
        <div key={`wb-${p}`} className="space-y-2 bg-[#fffbea] p-3">
          {pagesN > 1 && <p className="text-xs font-bold opacity-70">{tr(`Whiteboard page ${p + 1} of ${pagesN}`, `صفحة السبورة ${p + 1} من ${pagesN}`)}</p>}
          <div className="overflow-hidden rounded-2xl ring-4 ring-[#1b3a57]/80"><BoardArt strokes={strokes} bg={bg} names={names && layout.labels !== false} centre={r.prompt || r.title} tr={tr} /></div>
          {names && who.length > 0 && p === 0 && <p className="text-xs"><b>✏️ {tr("Drawn by", "رسم")}:</b> {who.join(" · ")}</p>}
        </div>
      );
    });
  }
  if (r.type === "mindmap" && r.rows.length && r.rows.every((x) => x.id)) {
    const toItem = (x: SavedRow): ActivityItem => ({ id: x.id!, pid: x.pid || "s", mine: false, author: x.name || "", kind: x.kind === "recall" ? "recall" : "post", data: { text: x.answer, ...(x.parent ? { parent: x.parent } : {}) }, status: "approved", created: 0, pinned: 0, color: "", highlight: !!x.highlight, img: null, likes: x.likes || 0, liked: false, comments: [] });
    const items = r.rows.map(toItem);
    const st = (its: ActivityItem[]) => ({ type: "mindmap", title: r.title, prompt: r.prompt, items: its, participants: [], settings: { options: {}, hideNames: !names, moderation: "live", likes: false, allowImages: false, allowLinks: false, timerEnd: null, locked: false } } as unknown as ActivityState);
    const { branches, leaves } = mapNodes(st(items));
    const maxB = big ? 7 : 3, maxIdeas = big ? 34 : 18;
    const groupsOf: ActivityItem[][] = [];
    let cur: ActivityItem[] = [], nB = 0;
    for (const b of branches) {
      const fam = [b, ...leaves(b.id)];
      const wgt = fam.length > 1 ? 1 : 0.34; // a lone branch takes little room
      if (cur.length && (nB + wgt > maxB + 0.01 || cur.length + fam.length > maxIdeas)) { groupsOf.push(cur); cur = []; nB = 0; }
      cur.push(...fam); nB += wgt;
    }
    if (cur.length || !groupsOf.length) groupsOf.push(cur);
    const recall = r.rows.filter((x) => x.kind === "recall");
    return groupsOf.map((its, k) => (
      <div key={k} className="bg-[#fffbea] p-3" data-testid="print-mindmap">
        <MapBoard state={st(groupsOf.length > 1 ? its : its.map((i) => i))} big={big} />
        {k === groupsOf.length - 1 && recall.length > 0 && <p className="mt-2 text-xs" dir="auto"><b>🧩 {tr("Recall answers", "إجابات التذكّر")}:</b> {recall.map((x) => `${x.answer}${names && x.name ? ` (${x.name})` : ""}`).join(" · ")}</p>}
      </div>
    ));
  }
  if (r.type === "wall" && r.rows.length && r.rows.every((x) => x.id)) {
    const posts = [...r.rows].sort((a, b) => (b.pinned || 0) - (a.pinned || 0));
    return chunk(posts, big ? 15 : 8).map((ps, k) => (
      <div key={k} className={`gap-3 bg-[#fffbea] p-3 ${big ? "columns-3" : "columns-2"}`} data-testid="print-wall">
        {ps.map((x, i) => (
          <article key={x.id || i} className="mb-3 break-inside-avoid rounded-3xl border p-3 shadow-sm" style={{ background: WALL_BG[x.color || ""] || "#ffffff", borderColor: x.highlight ? "#f5c542" : "rgba(0,0,0,.08)", borderWidth: x.highlight ? 3 : 1 }} data-testid="print-wall-card">
            <header className="flex items-center gap-2 text-xs">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold" style={{ background: x.pid === "host" ? "#1b3a57" : "#f5c542", color: x.pid === "host" ? "#f5c542" : "#1b3a57" }} aria-hidden>{x.pid === "host" ? "★" : names ? (x.name || "?").slice(0, 1).toUpperCase() : "•"}</span>
              {names && <span className="font-bold" data-testid="result-name">{x.name}</span>}
              {x.pinned ? <span aria-label={tr("Pinned", "مثبت")}>📌</span> : null}{x.highlight && <span>⭐</span>}{x.likes ? <span className="ms-auto">♥ {x.likes}</span> : null}
            </header>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed" dir="auto">{x.answer}</p>
          </article>
        ))}
      </div>
    ));
  }
  return null;
}

/** t375: public, no-login, read-only view of one saved result (QR on the printed sheet). No student names. */
export function PublicResultPage() {
  const [r, setR] = useState<Awaited<ReturnType<typeof lmsApi.actResult>> | null>(null);
  const [err, setErr] = useState(false);
  const [lang, setLang] = useState("en");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { setLang(document.documentElement.lang === "ar" ? "ar" : "en"); } catch { /* */ } const t = new URLSearchParams(window.location.search).get("t") || ""; lmsApi.actResult(t).then(setR).catch(() => setErr(true)); }, []);
  return (
    <div className="min-h-screen bg-[#0f1f30] p-3 sm:p-6" data-testid="public-result">
      {err ? <p className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center font-bold text-[#1b2f44]">{lang === "ar" ? "هذا الرابط غير صالح." : "This link isn't valid."}</p> : !r ? <p className="text-center text-white/80">…</p> : <ResultSheet r={r} lang={lang} names={false} />}
    </div>
  );
}
