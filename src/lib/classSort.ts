/** t422: one school order everywhere — FS1, FS2, then Year 1 … Year 13; sections A, B, C within a year. */
export function clsRank(v: string): number {
  const s = String(v || "").trim().toLowerCase();
  const n = Number((s.match(/\d+/) || ["0"])[0]);
  if (/^(nursery|pre)/.test(s)) return 0;
  if (/^(fs|eyfs|foundation|kg|reception)/.test(s)) return 10 + n;
  if (/^(y|year|yr|grade|g)\s*\d/.test(s) || /^\d/.test(s)) return 100 + n;
  return 1000;
}
export function clsCmp(a: string, b: string): number {
  const [ac, as = ""] = String(a || "").split("|");
  const [bc, bs = ""] = String(b || "").split("|");
  return clsRank(ac) - clsRank(bc) || ac.localeCompare(bc, undefined, { numeric: true }) || as.localeCompare(bs, undefined, { numeric: true });
}
export const sortCls = <T extends string>(xs: T[]) => [...xs].sort(clsCmp);
export const sortBy = <T>(xs: T[], key: (x: T) => string) => [...xs].sort((a, b) => clsCmp(key(a), key(b)));
