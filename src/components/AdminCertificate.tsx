"use client";
import { lmsApi } from "@/lib/lms";
import { clearNameModeCache } from "@/lib/studentName";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildCertificatePdf } from "@/lib/certificatePdf";
import {
  ARABIC_FONTS, BORDER_LABELS, LAYOUT_LABELS, LATIN_FONTS, SAMPLE_DATA, loadCertCollection, newDesignId, normalizeDesign,
  renderCertificate, saveCertCollection, type CertBorder, type CertCollection, type CertDesign, type CertLabelLang, type CertLayout,
} from "@/lib/certificateDesign";
import { getServerSession } from "@/lib/adminServer";
import { listPublishedQuizzes, loadQuizzesData, type Quiz } from "@/lib/quiz";
import type { CertificateTemplate } from "@/lib/quiz";

type Props = {
  setStatus: (s: string) => void;
  onNeedToken: () => void;
  /** Legacy single template (still published for older callers; designs below are the live source). */
  tpl?: CertificateTemplate;
  setTpl?: React.Dispatch<React.SetStateAction<CertificateTemplate>>;
};

const input = "mt-1 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const btn = "rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60";
const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm disabled:opacity-50";

/** Downscale an uploaded picture and keep transparency (WebP/PNG data URL) so it stays small on the server. */
async function fileToDataUrl(file: File, maxSide: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("bad image")); i.src = url; });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    const webp = c.toDataURL("image/webp", 0.88);
    return webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

