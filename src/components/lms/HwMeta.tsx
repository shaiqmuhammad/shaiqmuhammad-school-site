"use client";
import { sortCls } from "@/lib/classSort";
import { useTr } from "@/components/lms/useLms";

/** t422: Year · Section(s) · Subject chips on homework cards, lists, packs and detail headers. */
export function HwMeta({ years = [], sections = [], subject = "", className = "" }: { years?: string[]; sections?: string[]; subject?: string; className?: string }) {
  const { tr } = useTr();
  const ys = sortCls(years.filter(Boolean)), ss = sortCls(sections.filter(Boolean));
  if (!ys.length && !ss.length && !subject) return null;
  const chip = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold";
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`} data-testid="hw-meta">
      {ys.length > 0 && <span className={`${chip} bg-[#1b3a57] text-white`} data-testid="hw-meta-year">🏫 {tr("Year", "الصف")}: {ys.join(", ")}</span>}
      <span className={`${chip} bg-[#f5c542] text-[#1b3a57]`} data-testid="hw-meta-sec">👥 {tr("Section", "الشعبة")}: {ss.length ? ss.join(", ") : tr("All", "الكل")}</span>
      {subject && <span className={`${chip} bg-emerald-100 text-emerald-900`} data-testid="hw-meta-subj" dir="auto">📘 {subject}</span>}
    </span>
  );
}
export const hwAud = (h: { cls?: string; section?: string; subject?: string; aud?: { years: string[]; sections: string[] } }) => ({ years: h.aud?.years || (h.cls ? [h.cls] : []), sections: h.aud?.sections || (h.section ? [h.section] : []), subject: h.subject || "" });
/** Packs keep their audience as scope strings ("Year 2" or "Year 2|2A"). */
export const packAud = (aud: string[] = []) => ({ years: [...new Set(aud.map((x) => x.split("|")[0]).filter((x) => x && !x.startsWith("g:")))], sections: [...new Set(aud.map((x) => x.split("|")[1] || "").filter(Boolean))] });
