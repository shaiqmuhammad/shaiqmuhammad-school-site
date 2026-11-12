"use client";

import { useEffect, useRef, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession } from "@/lib/lms";

/** Words of appreciation only — no religious quotations. */
export type ExcLayout = "classic" | "panel";
export type ExcDesign = {
  titleEn: string; titleAr: string;
  lineEn: string; lineAr: string;
  closeEn: string; closeAr: string;
  signEn: string; signAr: string;
  subjEn: string; subjAr: string;
  classEn: string; classAr: string;
  yearEn: string; yearAr: string;
  ink: string; gold: string;
  layout: ExcLayout;
};

export const EXC_DEFAULT: ExcDesign = {
  titleEn: "Certificate of Excellence",
  titleAr: "شهادة تميز",
  lineEn: "This certificate is awarded to",
  lineAr: "تُمنح هذه الشهادة إلى",
  closeEn: "for excellent effort, care for others, and a love of learning.",
  closeAr: "تقديرًا للجهود الممتازة والاهتمام بالآخرين وحب التعلم.",
  signEn: "With appreciation",
  signAr: "مع التقدير",
  subjEn: "Subject",
  subjAr: "المادة",
  classEn: "Class",
  classAr: "الصف",
  yearEn: "Year",
  yearAr: "السنة",
  ink: "#1b3a57",
  gold: "#c9a227",
  layout: "classic",
};

export type CertWho = { name: string; nameAr?: string; cls: string; section?: string; subject: string; year: string; at: number };

const SAMPLE_AT = Date.UTC(2026, 10, 12);
const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
const shown = (d: ExcDesign): ExcDesign => ({ ...EXC_DEFAULT, ...d, layout: d.layout === "panel" ? "panel" : "classic" });

export function ExcellenceSheet({ who, design, sheetRef }: { who: CertWho; design: ExcDesign; sheetRef?: React.Ref<HTMLElement> }) {
  const d = shown(design);
  const ink = hex(d.ink, EXC_DEFAULT.ink);
  const gold = hex(d.gold, EXC_DEFAULT.gold);
  const latin = "var(--font-nunito), Nunito, Georgia, serif";
  const arabic = "var(--font-arabic), 'Noto Sans Arabic', Tahoma, sans-serif";
  const cls = [who.cls, who.section].filter(Boolean).join(" · ") || "—";
  const facts: [string, string, string][] = [
    [d.subjEn, d.subjAr, who.subject || "—"],
    [d.classEn, d.classAr, cls],
    [d.yearEn, d.yearAr, who.year || "—"],
  ];
  const when = new Date(who.at || SAMPLE_AT).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const box = d.layout === "panel";
  return (
    <article ref={sheetRef} data-testid="exc-sheet" data-print-cert="" style={{ width: 1120, height: 792, position: "relative", background: "#fffaf3", color: ink, fontFamily: latin, boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 16, border: `12px solid ${ink}`, borderRadius: 18 }} />
      <div style={{ position: "absolute", inset: 36, border: `3px solid ${gold}`, borderRadius: 10 }} />
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden style={{ position: "absolute", left: 52, top: 52 }}><path d="M6 28V6h22" fill="none" stroke={gold} strokeWidth="4" strokeLinecap="round" /><path d="M14 36V14h22" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" /></svg>
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden style={{ position: "absolute", right: 52, top: 52 }}><path d="M66 28V6H44" fill="none" stroke={gold} strokeWidth="4" strokeLinecap="round" /><path d="M58 36V14H36" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" /></svg>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "58px 90px 48px" }}>
        <p style={{ margin: 0, fontSize: 42, fontWeight: 800, letterSpacing: 0.4, lineHeight: 1.15 }}>{d.titleEn}</p>
        <p dir="rtl" style={{ margin: "4px 0 0", fontFamily: arabic, fontSize: 34, fontWeight: 800, lineHeight: 1.3 }}>{d.titleAr}</p>
        <div style={{ width: 180, height: 3, background: gold, margin: "14px 0 12px", borderRadius: 2 }} />
        <p style={{ margin: 0, fontSize: 20, opacity: 0.9 }}>{d.lineEn}</p>
        <p dir="rtl" style={{ margin: "2px 0 0", fontFamily: arabic, fontSize: 20 }}>{d.lineAr}</p>
        <p dir="auto" style={{ margin: "8px 0 0", fontSize: 54, fontWeight: 800, color: gold, lineHeight: 1.15 }}>{who.name || "—"}</p>
        {who.nameAr && who.nameAr !== who.name ? <p dir="rtl" style={{ margin: "2px 0 0", fontFamily: arabic, fontSize: 32, fontWeight: 700, color: gold }}>{who.nameAr}</p> : null}
        <div style={{ display: "flex", gap: 14, marginTop: 16, width: "100%", justifyContent: "center" }}>
          {facts.map(([en, ar, value]) => (
            <div key={en} style={{ flex: "1 1 0", maxWidth: 280, padding: box ? "10px 12px" : "4px 8px", border: box ? `2px solid ${gold}` : "none", borderRadius: 14, background: box ? "rgba(201,162,39,0.08)" : "transparent" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: gold }}>{en} · <span dir="rtl" style={{ fontFamily: arabic, letterSpacing: 0, textTransform: "none" }}>{ar}</span></p>
              <p dir="auto" style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800 }}>{value}</p>
            </div>
          ))}
        </div>
        <p style={{ margin: "18px 0 0", maxWidth: 820, fontSize: 20, lineHeight: 1.45 }}>{d.closeEn}</p>
        <p dir="rtl" style={{ margin: "6px 0 0", maxWidth: 820, fontFamily: arabic, fontSize: 20, lineHeight: 1.6 }}>{d.closeAr}</p>
        <div style={{ marginTop: 28, display: "flex", width: "100%", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontStyle: "italic" }}>{d.signEn}</p>
            <p dir="rtl" style={{ margin: "2px 0 0", fontFamily: arabic, fontSize: 16 }}>{d.signAr}</p>
            <p style={{ margin: "8px 0 0", fontSize: 15 }}>{when}</p>
          </div>
          <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden>
            <circle cx="46" cy="46" r="42" fill={gold} />
            <circle cx="46" cy="46" r="34" fill="none" stroke={ink} strokeWidth="2" />
            <path d="M46 18l7 16 17 1.6-13 11 4 17L46 54 31 63.6l4-17-13-11L39 34z" fill={ink} />
          </svg>
        </div>
      </div>
    </article>
  );
}

