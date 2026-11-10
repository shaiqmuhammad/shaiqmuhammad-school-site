"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { BACKUP_FORMAT, backupApi, BackupError, type BackupFreq, type BackupItem, type BackupKind, type BackupRun, type BackupStatus } from "@/lib/backup";

const btn = "rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60";
const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm disabled:opacity-60";
const card = "space-y-4 rounded-2xl border border-card-border bg-card-solid p-5 shadow-sm";
const input = "mt-1.5 w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

const size = (n?: number) => (!n ? "—" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Admin → Settings → Backup: one-click download, automatic daily / weekly / monthly backups, saved backups, restore. */
export default function AdminBackup() {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const when = (t: number) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-AE" : "en-GB", { timeZone: "Asia/Dubai", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t));
  const dubai = tr("Dubai time", "بتوقيت دبي");
  const errMsg = (e: unknown) => {
    const m = e instanceof BackupError ? e.message : "error";
    if (m === "unauthorized" || (e instanceof BackupError && e.status === 401)) return tr("Your admin sign-in has expired. Sign out and sign in again.", "انتهت جلسة الإدارة. سجّل الخروج ثم الدخول مجددًا.");
    if (m === "admin_only") return tr("Only the admin can use backups (not while viewing as someone else).", "النسخ الاحتياطي للمدير فقط (وليس أثناء العرض كمستخدم آخر).");
    if (m === "network") return tr("Could not reach the school server. Check your internet connection and try again.", "تعذّر الوصول إلى خادم المدرسة. تحقّق من الاتصال وحاول مجددًا.");
    if (m === "not_a_backup") return tr("This file is not a backup made by this page.", "هذا الملف ليس نسخة احتياطية من هذه الصفحة.");
    return tr(`Something went wrong (${m}). Please try again.`, `حدث خطأ (${m}). حاول مجددًا.`);
  };
  const kindLabel = (k: BackupKind) =>
    ({ manual: tr("Made by you", "يدوية"), daily: tr("Daily (automatic)", "يومية (تلقائية)"), weekly: tr("Weekly (automatic)", "أسبوعية (تلقائية)"), monthly: tr("Monthly (automatic)", "شهرية (تلقائية)"), "before-restore": tr("Safety copy before a restore", "نسخة أمان قبل الاستعادة") })[k] || k;

  const [st, setSt] = useState<BackupStatus | null>(null);
  const [items, setItems] = useState<BackupItem[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [withData, setWithData] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [freq, setFreq] = useState<BackupFreq>("off");
  const [autoData, setAutoData] = useState(true);
  const [schedMsg, setSchedMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<{ ok: boolean; includeData?: boolean; createdAt?: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await backupApi.status();
      setSt(s);
      setFreq(s.cfg.freq);
      setAutoData(s.cfg.includeData !== false);
      setItems(await backupApi.list());
      setLoadErr("");
    } catch (e) {
      setLoadErr(errMsg(e));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/set-state-in-effect -- first load from the server
  useEffect(() => { void load(); }, [load]);

  const downloadNow = async () => {
    setBusy("run"); setMsg(null);
    try {
      const item = await backupApi.run(withData);
      setMsg({ ok: true, text: tr("Backup ready — saving the file to your computer…", "النسخة جاهزة — جارٍ حفظ الملف على جهازك…") });
      await backupApi.download(item);
      setMsg({ ok: true, text: tr(`Done. “${item.fileName}” is in your Downloads folder (${size(item.size)}). A copy is also kept under “Saved backups”.`, `تم. الملف «${item.fileName}» في مجلد التنزيلات (${size(item.size)}). ونسخة محفوظة أيضًا في «النسخ المحفوظة».`) });
      load();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally { setBusy(""); }
  };

  const saveSchedule = async () => {
    setBusy("sched"); setSchedMsg("");
    try {
      const r = await backupApi.saveSchedule(freq, autoData);
      setSchedMsg(r.cfg.freq === "off" ? tr("Saved. Automatic backups are off.", "تم الحفظ. النسخ التلقائي متوقف.") : tr(`Saved. Automatic backups are on — the first one runs ${r.nextRun ? when(r.nextRun) : ""} (${dubai}).`, `تم الحفظ. النسخ التلقائي يعمل — أول نسخة ${r.nextRun ? when(r.nextRun) : ""} (${dubai}).`));
      load();
    } catch (e) { setSchedMsg(errMsg(e)); } finally { setBusy(""); }
  };

  const pickFile = async (f: File | null) => {
    setFile(f); setTyped(""); setRestoreMsg(null); setFileInfo(null);
    if (!f) return;
    const head = await f.slice(0, 600).text().catch(() => "");
    if (!head.includes(`"format":"${BACKUP_FORMAT}"`)) { setFileInfo({ ok: false }); return; }
    setFileInfo({ ok: true, includeData: /"includeData":true/.test(head), createdAt: head.match(/"createdAt":"([^"]+)"/)?.[1] });
  };
  const doRestore = async () => {
    if (!file || typed.trim() !== "RESTORE") return;
    if (!window.confirm(tr("Last check: replace the live school data with this backup now?", "تأكيد أخير: استبدال بيانات المدرسة الحالية بهذه النسخة الآن؟"))) return;
    setBusy("restore"); setRestoreMsg(null);
    try {
      const r = await backupApi.restore(file);
      setRestoreMsg({ ok: true, text: tr(`Restore finished: ${r.rows.toLocaleString()} records in ${r.tables} tables were put back. A safety copy of what was live just before is listed under “Saved backups”. Reload the page to see the restored data.`, `اكتملت الاستعادة: أُعيد ${r.rows.toLocaleString()} سجلًا في ${r.tables} جدولًا. نسخة أمان لما كان قبل الاستعادة موجودة في «النسخ المحفوظة». أعد تحميل الصفحة لرؤية البيانات.`) });
      setFile(null); setFileInfo(null); setTyped("");
      load();
    } catch (e) { setRestoreMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(""); }
  };

  const del = async (it: BackupItem) => {
    if (!window.confirm(tr(`Delete the backup from ${when(it.created)}? This cannot be undone.`, `حذف النسخة بتاريخ ${when(it.created)}؟ لا يمكن التراجع.`))) return;
    setBusy(`del:${it.key}`);
    try { await backupApi.remove(it.key); setItems((l) => (l || []).filter((x) => x.key !== it.key)); } catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(""); }
  };
  const dl = async (it: BackupItem) => {
    setBusy(`dl:${it.key}`);
    try { await backupApi.download(it); } catch (e) { setMsg({ ok: false, text: errMsg(e) }); } finally { setBusy(""); }
  };

  const runLine = (r: BackupRun | undefined, empty: string) =>
    !r ? <span className="text-muted">{empty}</span> : r.ok
      ? <span className="text-emerald-700 dark:text-emerald-300">✓ {tr("Worked", "نجحت")} — {when(r.at)} ({dubai}) · {r.includeData ? tr("with all school data", "مع كل بيانات المدرسة") : tr("settings only", "الإعدادات فقط")} · {size(r.size)}</span>
      : <span className="text-rose-700 dark:text-rose-300">✗ {tr("Did not work", "لم تنجح")} — {when(r.at)} ({dubai}). {tr("It will try again at the next scheduled time. You can also press “Download backup” above.", "ستُعاد المحاولة في الموعد التالي. يمكنك أيضًا الضغط على «تنزيل نسخة احتياطية» أعلاه.")}</span>;

  const dataToggle = ({ on, set, id, label }: { on: boolean; set: (v: boolean) => void; id: string; label: string }) => (
    <label className="flex cursor-pointer items-start gap-3 text-sm" htmlFor={id}>
      <input id={id} type="checkbox" className="peer sr-only" checked={on} onChange={(e) => set(e.target.checked)} data-testid={id} />
      <span aria-hidden className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition peer-focus-visible:ring-2 peer-focus-visible:ring-sun/60 ${on ? "bg-primary" : "bg-black/20 dark:bg-white/20"}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5 rtl:-translate-x-5" : ""}`} />
      </span>
      <span><span className="font-semibold">{label}</span><br /><span className="text-xs text-muted">{on
        ? tr("Everything needed to bring the school system back: students, teachers, classes, curriculum, assessments, homework, messages, results, files and settings.", "كل ما يلزم لإعادة نظام المدرسة: الطلاب والمعلمون والصفوف والمنهج والتقييمات والواجبات والرسائل والنتائج والملفات والإعدادات.")
        : tr("Settings and structure only: site pages and settings, subjects, classes and school setup. No students, staff, PINs, homework, messages, results, forum posts, attendance, rewards or uploaded files.", "الإعدادات والهيكل فقط: صفحات الموقع وإعداداته والمواد والصفوف وإعداد المدرسة. بدون طلاب أو موظفين أو رموز دخول أو واجبات أو رسائل أو نتائج أو منتدى أو حضور أو مكافآت أو ملفات.")}</span></span>
    </label>
  );

  const FREQS: [BackupFreq, string, string][] = [
    ["off", tr("Off", "متوقف"), tr("No automatic backups", "بدون نسخ تلقائي")],
    ["daily", tr("Every day", "كل يوم"), tr("About 2:15 AM, Dubai time", "حوالي ٢:١٥ صباحًا بتوقيت دبي")],
    ["weekly", tr("Every week", "كل أسبوع"), tr("Sundays, about 2:15 AM", "الأحد، حوالي ٢:١٥ صباحًا")],
    ["monthly", tr("Every month", "كل شهر"), tr("On the 1st, about 2:15 AM", "يوم ١ من كل شهر، حوالي ٢:١٥ صباحًا")],
  ];
  const dirty = !!st && (freq !== st.cfg.freq || autoData !== (st.cfg.includeData !== false));

  return (
    <section className="space-y-6" data-testid="admin-backup">
      <div>
        <h2>{tr("Backup", "النسخ الاحتياطي")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{tr("A backup is a copy of the live school system (and, if you choose, all school data) that you can keep and use to put things back later. The website code itself is already kept safely in GitHub, so this page does not download the website files.", "النسخة الاحتياطية نسخة من نظام المدرسة الحالي (ومن كل بيانات المدرسة إن اخترت) تحتفظ بها لتعيد الأمور لاحقًا. شيفرة الموقع نفسها محفوظة في GitHub، لذلك لا تنزّل هذه الصفحة ملفات الموقع.")}</p>
      </div>
      {loadErr && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200" role="alert">{loadErr}</p>}

      <Card title={tr("1. Download a backup now", "١. تنزيل نسخة احتياطية الآن")}>
        {dataToggle({ id: "backup-include-data", on: withData, set: setWithData, label: tr("Include all school data", "تضمين كل بيانات المدرسة") })}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btn} onClick={downloadNow} disabled={!!busy} data-testid="backup-download">{busy === "run" ? tr("Making the backup…", "جارٍ إنشاء النسخة…") : tr("Download backup", "تنزيل نسخة احتياطية")}</button>
          {busy === "run" && <span className="text-xs text-muted">{tr("This can take up to a minute. Keep this page open.", "قد يستغرق ذلك دقيقة. أبقِ الصفحة مفتوحة.")}</span>}
        </div>
        {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`} role="status">{msg.text}</p>}
      </Card>

      <Card title={tr("2. Automatic backups", "٢. النسخ الاحتياطي التلقائي")}>
        <p className="text-sm text-muted">{tr("Choose how often, then press Save. Backups then run by themselves on the school server — your computer does not need to be on.", "اختر عدد المرات ثم اضغط حفظ. تعمل النسخ بعدها تلقائيًا على خادم المدرسة — لا يلزم أن يكون جهازك مشغّلًا.")}</p>
        <div className="grid gap-2 sm:grid-cols-4" role="radiogroup" aria-label={tr("How often", "عدد المرات")}>
          {FREQS.map(([id, en, sub]) => (
            <label key={id} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition ${freq === id ? "border-primary bg-primary/10 font-semibold" : "border-card-border hover:bg-black/[0.03] dark:hover:bg-white/5"}`}>
              <input type="radio" name="backup-freq" className="sr-only" checked={freq === id} onChange={() => setFreq(id)} data-testid={`backup-freq-${id}`} />
              <span className="block">{en}</span><span className="block text-xs font-normal text-muted">{sub}</span>
            </label>
          ))}
        </div>
        {freq !== "off" && dataToggle({ id: "backup-auto-data", on: autoData, set: setAutoData, label: tr("Include all school data in automatic backups", "تضمين كل بيانات المدرسة في النسخ التلقائية") })}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btn} onClick={saveSchedule} disabled={!!busy || !st} data-testid="backup-save-schedule">{busy === "sched" ? tr("Saving…", "جارٍ الحفظ…") : tr("Save", "حفظ")}</button>
          {dirty && <span className="text-xs text-amber-700 dark:text-amber-300">{tr("Not saved yet", "لم يُحفظ بعد")}</span>}
          {schedMsg && <span className="text-sm" role="status">{schedMsg}</span>}
        </div>
        {st && (
          <dl className="grid gap-1 rounded-xl bg-black/[0.03] p-3 text-sm dark:bg-white/5">
            <div><dt className="inline font-semibold">{tr("Next automatic backup: ", "النسخة التلقائية التالية: ")}</dt><dd className="inline">{st.nextRun ? `${when(st.nextRun)} (${dubai})` : tr("none — automatic backups are off", "لا يوجد — النسخ التلقائي متوقف")}</dd></div>
            <div><dt className="inline font-semibold">{tr("Last automatic backup: ", "آخر نسخة تلقائية: ")}</dt><dd className="inline">{runLine(st.status.lastAuto, tr("none yet", "لا يوجد بعد"))}</dd></div>
            <div className="text-xs text-muted">{tr(`Old backups are cleared automatically: we keep the last ${st.keep.daily} daily, ${st.keep.weekly} weekly and ${st.keep.monthly} monthly backups.`, `تُحذف النسخ القديمة تلقائيًا: نحتفظ بآخر ${st.keep.daily} يومية و${st.keep.weekly} أسبوعية و${st.keep.monthly} شهرية.`)}</div>
          </dl>
        )}
      </Card>

      <Card title={tr("3. Saved backups", "٣. النسخ المحفوظة")}>
        <p className="text-sm text-muted">{tr("Backups kept on the school server. Download any of them to keep a copy on your computer or a USB drive.", "نسخ محفوظة على خادم المدرسة. نزّل أيًّا منها للاحتفاظ بنسخة على جهازك أو على ذاكرة USB.")}</p>
        {items === null ? <p className="text-sm text-muted">{loadErr ? "—" : tr("Loading…", "جارٍ التحميل…")}</p> : items.length === 0 ? <p className="text-sm text-muted">{tr("No saved backups yet.", "لا توجد نسخ محفوظة بعد.")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="backup-list">
              <thead><tr className="border-b border-card-border text-start text-xs uppercase tracking-wide text-muted"><th className="py-2 text-start">{tr("Date and time", "التاريخ والوقت")} ({dubai})</th><th className="text-start">{tr("Type", "النوع")}</th><th className="text-start">{tr("Contents", "المحتوى")}</th><th className="text-start">{tr("Size", "الحجم")}</th><th /></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.key} className="border-b border-card-border/60 last:border-0">
                    <td className="py-2 pe-3">{when(it.created)}</td>
                    <td className="pe-3">{kindLabel(it.kind)}</td>
                    <td className="pe-3">{it.includeData ? tr("Full (with data)", "كاملة (مع البيانات)") : tr("Settings only", "الإعدادات فقط")}</td>
                    <td className="pe-3">{size(it.size)}</td>
                    <td className="whitespace-nowrap py-1.5 text-end">
                      <button type="button" className={btnGhost} onClick={() => dl(it)} disabled={!!busy}>{busy === `dl:${it.key}` ? tr("Downloading…", "جارٍ التنزيل…") : tr("Download", "تنزيل")}</button>{" "}
                      <button type="button" className={`${btnGhost} text-rose-700 dark:text-rose-300`} onClick={() => del(it)} disabled={!!busy}>{tr("Delete", "حذف")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={tr("4. Restore from a backup", "٤. الاستعادة من نسخة احتياطية")}>
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
          <strong>{tr("Warning: ", "تحذير: ")}</strong>{tr("restoring replaces the matching live data with what is in the backup file. Anything added or changed since that backup will be lost. It cannot be undone except by restoring another backup. A safety copy of the current system is saved automatically just before the restore starts.", "الاستعادة تستبدل البيانات الحالية المطابقة بما في ملف النسخة. سيضيع كل ما أُضيف أو عُدّل بعد تلك النسخة، ولا يمكن التراجع إلا باستعادة نسخة أخرى. تُحفظ نسخة أمان من النظام الحالي تلقائيًا قبل بدء الاستعادة.")}
        </p>
        <label className="block text-sm font-medium">{tr("Backup file (.json made by this page)", "ملف النسخة (.json من هذه الصفحة)")}
          <input type="file" accept=".json,application/json" className={input} onChange={(e) => pickFile(e.target.files?.[0] || null)} data-testid="backup-restore-file" />
        </label>
        {fileInfo && !fileInfo.ok && <p className="text-sm text-rose-700 dark:text-rose-300">{tr("This file is not a backup made by this page.", "هذا الملف ليس نسخة احتياطية من هذه الصفحة.")}</p>}
        {file && fileInfo?.ok && (
          <div className="space-y-3">
            <p className="text-sm">{tr("Backup from ", "نسخة بتاريخ ")}<strong>{fileInfo.createdAt ? `${when(Date.parse(fileInfo.createdAt))} (${dubai})` : "—"}</strong> · {fileInfo.includeData ? tr("full, with all school data", "كاملة مع كل بيانات المدرسة") : tr("settings only (school data will not be touched)", "الإعدادات فقط (لن تُمس بيانات المدرسة)")} · {size(file.size)}</p>
            <label className="block text-sm font-medium">{tr("To confirm, type RESTORE in capital letters", "للتأكيد اكتب RESTORE بأحرف كبيرة")}
              <input className={input + " max-w-xs font-mono"} dir="ltr" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="RESTORE" autoComplete="off" data-testid="backup-restore-confirm" />
            </label>
            <button type="button" className="rounded-full bg-rose-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={typed.trim() !== "RESTORE" || !!busy} onClick={doRestore} data-testid="backup-restore-go">{busy === "restore" ? tr("Restoring… keep this page open", "جارٍ الاستعادة… أبقِ الصفحة مفتوحة") : tr("Restore this backup", "استعادة هذه النسخة")}</button>
          </div>
        )}
        {restoreMsg && <p className={`text-sm ${restoreMsg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`} role="status">{restoreMsg.text}</p>}
      </Card>
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={card}>
      <h3 className="text-base font-bold">{title}</h3>
      {children}
    </div>
  );
}
