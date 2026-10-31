"use client";

import { useState } from "react";
import { hwRemind } from "@/lib/lms";
import { useTr } from "@/components/lms/useLms";

/** t402: bell on an assigned homework pack — reminds ONLY assigned students who have not submitted (count + confirm first, 3-hour cooldown). */
export function HwRemindBell({ hw, title, asAdmin = false, className = "" }: { hw: string; title: string; asAdmin?: boolean; className?: string }) {
  const { tr } = useTr();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const mins = (ms: number) => Math.ceil(ms / 60000);
  const go = async () => {
    if (busy) return;
    setBusy(true); setMsg("");
    try {
      const c = await hwRemind(hw, false, asAdmin);
      if (c.wait && c.wait > 0) { setMsg(tr(`Reminder already sent — try again in ${mins(c.wait)} min.`, `أُرسل تذكير بالفعل — حاول بعد ${mins(c.wait)} دقيقة.`)); return; }
      if (!c.count) { setMsg(tr("Everyone has submitted — no reminder needed.", "سلّم الجميع — لا حاجة للتذكير.")); return; }
      if (!window.confirm(tr(`Send a reminder for “${title}” to ${c.count} student(s) who have not submitted yet?`, `إرسال تذكير بـ«${title}» إلى ${c.count} طالب/طلاب لم يسلّموا بعد؟`))) return;
      const r = await hwRemind(hw, true, asAdmin);
      setMsg(tr(`🔔 Reminder sent to ${r.sent ?? 0} student(s).`, `🔔 أُرسل التذكير إلى ${r.sent ?? 0} طالب/طلاب.`));
    } catch (e) {
      const w = Number((e as { data?: { wait?: number } })?.data?.wait || 0);
      setMsg(w ? tr(`Please wait ${mins(w)} min before reminding again.`, `انتظر ${mins(w)} دقيقة قبل التذكير مرة أخرى.`) : tr("Could not send the reminder.", "تعذّر إرسال التذكير."));
    } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={go} disabled={busy} className={"rounded-full bg-[#1b3a57] px-3 py-1 text-sm font-extrabold text-[#f5c542] shadow disabled:opacity-60 " + className} title={tr("Remind students who have not submitted", "تذكير الطلاب الذين لم يسلّموا")} aria-label={tr(`Remind students who have not submitted ${title}`, `تذكير من لم يسلّم ${title}`)} data-testid="hw-remind">🔔 {tr("Remind", "تذكير")}</button>
      {msg && <span role="status" className="text-xs font-semibold" data-testid="hw-remind-msg">{msg}</span>}
    </span>
  );
}
