/** t349: Phase / Department / Subject / Class / Section come from the admin "Classes & Subjects" catalog (single source). Old rules are only a fallback. */
type Sql = { exec: (q: string, ...b: unknown[]) => { toArray: () => Record<string, unknown>[] } };
export const DEFAULT_PHASES = ["EYFS", "Primary", "Secondary"];
let CAT: { phases: string[]; deptOf: Map<string, string>; phaseOf: Map<string, string> } | null = null;
export function loadCat(sql: Sql) {
  try {
    const rows = sql.exec(`SELECT id, kind, name, parent FROM catalog ORDER BY ord, name`).toArray();
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const phases = rows.filter((r) => r.kind === "phase").map((r) => String(r.name));
    const deptOf = new Map<string, string>(), phaseOf = new Map<string, string>();
    for (const r of rows) {
      if (r.kind === "subject" && r.parent && byId.get(String(r.parent))?.kind === "dept") deptOf.set(String(r.name), String(byId.get(String(r.parent))!.name));
      if (r.kind === "class" && r.parent && byId.get(String(r.parent))?.kind === "phase") phaseOf.set(String(r.name), String(byId.get(String(r.parent))!.name));
    }
    CAT = { phases: phases.length ? phases : DEFAULT_PHASES, deptOf, phaseOf };
  } catch { CAT = null; }
  return CAT;
}
export const catPhases = () => CAT?.phases || DEFAULT_PHASES;
export const ruleDept = (subj: string) => subj.replace(/\s*[–-]?\s*\b[AB]$/u, "").trim() || subj;
export const rulePhase = (cls: string) => (/^(fs|eyfs|foundation|reception|nursery|kg)/i.test(cls.trim()) ? "EYFS" : (() => { const n = Number((cls.match(/\d+/) || [""])[0]); return !n ? "" : n <= 2 ? "EYFS" : n <= 6 ? "Primary" : "Secondary"; })());
export const catDept = (subj: string) => CAT?.deptOf.get(subj) || ruleDept(subj);
export const catPhase = (cls: string) => CAT?.phaseOf.get(cls) || rulePhase(cls);
