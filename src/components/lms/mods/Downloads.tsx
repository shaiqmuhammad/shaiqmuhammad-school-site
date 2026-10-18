"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cardCls, field, Head, Toast, useRoster } from "@/components/lms/mods/ModUi";
import { useTr } from "@/components/lms/useLms";
import { modCall, modErr } from "@/lib/lmsMods";

type Sw = { audio?: boolean; export?: boolean };
type Cfg = { students?: Sw; classes?: Record<string, Sw> };

/** Admin → Downloads: allow / block audio-file and Excel/PDF downloads for students (all, or per class). Teachers are set per teacher in Module access. */
export function AdminDownloads() {
  const { tr } = useTr();
  const { students } = useRoster(true);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState(""); const [bad, setBad] = useState(false);
  const classes = useMemo(() => [...new Set((students || []).map((s) => s.cls))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [students]);
  useEffect(() => { modCall<Cfg>("dl-get", undefined, true).then(setCfg).catch((e) => { setCfg({}); setMsg(modErr(e, tr)); setBad(true); }); }, [tr]);
  const save = useCallback(async (next: Cfg) => {
    setCfg(next);
    try { const r = await modCall<Cfg>("dl-set", next, true); setCfg(r); setMsg(tr("Saved. Applies immediately to students.", "تم الحفظ. يسري فورًا على الطلاب.")); setBad(false); } catch (e) { setMsg(modErr(e, tr), ); setBad(true); }
  }, [tr]);
  if (!cfg) return <p className="py-8 text-center opacity-60">{tr("Loading…", "جارٍ التحميل…")}</p>;
  const g = (k: "audio" | "export") => cfg.students?.[k] !== false;
  const setG = (k: "audio" | "export", on: boolean) => save({ ...cfg, students: { ...cfg.students, [k]: on } });
  const ov = (c: string, k: "audio" | "export") => { const v = cfg.classes?.[c]?.[k]; return v === undefined ? "" : v ? "1" : "0"; };
  const setOv = (c: string, k: "audio" | "export", v: string) => {
    const cur = { ...(cfg.classes?.[c] || {}) } as Sw;
    if (v === "") delete cur[k]; else cur[k] = v === "1";
    const classes = { ...(cfg.classes || {}) }; if (Object.keys(cur).length) classes[c] = cur; else delete classes[c];
    save({ ...cfg, classes });
  };
  const row = (k: "audio" | "export", en: string, ar: string) => (
    <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5" checked={g(k)} onChange={(e) => setG(k, e.target.checked)} data-testid={`dl-student-${k}`} /> {tr(en, ar)}</label>
  );
  return (
    <div className="space-y-4" data-testid="admin-downloads">
      <Head icon="⬇️" title={tr("Downloads", "التنزيلات")} sub={tr("Allow or block downloads. Students can still play audio on the page. Teachers are set per teacher (Teachers → Module access).", "السماح بالتنزيل أو منعه. يبقى تشغيل الصوت متاحًا في الصفحة. المعلمون يُضبطون لكل معلم (المعلمون ← صلاحيات الوحدات).")} />
      <Toast msg={msg} bad={bad} />
      <section className={cardCls + " space-y-3"}>
        <h3 className="font-extrabold">🎒 {tr("All students", "كل الطلاب")}</h3>
        {row("audio", "Allow downloading audio recordings", "السماح بتنزيل التسجيلات الصوتية")}
        {row("export", "Allow Excel / PDF downloads (results, certificates, reports)", "السماح بتنزيل إكسل / PDF (النتائج، الشهادات، التقارير)")}
      </section>
      <section className={cardCls}>
        <h3 className="mb-1 font-extrabold">🏫 {tr("Per-class override", "استثناء لكل صف")}</h3>
        <p className="mb-3 text-xs opacity-70">{tr("“Default” follows the all-students switch above.", "«افتراضي» يتبع مفتاح كل الطلاب أعلاه.")}</p>
        {!classes.length ? <p className="text-sm opacity-60">{tr("No classes yet.", "لا توجد صفوف بعد.")}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-start"><th className="py-1 text-start">{tr("Class", "الصف")}</th><th className="text-start">{tr("Audio download", "تنزيل الصوت")}</th><th className="text-start">{tr("Excel / PDF", "إكسل / PDF")}</th></tr></thead>
            <tbody>{classes.map((c) => (
              <tr key={c} className="border-t border-black/10 dark:border-white/10" data-testid="dl-class-row">
                <td className="py-1.5 font-semibold" dir="auto">{c}</td>
                {(["audio", "export"] as const).map((k) => (
                  <td key={k}><select className={field + " !w-auto !py-1"} value={ov(c, k)} onChange={(e) => setOv(c, k, e.target.value)} data-testid={`dl-class-${k}`} aria-label={`${c} ${k}`}>
                    <option value="">{tr("Default", "افتراضي")}</option><option value="1">{tr("Allow", "سماح")}</option><option value="0">{tr("Block", "منع")}</option>
                  </select></td>
                ))}
              </tr>
            ))}</tbody></table></div>
        )}
      </section>
    </div>
  );
}