export async function downloadExcellenceCert(node: HTMLElement) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#fffaf3", useCORS: true, logging: false });
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
  pdf.save("certificate-of-excellence.pdf");
}

export function ExcellencePreview({ who, design, onClose }: { who: CertWho; design: ExcDesign; onClose: () => void }) {
  const { tr } = useTr();
  const ref = useRef<HTMLElement>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = "@media print { body * { visibility: hidden !important } [data-print-cert], [data-print-cert] * { visibility: visible !important } [data-print-cert] { position: absolute !important; left: 0 !important; top: 0 !important } }";
    document.head.appendChild(s);
    return () => s.remove();
  }, []);
  const save = () => { const el = ref.current; if (!el) return; setMsg(""); downloadExcellenceCert(el).catch(() => setMsg(tr("Could not prepare the download. Try Print instead.", "تعذّر تجهيز التنزيل. جرّب الطباعة."))); };
  return (
    <div className="fixed inset-0 z-[2200] grid place-items-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label={tr("Certificate of Excellence", "شهادة التميز")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[94vh] w-full max-w-[1160px] overflow-auto rounded-3xl bg-[#fffaf3] p-3 shadow-2xl">
        <ExcellenceSheet who={who} design={design} sheetRef={ref} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-full bg-[#1b3a57] px-4 py-2 text-sm font-extrabold text-[#f5c542]" data-testid="exc-download" onClick={save}>{tr("Download PDF", "تنزيل PDF")}</button>
          <button type="button" className="rounded-full bg-[#f5c542] px-4 py-2 text-sm font-extrabold text-[#1b3a57]" onClick={() => window.print()}>{tr("Print", "طباعة")}</button>
          <button type="button" className="rounded-full bg-black/5 px-4 py-2 text-sm font-bold" onClick={onClose}>{tr("Close", "إغلاق")}</button>
        </div>
        {msg && <p className="mt-2 text-sm font-semibold text-rose-800" role="status">{msg}</p>}
      </div>
    </div>
  );
}

