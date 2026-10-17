import type { Catalog } from "@/lib/lms";

/** Class shown as its number only ("Year 4" → "4"). Stored class names are unchanged. */
export const clsNum = (c: string) => (c || "").match(/(\d+)(?!.*\d)/)?.[1] || c || "";
/** Section shown as its letter only ("4A" → "A"). Stored section names are unchanged. */
export const secLetter = (s: string) => (s || "").replace(/^\s*\d+\s*[-_·/]?\s*/, "").trim() || s || "";

/** Spreadsheet/typed class ("4", "Year 4", "4A") → the stored class name from Classes & Subjects. */
export function resolveClass(cell: string, catalog?: Catalog): string {
  const v = (cell || "").trim();
  if (!v || !catalog) return v;
  const exact = catalog.classes.find((c) => c.name.toLowerCase() === v.toLowerCase());
  if (exact) return exact.name;
  const n = clsNum(v.replace(/[A-Za-z]+$/, "")) || clsNum(v);
  return catalog.classes.find((c) => clsNum(c.name) === n)?.name || v;
}
/** Section letter ("A", "4A") within a class → the stored section name. */
export function resolveSection(cell: string, cls: string, catalog?: Catalog): string {
  const v = (cell || "").trim();
  if (!v || !catalog) return v;
  const inCls = catalog.sections.filter((s) => s.cls === cls);
  const hit = inCls.find((s) => s.name.toLowerCase() === v.toLowerCase()) || inCls.find((s) => secLetter(s.name).toLowerCase() === secLetter(v).toLowerCase());
  return hit?.name || v;
}
