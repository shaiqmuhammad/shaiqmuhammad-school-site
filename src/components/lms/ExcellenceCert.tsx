"use client";

import { useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, lmsSession } from "@/lib/lms";

/** Words of appreciation only — no religious quotations. */
export type ExcDesign = {
  titleEn: string; titleAr: string;
  lineEn: string; lineAr: string;
  closeEn: string; closeAr: string;
  signEn: string; signAr: string;
  ink: string; gold: string;
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
  ink: "#1b3a57",
  gold: "#c9a227",
};

const hex = (v: string, fallback: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

export async function downloadExcellenceCert(who: { name: string; cls: string; at: number }, design: ExcDesign, lang: string) {
  const d = { ...EXC_DEFAULT, ...design };
  const ar = lang === "ar";
  const W = 1754, H = 1240;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  if (!g) return;
  const ink = hex(d.ink, EXC_DEFAULT.ink), gold = hex(d.gold, EXC_DEFAULT.gold);
  g.fillStyle = "#fffaf3"; g.fillRect(0, 0, W, H);
  g.strokeStyle = ink; g.lineWidth = 28; g.strokeRect(36, 36, W - 72, H - 72);
  g.strokeStyle = gold; g.lineWidth = 8; g.strokeRect(70, 70, W - 140, H - 140);
  g.textAlign = "center"; g.fillStyle = ink;
  g.font = "bold 78px Georgia, 'Noto Naskh Arabic', serif";
  g.fillText(ar ? d.titleAr : d.titleEn, W / 2, 250);
  g.font = "40px Georgia, 'Noto Naskh Arabic', serif";
  g.fillText(ar ? d.lineAr : d.lineEn, W / 2, 380);
  g.font = "bold 92px Georgia, 'Noto Naskh Arabic', serif"; g.fillStyle = gold;
  g.fillText(who.name, W / 2, 520);
  g.fillStyle = ink; g.font = "40px Georgia, 'Noto Naskh Arabic', serif";
  if (who.cls) g.fillText(who.cls, W / 2, 610);
  const close = ar ? d.closeAr : d.closeEn;
  g.font = "36px Georgia, 'Noto Naskh Arabic', serif";
  const words = close.split(" ");
  let line = "", y = 720;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > 1200) { g.fillText(line, W / 2, y); y += 52; line = w; } else line = next;
  }
  if (line) g.fillText(line, W / 2, y);
  g.font = "34px Georgia, serif";
  g.fillText(new Date(who.at).toLocaleDateString(ar ? "ar" : "en-GB", { day: "numeric", month: "long", year: "numeric" }), W / 2, 980);
  g.font = "italic 40px Georgia, 'Noto Naskh Arabic', serif";
  g.fillText(ar ? d.signAr : d.signEn, W / 2, 1080);
  g.fillStyle = gold; g.beginPath(); g.arc(220, H - 250, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = ink; g.font = "bold 72px serif"; g.fillText("★", 220, H - 226);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H] });
  pdf.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
  const safe = who.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "student";
  pdf.save(`excellence-certificate-${safe}.pdf`);
}

export function ExcellenceDesign({ design, onSaved }: { design: ExcDesign; onSaved?: (d: ExcDesign) => void }) {
  const { tr } = useTr();
  const [d, setD] = useState<ExcDesign>({ ...EXC_DEFAULT, ...design });
  const [msg, setMsg] = useState("");
  const set = (k: keyof ExcDesign, v: string) => setD({ ...d, [k]: v });
  const save = () => lmsApi.rc<{ design: ExcDesign }>("cert-save", { design: d }).then((r) => { setMsg(tr("Certificate design saved.", "تم حفظ تصميم الشهادة.")); onSaved?.(r.design); }).catch((e) => setMsg(lmsErrorText(e, tr)));
  const field = (k: keyof ExcDesign, en: string, ar: string, rtl = false) => (
    <label className="block text-sm font-bold">{tr(en, ar)}<input className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-normal dark:border-white/15 dark:bg-white/5" dir={rtl ? "rtl" : "ltr"} value={d[k]} maxLength={180} onChange={(e) => set(k, e.target.value)} /></label>
  );
  const me = lmsSession()?.user;
  return (
    <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm dark:bg-white/5" data-testid="exc-design">
      <h3 className="text-lg font-black">{tr("Excellence Certificate", "شهادة التميز")}</h3>
      <p className="text-sm opacity-70">{tr("Students who spend Reward Cards on this certificate can download it. Write appreciative words — do not add quotations.", "الطلاب الذين يستخدمون بطاقات المكافآت لهذه الشهادة يمكنهم تنزيلها. اكتب كلمات تقدير دون اقتباسات.")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("titleEn", "Title (English)", "العنوان (إنجليزي)")}
        {field("titleAr", "Title (Arabic)", "العنوان (عربي)", true)}
        {field("lineEn", "Line before the name", "سطر قبل الاسم")}
        {field("lineAr", "Arabic line before the name", "السطر العربي قبل الاسم", true)}
        {field("closeEn", "Words of appreciation", "كلمات التقدير")}
        {field("closeAr", "Arabic words of appreciation", "كلمات التقدير بالعربية", true)}
        {field("signEn", "Closing line", "سطر الختام")}
        {field("signAr", "Arabic closing line", "سطر الختام بالعربية", true)}
        <label className="flex items-center gap-2 text-sm font-bold">{tr("Ink", "لون النص")}<input type="color" value={hex(d.ink, EXC_DEFAULT.ink)} onChange={(e) => set("ink", e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm font-bold">{tr("Gold", "ذهبي")}<input type="color" value={hex(d.gold, EXC_DEFAULT.gold)} onChange={(e) => set("gold", e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-[#f5c542] px-4 py-2 text-sm font-extrabold text-[#1b3a57]" onClick={save} data-testid="exc-save">{tr("Save design", "حفظ التصميم")}</button>
        <button type="button" className="rounded-full bg-black/5 px-4 py-2 text-sm font-bold dark:bg-white/10" onClick={() => me && downloadExcellenceCert({ name: me.name || tr("Student name", "اسم الطالب"), cls: me.cls || "", at: Date.now() }, d, "en")}>{tr("Preview", "معاينة")}</button>
      </div>
      {msg && <p className="text-sm font-semibold" role="status">{msg}</p>}
    </section>
  );
}
