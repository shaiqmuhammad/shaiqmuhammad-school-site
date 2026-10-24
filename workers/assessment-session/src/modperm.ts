/**
 * t292: module permissions for the Assessment Tracker (trk), Department Report (rep) and the
 * Attainment & Progress report (aps = the tracker attainment & progress summary shown in the Department Report).
 * Layers (later wins): all on -> global -> role (teacher / inspector) -> subject (any of the user's subjects that turns a key off wins)
 * -> per-user perms "mp:<mod>:<key>:on|off". Admin always has everything. Show or View off => the whole module is off.
 */
type Sql = { exec: (q: string, ...b: unknown[]) => { toArray: () => Record<string, unknown>[] } };
type Act = { role: string; perms?: string[]; subj?: string[] };
export const MP_MODS = ["trk", "rep", "aps", "tt", "lp"] as const;
export const MP_KEYS = ["show", "view", "add", "edit", "delete", "xlsx", "pdf", "isams", "share"] as const;
export type MpMod = (typeof MP_MODS)[number];
export type MpKey = (typeof MP_KEYS)[number];
export type MpAcc = Record<MpKey, boolean>;
type Part = Partial<Record<MpMod, Partial<MpAcc>>>;
export type MpCfg = { global: Part; roles: Record<string, Part>; subjects: Record<string, Part> };
export const MP_PERM = /^mp:(trk|rep|aps|tt|lp):(show|view|add|edit|delete|xlsx|pdf|isams|share):(on|off)$/;
const pick = (o: unknown): Part => {
  const out: Part = {}; const x = (o && typeof o === "object" ? o : {}) as Record<string, Record<string, unknown>>;
  for (const m of MP_MODS) { const r: Partial<MpAcc> = {}; for (const k of MP_KEYS) if (typeof x[m]?.[k] === "boolean") r[k] = x[m][k] as boolean; if (Object.keys(r).length) out[m] = r; }
  return out;
};
const norm = (v: Record<string, unknown>): MpCfg => {
  const roles: Record<string, Part> = {}; for (const r of ["teacher", "inspector"]) roles[r] = pick((v.roles as Record<string, unknown> | undefined)?.[r]);
  const subjects: Record<string, Part> = {}; for (const [s, p] of Object.entries((v.subjects as Record<string, unknown>) || {}).slice(0, 40)) { const q = pick(p); if (Object.keys(q).length) subjects[s.slice(0, 60)] = q; }
  return { global: pick(v.global), roles, subjects };
};
export function mpCfg(sql: Sql): MpCfg {
  let v: Record<string, unknown> = {};
  try { v = JSON.parse(String(sql.exec(`SELECT v FROM settings WHERE k='mod_access'`).toArray()[0]?.v || "{}")); } catch { /* defaults */ }
  return norm(v);
}
export function mpSave(sql: Sql, raw: unknown): MpCfg {
  const cfg = norm((raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>);
  sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('mod_access', ?)`, JSON.stringify(cfg));
  return cfg;
}
export function mpOf(sql: Sql, a: Act, mod: MpMod, cfg = mpCfg(sql)): MpAcc {
  const out = Object.fromEntries(MP_KEYS.map((k) => [k, true])) as MpAcc;
  if (a.role === "admin") return out;
  Object.assign(out, cfg.global[mod] || {}, cfg.roles[a.role]?.[mod] || {});
  for (const k of MP_KEYS) { const vals = (a.subj || []).map((s) => cfg.subjects[s]?.[mod]?.[k]).filter((x) => typeof x === "boolean"); if (vals.length) out[k] = !vals.includes(false); }
  for (const p of a.perms || []) { const m = MP_PERM.exec(p); if (m && m[1] === mod) out[m[2] as MpKey] = m[3] === "on"; }
  if (!out.show || !out.view) for (const k of MP_KEYS) out[k] = false;
  return out;
}
export const mpAll = (sql: Sql, a: Act) => { const cfg = mpCfg(sql); return Object.fromEntries(MP_MODS.map((m) => [m, mpOf(sql, a, m, cfg)])) as Record<MpMod, MpAcc>; };
