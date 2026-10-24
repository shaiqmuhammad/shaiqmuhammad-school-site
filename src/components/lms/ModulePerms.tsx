"use client";
import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, MP_KEYS, MP_MODS, type MpCfg, type MpKey, type MpMod, type MpPart } from "@/lib/lms";

/** t292: labels for the module permission switches. */
export const MP_MOD_LABEL: Record<MpMod, [string, string]> = { trk: ["📊 Assessment Tracker", "📊 متتبع التقييم"], rep: ["📈 Department Report", "📈 تقرير القسم"], aps: ["🎯 Attainment & Progress Report", "🎯 تقرير التحصيل والتقدم"], tt: ["🗓️ Timetable", "🗓️ الجدول الدراسي"] };
export const MP_KEY_LABEL: Record<MpKey, [string, string]> = { show: ["Show", "إظهار"], view: ["View", "عرض"], add: ["Add", "إضافة"], edit: ["Edit", "تعديل"], delete: ["Delete", "حذف"], xlsx: ["Download Excel", "تنزيل Excel"], pdf: ["Download PDF", "تنزيل PDF"], isams: ["Download iSAMS", "تنزيل iSAMS"] };
/** Keys that do something in each module (others are hidden): the report is read-only for teachers; iSAMS exists only in the tracker. */
export const MP_KEYS_OF: Record<MpMod, MpKey[]> = { trk: [...MP_KEYS], rep: ["show", "view", "xlsx", "pdf"], aps: ["show", "view"], tt: ["show", "view", "add", "edit", "delete"] };
const sel = "rounded-lg border border-black/15 bg-white px-1 py-0.5 text-xs dark:border-white/20 dark:bg-slate-900";

/** Tri-state grid: "" = inherit, on, off. */
function Grid({ get, set, inherit, testPrefix }: { get: (m: MpMod, k: MpKey) => "" | "on" | "off"; set: (m: MpMod, k: MpKey, v: "" | "on" | "off") => void; inherit: string; testPrefix: string }) {
  const { tr } = useTr();
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {MP_MODS.map((m) => (
        <div key={m} className="space-y-1 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/5" data-testid={`${testPrefix}-${m}`}>
          <p className="text-sm font-semibold">{tr(...MP_MOD_LABEL[m])}</p>
          {MP_KEYS.filter((k) => k !== "isams" || m === "trk").map((k) => { const live = MP_KEYS_OF[m].includes(k); return (
            <label key={k} className={`flex items-center justify-between gap-2 text-xs ${live ? "" : "opacity-50"}`} title={live ? "" : tr("Teachers have nothing to change or download here; admin only.", "لا يوجد ما يعدّله المعلم هنا.")}>{tr(...MP_KEY_LABEL[k])}
              <select className={sel} disabled={!live} value={live ? get(m, k) : ""} onChange={(e) => set(m, k, e.target.value as "" | "on" | "off")} data-testid={`${testPrefix}-${m}-${k}`}>
                <option value="">{inherit}</option>
                <option value="on">{k === "show" || k === "view" ? tr("Show", "إظهار") : tr("Allow", "سماح")}</option>
                <option value="off">{k === "show" || k === "view" ? tr("Hide", "إخفاء") : tr("Not allow", "منع")}</option>
              </select></label>); })}
        </div>))}
    </div>
  );
}

/** Per-teacher switches, stored as perms "mp:<mod>:<key>:on|off". */
export function ModulePermsTeacher({ perms, setPerms }: { perms: string[]; setPerms: (p: string[]) => void }) {
  const { tr } = useTr();
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-black/15 p-3 dark:border-white/20" data-testid="perm-mp">
      <p className="text-sm font-bold">🛡️ {tr("Timetable, tracker & report modules — Show/Hide, View, Add, Edit, Delete", "الجدول والمتتبع والتقارير — إظهار/إخفاء، عرض، إضافة، تعديل، حذف")}</p>
      <Grid testPrefix="perm-mp" inherit={tr("Default", "الافتراضي")}
        get={(m, k) => (perms.includes(`mp:${m}:${k}:on`) ? "on" : perms.includes(`mp:${m}:${k}:off`) ? "off" : "")}
        set={(m, k, v) => setPerms([...perms.filter((p) => p !== `mp:${m}:${k}:on` && p !== `mp:${m}:${k}:off`), ...(v ? [`mp:${m}:${k}:${v}`] : [])])} />
      <p className="text-[11px] opacity-70">{tr("Default = the global, role and subject settings in Assessment → Attainment & Progress Systems → Module permissions. The server enforces these; admin always has full access.", "الافتراضي من الإعدادات العامة. يُطبَّق على الخادم؛ للمدير وصول كامل.")}</p>
    </div>
  );
}

