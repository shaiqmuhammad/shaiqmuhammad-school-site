"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, type LiveHistoryItem } from "@/lib/lms";
import { fmtTime12, fmtWhen, SITE_TZ } from "@/lib/timeZone";
import { smallBtn } from "@/components/lms/useLms";

function csvEscape(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function LiveHistory({ asAdmin }: { asAdmin: boolean }) {
  const { tr, lang } = useTr();
  const [items, setItems] = useState<LiveHistoryItem[]>([]);
  const [open, setOpen] = useState<string>("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let on = true;
    lmsApi.liveHistory(asAdmin)
      .then((r) => { if (on) { setItems(r.items || []); setErr(""); } })
      .catch((e) => { if (on) setErr(lmsErrorText(e, tr)); })
      .finally(() => { if (on) setBusy(false); });
    return () => { on = false; };
  }, [asAdmin, tr]);

  function downloadCsv(it: LiveHistoryItem) {
    const rows = [
      ["Name", "Class", "Section", "Status", "Time"].join(","),
      ...it.marks.map((m) => [csvEscape(m.name), csvEscape(it.cls), csvEscape(m.section || it.section), m.status === "P" ? "Present" : m.status, m.at ? fmtTime12(m.at, "en", SITE_TZ) : ""].join(",")),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(it.title || "live-lesson").replace(/[^\w\-]+/g, "-")}-${it.day}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printSheet(it: LiveHistoryItem) {
    const when = fmtWhen(it.started, lang, SITE_TZ);
    const rows = it.marks.map((m) => `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.section || it.section)}</td><td>${m.status === "P" ? "Present" : escapeHtml(m.status)}</td><td>${m.at ? escapeHtml(fmtTime12(m.at, lang, SITE_TZ)) : ""}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(it.title)}</title>
<style>body{font-family:Nunito,system-ui,sans-serif;color:#1b2f44;padding:24px}h1{margin:0 0 4px}p{margin:0 0 16px;color:#586a7d}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d5deea;padding:8px 10px;text-align:start}th{background:#1b3a57;color:#fff}@media print{button{display:none}}</style>
</head><body>
<h1>${escapeHtml(it.title)}</h1>
<p>${escapeHtml([it.cls, it.section].filter(Boolean).join(" · "))} · ${escapeHtml(it.period)} · ${escapeHtml(when)} · ${escapeHtml(it.teacherName)} · ${it.present} present</p>
<table><thead><tr><th>Name</th><th>Section</th><th>Status</th><th>Time</th></tr></thead><tbody>${rows || "<tr><td colspan=4>No enrolled students were marked present.</td></tr>"}</tbody></table>
<button onclick="print()">Print</button>
<script>setTimeout(()=>print(),300)</script>
</body></html>`);
    w.document.close();
  }

  if (busy) return <p className="text-sm font-semibold opacity-70">…</p>;
  if (err) return <p className="rounded-2xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-800 dark:bg-rose-900/60 dark:text-rose-100" role="alert">{err}</p>;
  if (!items.length) return <p className="text-sm font-semibold opacity-70">{tr("No live lessons yet.", "لا توجد حصص مباشرة بعد.")}</p>;

  return (
    <ul className="space-y-2" data-testid="live-history">
      {items.map((it) => {
        const shown = open === it.id;
        return (
          <li key={it.id} className="lms-card rounded-2xl p-3 ring-1 ring-black/5 dark:ring-white/10" data-testid="live-history-row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setOpen(shown ? "" : it.id)}>
                <p className="font-black" dir="auto">{it.title}</p>
                <p className="text-xs font-semibold opacity-70">{[it.cls, it.section].filter(Boolean).join(" · ") || tr("Meeting", "اجتماع")} · {fmtWhen(it.started, lang, SITE_TZ)} · {tr(`${it.present} present`, `${it.present} حاضر`)}</p>
              </button>
              <span className="flex flex-wrap gap-1">
                <button type="button" className={smallBtn} disabled={!it.marks.length} onClick={() => downloadCsv(it)} data-testid="live-history-csv">{tr("CSV", "CSV")}</button>
                <button type="button" className={smallBtn} onClick={() => printSheet(it)} data-testid="live-history-print">{tr("Print", "طباعة")}</button>
              </span>
            </div>
            {shown && (
              <div className="mt-3 overflow-auto">
                {!it.cls && <p className="text-xs font-semibold opacity-70">{tr("Meetings that are not tied to a class are not added to the attendance register.", "الاجتماعات غير المرتبطة بصف لا تُضاف إلى سجل الحضور.")}</p>}
                {it.cls && !it.marks.length && <p className="text-xs font-semibold opacity-70">{tr("No enrolled students were marked present.", "لم يُسجَّل حضور لأي طالب مسجّل.")}</p>}
                {!!it.marks.length && (
                  <table className="w-full text-sm">
                    <thead><tr className="text-start text-xs opacity-70"><th className="py-1">{tr("Name", "الاسم")}</th><th>{tr("Status", "الحالة")}</th><th>{tr("Time", "الوقت")}</th></tr></thead>
                    <tbody>
                      {it.marks.map((m) => (
                        <tr key={m.id} className="border-t border-black/10 dark:border-white/10">
                          <td className="py-1 font-bold" dir="auto">{m.name}</td>
                          <td>{m.status === "P" ? tr("Present", "حاضر") : m.status}</td>
                          <td>{m.at ? fmtTime12(m.at, lang, SITE_TZ) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