export function ExcellenceDesign({ design, onSaved }: { design: ExcDesign; onSaved?: (d: ExcDesign) => void }) {
  const { tr } = useTr();
  const [d, setD] = useState<ExcDesign>(shown(design));
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(false);
  const set = (k: keyof ExcDesign, v: string) => setD({ ...d, [k]: v });
  const save = () => lmsApi.rc<{ design: ExcDesign }>("cert-save", { design: d }).then((r) => { setMsg(tr("Certificate design saved.", "تم حفظ تصميم الشهادة.")); onSaved?.(shown(r.design)); }).catch((e) => setMsg(lmsErrorText(e, tr)));
  const field = (k: keyof ExcDesign, en: string, ar: string, rtl = false) => (
    <label className="block text-sm font-bold">{tr(en, ar)}<input className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-normal dark:border-white/15 dark:bg-white/5" dir={rtl ? "rtl" : "ltr"} value={d[k]} maxLength={180} onChange={(e) => set(k, e.target.value)} /></label>
  );
  const me = lmsSession()?.user;
  const sample: CertWho = { name: me?.name || tr("Student name", "اسم الطالب"), cls: me?.cls || "Year 4", section: "A", subject: tr("Science", "العلوم"), year: "2026–2027", at: SAMPLE_AT };
  return (
    <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm dark:bg-white/5" data-testid="exc-design">
      <h3 className="text-lg font-black">{tr("Excellence Certificate", "شهادة التميز")}</h3>
      <p className="text-sm opacity-70">{tr("Students who are given this certificate can open and download it from their account. Their name, subject, class and year are filled in. Write appreciative words — do not add quotations.", "الطلاب الذين تُمنح لهم هذه الشهادة يمكنهم فتحها وتنزيلها من حسابهم. يُطبع الاسم والمادة والصف والسنة. اكتب كلمات تقدير دون اقتباسات.")}</p>
      <div className="overflow-hidden rounded-2xl border border-black/10" style={{ height: 250 }}>
        <div style={{ transform: "scale(0.22)", transformOrigin: "top left" }}>
          <ExcellenceSheet who={sample} design={d} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("titleEn", "Title (English)", "العنوان (إنجليزي)")}
        {field("titleAr", "Title (Arabic)", "العنوان (عربي)", true)}
        {field("lineEn", "Line before the name", "سطر قبل الاسم")}
        {field("lineAr", "Arabic line before the name", "السطر العربي قبل الاسم", true)}
        {field("closeEn", "Words of appreciation", "كلمات التقدير")}
        {field("closeAr", "Arabic words of appreciation", "كلمات التقدير بالعربية", true)}
        {field("signEn", "Closing line", "سطر الختام")}
        {field("signAr", "Arabic closing line", "سطر الختام بالعربية", true)}
        {field("subjEn", "Subject label", "تسمية المادة")}
        {field("subjAr", "Arabic subject label", "تسمية المادة بالعربية", true)}
        {field("classEn", "Class label", "تسمية الصف")}
        {field("classAr", "Arabic class label", "تسمية الصف بالعربية", true)}
        {field("yearEn", "Year label", "تسمية السنة")}
        {field("yearAr", "Arabic year label", "تسمية السنة بالعربية", true)}
        <label className="flex items-center gap-2 text-sm font-bold">{tr("Ink", "لون النص")}<input type="color" value={hex(d.ink, EXC_DEFAULT.ink)} onChange={(e) => set("ink", e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm font-bold">{tr("Gold", "ذهبي")}<input type="color" value={hex(d.gold, EXC_DEFAULT.gold)} onChange={(e) => set("gold", e.target.value)} /></label>
        <label className="block text-sm font-bold sm:col-span-2">{tr("Layout", "التخطيط")}<select className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-normal dark:border-white/15 dark:bg-white/5" value={d.layout} onChange={(e) => setD({ ...d, layout: e.target.value === "panel" ? "panel" : "classic" })} data-testid="exc-layout"><option value="classic">{tr("Classic row", "صف كلاسيكي")}</option><option value="panel">{tr("Three panels", "ثلاث خانات")}</option></select></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-[#f5c542] px-4 py-2 text-sm font-extrabold text-[#1b3a57]" onClick={save} data-testid="exc-save">{tr("Save design", "حفظ التصميم")}</button>
        <button type="button" className="rounded-full bg-black/5 px-4 py-2 text-sm font-bold dark:bg-white/10" onClick={() => setPreview(true)}>{tr("Preview", "معاينة")}</button>
      </div>
      {preview && <ExcellencePreview who={sample} design={d} onClose={() => setPreview(false)} />}
      {msg && <p className="text-sm font-semibold" role="status">{msg}</p>}
    </section>
  );
}