/** Global defaults: global, per role (Teacher, Inspector) and per subject. */
export function ModulePermsGlobal() {
  const { tr } = useTr();
  const [cfg, setCfg] = useState<MpCfg | null>(null);
  const [layer, setLayer] = useState("global");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { lmsApi.modpermGet().then((r) => setCfg(r.cfg)).catch((e) => setMsg(String((e as Error).message))); lmsApi.catalog(true).then((c) => setSubjects(c.subjects.map((x) => x.name))).catch(() => undefined); }, []);
  if (!cfg) return <p className="text-sm opacity-70" data-testid="mp-global">{msg || "…"}</p>;
  const part = (): MpPart => (layer === "global" ? cfg.global : layer.startsWith("role:") ? cfg.roles[layer.slice(5)] || {} : cfg.subjects[layer.slice(5)] || {});
  const put = (p: MpPart) => setCfg(layer === "global" ? { ...cfg, global: p } : layer.startsWith("role:") ? { ...cfg, roles: { ...cfg.roles, [layer.slice(5)]: p } } : { ...cfg, subjects: { ...cfg.subjects, [layer.slice(5)]: p } });
  const save = async () => { try { setCfg((await lmsApi.modpermSave(cfg)).cfg); setMsg(tr("Saved.", "تم الحفظ.")); } catch (e) { setMsg(String((e as Error).message)); } setTimeout(() => setMsg(""), 4000); };
  return (
    <section className="space-y-2 rounded-2xl border border-card-border bg-white/80 p-4 dark:bg-white/5" data-testid="mp-global">
      <h3 className="font-extrabold">🛡️ {tr("Module permissions — Timetable, Assessment Tracker, Department Report, Attainment & Progress Report", "صلاحيات الوحدات")}</h3>
      <p className="text-xs opacity-70">{tr("Order: global → role → subject → each teacher (Teachers › Permissions). Admin always has full access.", "الترتيب: عام ← الدور ← المادة ← المعلم. للمدير وصول كامل.")}</p>
      <label className="text-xs font-bold">{tr("Apply to", "تطبيق على")} <select className={sel + " ms-1 !text-sm"} value={layer} onChange={(e) => setLayer(e.target.value)} data-testid="mp-layer">
        <option value="global">{tr("Everyone (global)", "الجميع (عام)")}</option><option value="role:teacher">{tr("Role: Teacher", "الدور: معلم")}</option><option value="role:inspector">{tr("Role: Inspector", "الدور: مفتش")}</option>
        {subjects.map((s) => <option key={s} value={`subj:${s}`}>{tr("Subject", "المادة")}: {s}</option>)}
      </select></label>
      <Grid testPrefix="mp" inherit={layer === "global" ? tr("On (default)", "مفعّل (افتراضي)") : tr("Inherit", "موروث")}
        get={(m, k) => { const v = part()[m]?.[k]; return v === true ? "on" : v === false ? "off" : ""; }}
        set={(m, k, v) => { const p = { ...part() }; const r = { ...(p[m] || {}) }; if (v) r[k] = v === "on"; else delete r[k]; p[m] = r; put(p); }} />
      <div className="flex items-center gap-2"><button type="button" className="rounded-full bg-header px-4 py-1.5 text-sm font-bold text-sun" onClick={save} data-testid="mp-save">{tr("Save module permissions", "حفظ صلاحيات الوحدات")}</button>{msg && <span className="text-xs font-semibold" role="status">{msg}</span>}</div>
    </section>
  );
}