export default function AdminCertificate({ setStatus, onNeedToken }: Props) {
  const [coll, setColl] = useState<CertCollection | null>(null);
  const [saved, setSaved] = useState("");
  const [nameMode, setNameModeState] = useState("auto");
  useEffect(() => { lmsApi.nameMode(true).then((r) => setNameModeState(r.mode || "auto")).catch(() => undefined); }, []);
  const [selId, setSelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadCertCollection(true).then((c) => { setColl(c); setSaved(JSON.stringify(c)); setSelId(c.defaultId); }).catch(() => setStatus("Could not load certificate designs."));
    loadQuizzesData().then((d) => setQuizzes(listPublishedQuizzes(d))).catch(() => undefined);
  }, [setStatus]);

  const cur = useMemo(() => coll?.designs.find((d) => d.id === selId) || coll?.designs[0], [coll, selId]);
  const dirty = coll ? JSON.stringify(coll) !== saved : false;

  // live preview (debounced)
  useEffect(() => {
    if (!cur || !canvasRef.current) return;
    const t = setTimeout(() => { if (canvasRef.current) renderCertificate(canvasRef.current, cur, SAMPLE_DATA, 1.6).catch(() => undefined); }, 120);
    return () => clearTimeout(t);
  }, [cur]);

  const patch = useCallback((p: Partial<CertDesign>) => setColl((c) => c && { ...c, designs: c.designs.map((d) => (d.id === selId ? normalizeDesign({ ...d, ...p }, d.id) : d)) }), [selId]);
  const patchWm = (p: Partial<CertDesign["watermark"]>) => cur && patch({ watermark: { ...cur.watermark, ...p } });

  if (!coll || !cur) return <section className="space-y-3"><h2 className="text-xl font-semibold">Certificate designer</h2><p className="text-sm text-muted">Loading designs…</p></section>;

  const create = (base?: CertDesign, label?: string) => {
    const d = normalizeDesign({ ...(base || cur), id: newDesignId(), name: label || `${(base || cur).name} copy` });
    setColl({ ...coll, designs: [...coll.designs, d] }); setSelId(d.id);
  };
  const remove = () => {
    if (coll.designs.length <= 1) { setStatus("You need at least one design."); return; }
    if (!window.confirm(`Delete the design “${cur.name}”? Assessments using it will fall back to the default design.`)) return;
    const designs = coll.designs.filter((d) => d.id !== cur.id);
    const defaultId = coll.defaultId === cur.id ? designs[0].id : coll.defaultId;
    const assign = Object.fromEntries(Object.entries(coll.assign).map(([q, v]) => [q, { individual: v.individual === cur.id ? undefined : v.individual, group: v.group === cur.id ? undefined : v.group }]));
    setColl({ designs, defaultId, assign }); setSelId(defaultId);
  };
  const setAssign = (quizId: string, kind: "individual" | "group", id: string) => setColl((c) => c && { ...c, assign: { ...c.assign, [quizId]: { ...c.assign[quizId], [kind]: id || undefined } } });

  async function save() {
    if (!getServerSession()) { setStatus("Sign in for publishing first (Settings)."); onNeedToken(); return; }
    setBusy(true); setStatus("Saving certificate designs…");
    const r = await saveCertCollection(coll!);
    setBusy(false);
    if (r.ok) { setSaved(JSON.stringify(coll)); setStatus("Certificate designs saved. They apply to new certificates straight away."); }
    else setStatus(r.error || "Could not save.");
  }
  async function sample(kind: "individual" | "group") {
    setStatus("Building sample PDF…");
    const { doc, fileName } = await buildCertificatePdf({ design: cur, kind, quizTitle: SAMPLE_DATA.quizTitle, positionLabel: kind === "group" ? "2 of 24" : "1 of 24", result: { id: "preview", quizId: "preview", quizSlug: "preview", name: SAMPLE_DATA.name, score: SAMPLE_DATA.score, maxScore: SAMPLE_DATA.maxScore, percentage: SAMPLE_DATA.percentage, finishedAt: new Date().toISOString() } });
    doc.save(`sample-${kind}-${fileName}`); setStatus("Sample PDF downloaded.");
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>, field: "watermark" | "logo") {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try {
      const src = await fileToDataUrl(f, field === "watermark" ? 1400 : 500);
      if (field === "watermark") patchWm({ src }); else patch({ logoUrl: src });
    } catch { setStatus("That picture could not be read. Use PNG, JPG, WebP or SVG."); }
  }

  const fontSel = (label: string, key: "titleFont" | "bodyFont" | "titleFontAr" | "bodyFontAr", set: Record<string, { label: string }>) => (
    <Field label={label}><select className={input} value={cur[key]} onChange={(e) => patch({ [key]: e.target.value } as Partial<CertDesign>)} data-testid={`cert-${key}`}>{Object.entries(set).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
  );
  const colorIn = (label: string, key: "bgColor" | "borderColor" | "textColor" | "accentColor") => (
    <label className="flex items-center gap-2 text-sm font-medium"><input type="color" value={cur[key]} onChange={(e) => patch({ [key]: e.target.value } as Partial<CertDesign>)} data-testid={`cert-${key}`} className="h-8 w-10 cursor-pointer rounded" />{label}</label>
  );

  return (
    <section className="space-y-5" data-testid="cert-designer">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Certificate designer</h2>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800" data-testid="cert-dirty">Unsaved changes</span>}
          <button type="button" className={btn} disabled={busy || !dirty} onClick={save} data-testid="cert-save">Save designs</button>
        </div>
      </div>

      {/* design list */}
      <div className="space-y-3 rounded-2xl border border-card-border bg-card p-4">
        <div className="flex flex-wrap gap-2" data-testid="cert-list">
          {coll.designs.map((d) => (
            <button key={d.id} type="button" onClick={() => setSelId(d.id)} data-testid="cert-design-chip" aria-pressed={d.id === cur.id}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${d.id === cur.id ? "border-primary bg-primary text-primary-foreground" : "border-card-border"}`}>
              {d.id === coll.defaultId ? "★ " : ""}{d.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-48 flex-1 text-sm font-medium">Design name
            <input key={cur.id} className={input} defaultValue={cur.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== cur.name && patch({ name: e.target.value.trim() })} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} data-testid="cert-name" />
          </label>
          <button type="button" className={btnGhost} onClick={() => create(normalizeDesign({}), "New design")} data-testid="cert-new">＋ New</button>
          <button type="button" className={btnGhost} onClick={() => create()} data-testid="cert-duplicate">⧉ Duplicate</button>
          <button type="button" className={btnGhost} disabled={cur.id === coll.defaultId} onClick={() => setColl({ ...coll, defaultId: cur.id })} data-testid="cert-default">★ Set as default</button>
          <button type="button" className={btnGhost + " text-red-600"} disabled={coll.designs.length <= 1} onClick={remove} data-testid="cert-delete">🗑 Delete</button>
        </div>
        <p className="text-xs text-muted">The ★ design is used by every assessment that has no design chosen below. Changes are stored on the server when you press “Save designs”.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <Card title="Layout & border">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Template"><select className={input} value={cur.layout} onChange={(e) => patch({ layout: e.target.value as CertLayout })} data-testid="cert-layout">{Object.entries(LAYOUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Border style"><select className={input} value={cur.borderStyle} onChange={(e) => patch({ borderStyle: e.target.value as CertBorder })} data-testid="cert-border">{Object.entries(BORDER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">{colorIn("Background", "bgColor")}{colorIn("Border / header", "borderColor")}{colorIn("Text", "textColor")}{colorIn("Accent", "accentColor")}</div>
          </Card>

          <Card title="Fonts">
            <div className="grid gap-3 sm:grid-cols-2">
              {fontSel("Title font (Latin)", "titleFont", LATIN_FONTS)}{fontSel("Body font (Latin)", "bodyFont", LATIN_FONTS)}
              {fontSel("Title font (Arabic)", "titleFontAr", ARABIC_FONTS)}{fontSel("Body font (Arabic)", "bodyFontAr", ARABIC_FONTS)}
            </div>
            <Field label="Certificate language"><select className={input} value={cur.labelLang} onChange={(e) => patch({ labelLang: e.target.value as CertLabelLang })} data-testid="cert-lang"><option value="en">English</option><option value="ar">العربية (Arabic)</option><option value="both">English + Arabic</option></select></Field>
            <Field label="Student name on certificates & QR cards"><select className={input} value={nameMode} onChange={async (e) => { const m = e.target.value; setNameModeState(m); try { await lmsApi.setNameMode(m); clearNameModeCache(); } catch { /* shown as unchanged on reload */ } }} data-testid="cert-name-mode"><option value="auto">Follow the language (Arabic name in Arabic)</option><option value="ar">Arabic name</option><option value="en">English name</option><option value="both">Arabic + English</option></select></Field>
          </Card>

          <Card title="Wording">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title"><input className={input} value={cur.title} onChange={(e) => patch({ title: e.target.value })} data-testid="cert-title" /></Field>
              <Field label="Title (Arabic)"><input className={input} dir="rtl" value={cur.titleAr} onChange={(e) => patch({ titleAr: e.target.value })} /></Field>
              <Field label="Subtitle"><textarea className={input + " min-h-16"} value={cur.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} /></Field>
              <Field label="Subtitle (Arabic)"><textarea className={input + " min-h-16"} dir="rtl" value={cur.subtitleAr} onChange={(e) => patch({ subtitleAr: e.target.value })} /></Field>
              <Field label="School / teacher name"><input className={input} value={cur.schoolName} onChange={(e) => patch({ schoolName: e.target.value })} /></Field>
              <Field label="Footer text"><input className={input} value={cur.footerText} onChange={(e) => patch({ footerText: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cur.showPosition} onChange={(e) => patch({ showPosition: e.target.checked })} /> Show class position</label>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={cur.showSignature} onChange={(e) => patch({ showSignature: e.target.checked })} data-testid="cert-sig-on" /> Signature / name line</label>
            {cur.showSignature && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Signature name (printed in script)"><input className={input} value={cur.signatureName} onChange={(e) => patch({ signatureName: e.target.value })} data-testid="cert-sig-name" /></Field>
                <Field label="Role under the line"><input className={input} value={cur.signatureTitle} onChange={(e) => patch({ signatureTitle: e.target.value })} /></Field>
              </div>
            )}
          </Card>

          <Card title="Logo & watermark">
            <div className="space-y-2">
              <p className="text-sm font-medium">Background watermark (large, faint)</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={btnGhost + " cursor-pointer"}>Upload logo…<input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "watermark")} data-testid="cert-wm-upload" /></label>
                {cur.watermark.src && <button type="button" className={btnGhost} onClick={() => patchWm({ src: "" })}>Remove</button>}
                {cur.watermark.src && <img src={cur.watermark.src} alt="" className="h-9 w-auto rounded border border-card-border bg-white p-0.5" />}
              </div>
              <label className="block text-sm font-medium">Opacity: {cur.watermark.opacity}%<input type="range" min={0} max={60} value={cur.watermark.opacity} onChange={(e) => patchWm({ opacity: Number(e.target.value) })} className="mt-1 w-full" data-testid="cert-wm-opacity" /></label>
              <label className="block text-sm font-medium">Size: {cur.watermark.size}% of page height<input type="range" min={20} max={130} value={cur.watermark.size} onChange={(e) => patchWm({ size: Number(e.target.value) })} className="mt-1 w-full" data-testid="cert-wm-size" /></label>
            </div>
            <div className="space-y-2 border-t border-card-border pt-3">
              <p className="text-sm font-medium">Small logo above the title (optional)</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={btnGhost + " cursor-pointer"}>Upload…<input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, "logo")} /></label>
                {cur.logoUrl && <button type="button" className={btnGhost} onClick={() => patch({ logoUrl: "" })}>Remove</button>}
                {cur.logoUrl && <img src={cur.logoUrl} alt="" className="h-9 w-auto rounded border border-card-border bg-white p-0.5" />}
              </div>
            </div>
            <p className="text-xs text-muted">Tip: a transparent PNG works best. Pictures are shrunk automatically.</p>
          </Card>
        </div>

        <div className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-2xl border border-card-border bg-card p-3">
            <canvas ref={canvasRef} className="h-auto w-full rounded-lg shadow" style={{ aspectRatio: "842 / 595" }} data-testid="cert-preview" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => sample("individual")} data-testid="cert-sample-individual">Sample PDF · individual</button>
              <button type="button" className={btnGhost} onClick={() => sample("group")} data-testid="cert-sample-group">Sample PDF · group</button>
            </div>
            <p className="mt-2 text-xs text-muted">Live preview with sample data. The PDF is identical to what students download.</p>
          </div>
        </div>
      </div>

      <Card title="Which design does each assessment use?">
        <div className="max-h-96 overflow-auto rounded-xl border border-card-border" data-testid="cert-assign">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted"><tr><th className="p-2">Assessment</th><th className="p-2">Individual</th><th className="p-2">Group (live)</th></tr></thead>
            <tbody>
              {quizzes.map((q) => (
                <tr key={q.id} className="border-t border-card-border">
                  <td className="p-2 font-medium">{q.title}</td>
                  {(["individual", "group"] as const).map((k) => (
                    <td key={k} className="p-2">
                      <select className={input + " mt-0"} value={coll.assign[q.id]?.[k] || ""} onChange={(e) => setAssign(q.id, k, e.target.value)} data-testid={`cert-assign-${k}`}>
                        <option value="">Default ({coll.designs.find((d) => d.id === coll.defaultId)?.name})</option>
                        {coll.designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
              {!quizzes.length && <tr><td className="p-3 text-muted" colSpan={3}>No assessments yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Press “Save designs” after changing designs or choices.</p>
      </Card>
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className="space-y-3 rounded-2xl border border-card-border bg-card p-4"><h3 className="text-base font-semibold">{title}</h3>{children}</div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}</label>;
}
