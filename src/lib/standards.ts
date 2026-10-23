import data from "@/data/uaeStandards.json";

/** UAE Islamic Education standards (English + Arabic documents). Outcome code a.b.c.D.Gn: D = field/main skill (1–6), Gn = grade (K1/K2 = KG). */
export type StdDomain = { n: number; en: string; ar: string };
export type StdOutcome = { en: string; ar: string; p: number; pAr: number };
export type UnitStd = { codes: string[]; skill: number };
export const STD_DOMAINS = data.domains as StdDomain[];
export const STD_OUTCOMES = data.outcomes as Record<string, StdOutcome>;
export const domainOf = (n: number) => STD_DOMAINS.find((d) => d.n === n);
export const domainName = (n: number, lang: string) => { const d = domainOf(n); return d ? (lang === "ar" ? d.ar : d.en) : ""; };
export const outcomeText = (code: string, lang: string) => { const o = STD_OUTCOMES[code]; return o ? (lang === "ar" ? o.ar || o.en : o.en || o.ar) : ""; };
/** School Year → UAE grade suffix used in the codes (Year 1 = KG2, Year n = Grade n−1). */
export const gradeOfYear = (yr: string) => { const n = Number(/Year (\d+)/.exec(yr)?.[1]); return !n ? "" : n === 1 ? "K2" : `G${n - 1}`; };
export const outcomesFor = (yr: string) => { const g = gradeOfYear(yr); return Object.keys(STD_OUTCOMES).filter((c) => !g || c.endsWith(`.${g}`)).sort((a, b) => a.split(".")[3].localeCompare(b.split(".")[3]) || a.localeCompare(b)); };
export const codeSkill = (code: string) => Number(code.split(".")[3]) || 0;
export const parseStdCell = (codes: string, skill: string): UnitStd => ({ codes: [...new Set(codes.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[1-9]\.\d{1,2}\.\d{1,2}\.[1-6]\.(G\d{1,2}|K[12])$/.test(x)))], skill: Number(/^\s*(\d)/.exec(skill)?.[1]) || 0 });
