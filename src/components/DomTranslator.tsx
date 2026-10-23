"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import phrases from "@/i18n/ar-phrases.json";

/**
 * Fallback translator for leftover hard-coded English UI text (Arabic mode only).
 * Exact-phrase dictionary (src/i18n/ar-phrases.json) + small regex rules.
 * Skips inputs, editable areas and anything inside [data-no-tr]. Restores English on switch back.
 */
const DICT = phrases as Record<string, string>;
const AD = "٠١٢٣٤٥٦٧٨٩";
const num = (s: string) => s.replace(/\d/g, (d) => AD[+d]);
const MONTHS: Record<string, string> = { January: "يناير", February: "فبراير", March: "مارس", April: "أبريل", May: "مايو", June: "يونيو", July: "يوليو", August: "أغسطس", September: "سبتمبر", October: "أكتوبر", November: "نوفمبر", December: "ديسمبر", Jan: "يناير", Feb: "فبراير", Mar: "مارس", Apr: "أبريل", Jun: "يونيو", Jul: "يوليو", Aug: "أغسطس", Sep: "سبتمبر", Sept: "سبتمبر", Oct: "أكتوبر", Nov: "نوفمبر", Dec: "ديسمبر" };
const DAYS: Record<string, string> = { Monday: "الاثنين", Tuesday: "الثلاثاء", Wednesday: "الأربعاء", Thursday: "الخميس", Friday: "الجمعة", Saturday: "السبت", Sunday: "الأحد", Mon: "الاثنين", Tue: "الثلاثاء", Wed: "الأربعاء", Thu: "الخميس", Fri: "الجمعة", Sat: "السبت", Sun: "الأحد" };

function rules(s: string): string | null {
  let out = s;
  out = out.replace(/\bYear (\d+)\b/g, (_, n) => `السنة ${n}`)
    .replace(/\bTerm (\d+)\b/g, (_, n) => `الفصل ${n}`)
    .replace(/\b(?:Week|Wk) (\d+)\b/g, (_, n) => `الأسبوع ${n}`)
    .replace(/\b(January|February|March|April|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\b/g, (m) => MONTHS[m])
    .replace(/\bAED ([\d,]+)\b/g, (_, n) => `${n} درهم`)
    .replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, (m) => DAYS[m]);
  return out === s ? null : out;
}

export function translatePhrase(raw: string): string | null {
  const core = raw.trim();
  if (!core || !/[A-Za-z]/.test(core)) return null;
  const hit = DICT[core];
  const res = hit ?? rules(core);
  if (res == null) return null;
  return raw.replace(core, res);
}

const SKIP = "script,style,textarea,input,code,pre,[contenteditable='true'],[data-no-tr]";
const ATTRS = ["placeholder", "title", "aria-label"];

export function DomTranslator() {
  const { lang } = useI18n();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const origText = new WeakMap<Text, { en: string; ar: string }>();
    const origAttr = new WeakMap<Element, Record<string, { en: string; ar: string }>>();
    const touched = new Set<Node>();
    const skip = (el: Element | null) => !!el && !!el.closest(SKIP);
    const doText = (n: Text) => {
      if (skip(n.parentElement)) return;
      const v = n.nodeValue ?? "";
      const rec = origText.get(n);
      if (rec && rec.ar === v) return;
      const tr = translatePhrase(v);
      if (tr == null || tr === v) return;
      // <option> without a value attribute uses its text as the value: pin it so selects keep working.
      const opt = n.parentElement;
      if (opt && opt.tagName === "OPTION" && !opt.hasAttribute("value")) opt.setAttribute("value", (opt.textContent || "").trim());
      origText.set(n, { en: v, ar: tr });
      touched.add(n);
      n.nodeValue = tr;
    };
    const doAttrs = (el: Element) => {
      if (el.closest("[data-no-tr]")) return;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const rec = origAttr.get(el) ?? {};
        if (rec[a]?.ar === v) continue;
        const tr = translatePhrase(v);
        if (tr == null || tr === v) continue;
        rec[a] = { en: v, ar: tr };
        origAttr.set(el, rec);
        touched.add(el);
        el.setAttribute(a, tr);
      }
    };
    const walk = (root: Node) => {
      if (root.nodeType === 3) return doText(root as Text);
      if (root.nodeType !== 1) return;
      const el = root as Element;
      if (el.matches("script,style")) return;
      doAttrs(el);
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let c: Node | null = w.nextNode();
      while (c) {
        if (c.nodeType === 3) doText(c as Text);
        else doAttrs(c as Element);
        c = w.nextNode();
      }
    };
    const restore = () => {
      touched.forEach((n) => {
        if (n.nodeType === 3) {
          const r = origText.get(n as Text);
          if (r && (n as Text).nodeValue === r.ar) (n as Text).nodeValue = r.en;
        } else {
          const r = origAttr.get(n as Element) ?? {};
          for (const a of Object.keys(r)) if ((n as Element).getAttribute(a) === r[a].ar) (n as Element).setAttribute(a, r[a].en);
        }
      });
      touched.clear();
    };
    if (lang !== "ar") return;
    walk(document.body);
    const mo = new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "characterData") doText(m.target as Text);
        else if (m.type === "attributes") doAttrs(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    return () => { mo.disconnect(); restore(); };
  }, [lang]);
  return null;
}
export { num as toArabicDigits };
