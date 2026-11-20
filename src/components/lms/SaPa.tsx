"use client";

import { useEffect, useState } from "react";
import { AudioClip } from "@/components/lms/Audio";
import { HwImg, HwMarkedWork } from "@/components/lms/HwMark";
import { PackPlayer } from "@/components/lms/packs/PackPlayer";
import { smallBtn, useTr } from "@/components/lms/useLms";
import { lmsApi, lmsErrorText, type Homework } from "@/lib/lms";
import { SA_OPTIONS, saOf, type SaId } from "@/lib/saPa";

/** Colourful Self / Peer Assessment chips (task & homework SA; PA uses the same options). */
export function SaChips({ value, onChange, disabled, label, testId = "hw-sa" }: { value: string; onChange?: (id: SaId) => void; disabled?: boolean; label?: string; testId?: string }) {
  const { tr } = useTr();
  const chosen = saOf(value);
  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-sm font-extrabold">{label || tr("How do you feel about this work?", "كيف تشعر تجاه هذا العمل؟")}</p>
      {disabled && !onChange && chosen ? (
        <p className={`inline-flex rounded-2xl bg-gradient-to-r ${chosen.color} px-3 py-2 text-sm font-extrabold text-[#1b2f44] shadow`} data-testid={`${testId}-picked`}>{chosen.icon} {tr(chosen.en, chosen.ar)}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {SA_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={disabled}
              aria-pressed={value === o.id}
              onClick={() => onChange?.(o.id)}
              className={`rounded-2xl bg-gradient-to-r ${o.color} px-3 py-2 text-sm font-extrabold text-[#1b2f44] shadow transition ${value === o.id ? "ring-4 ring-[#1b3a57] scale-[1.03]" : "opacity-90 hover:opacity-100"}`}
              data-testid={`${testId}-${o.id}`}
            >
              {o.icon} {tr(o.en, o.ar)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SaBadge({ id }: { id: string }) {
  const { tr } = useTr();
  const o = saOf(id);
  if (!o) return null;
  return <span className={`inline-flex rounded-full bg-gradient-to-r ${o.color} px-2.5 py-1 text-xs font-extrabold text-[#1b2f44] shadow-sm`} data-testid="hw-sa-badge">{o.icon} {tr(o.en, o.ar)}</span>;
}

/** Owner / admin switch. Shared teachers see a label only when it is already on. */
export function PaToggle({ hwId, on, asAdmin, canEdit, onChanged }: { hwId: string; on: boolean; asAdmin: boolean; canEdit: boolean; onChanged?: (on: boolean) => void }) {
  const { tr } = useTr();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!canEdit && !on) return null;
  if (!canEdit) {
    return <span className="rounded-full bg-violet-100 px-3 py-1.5 text-sm font-bold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" data-testid="hw-pa-on">🤝 {tr("Peer assessment is on", "تقييم الأقران مفعّل")}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={smallBtn}
        aria-pressed={on}
        disabled={busy}
        data-testid="hw-pa-toggle"
        onClick={async () => {
          setBusy(true); setErr("");
          try { const r = await lmsApi.hwPa(hwId, !on, asAdmin); onChanged?.(r.pa); }
          catch (e) { setErr(lmsErrorText(e, tr)); }
          finally { setBusy(false); }
        }}
      >
        🤝 {on ? tr("Peer assessment: on", "تقييم الأقران: تشغيل") : tr("Allow peer assessment", "السماح بتقييم الأقران")}
      </button>
      {err && <span className="text-sm font-semibold text-rose-700">{err}</span>}
    </span>
  );
}

type Classmate = { id: string; name: string; status: string; mine: { score: string; text: string } | null };
type Work = { student: string; name: string; text: string; audio: string; photos: { id: string; w: number; h: number }[]; annot: import("@/lib/hwMark").HwAnnot | null };
type Received = { id: string; by: string; byName: string; score: string; text: string; at: number };

/** Student: assess classmates' submitted work and see feedback received. */
export function PeerBoard({ hw, asAdmin = false }: { hw: Homework; asAdmin?: boolean }) {
  const { tr, lang } = useTr();
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [received, setReceived] = useState<Received[]>([]);
  const [about, setAbout] = useState("");
  const [work, setWork] = useState<Work | null>(null);
  const [score, setScore] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pack = (hw.data as { pack?: string }).pack;

  const load = (who?: string) => {
    const id = who ?? about;
    return lmsApi.peerBoard(hw.id, id ? { about: id } : {}, asAdmin).then((r) => {
      setClassmates(r.classmates || []);
      setReceived(r.received || []);
      setWork(r.work || null);
      if (r.work) {
        const mine = (r.classmates || []).find((c) => c.id === r.work!.student)?.mine;
        setScore(mine?.score || "");
        setText(mine?.text || "");
      }
    });
  };

  useEffect(() => { let on = true; load("").then(() => undefined).catch(() => { if (on) setMsg(""); }); return () => { on = false; }; }, [hw.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (id: string) => {
    setAbout(id); setMsg(""); setWork(null);
    try { await load(id); } catch (e) { setMsg(lmsErrorText(e, tr)); }
  };

  const save = async () => {
    if (!about || !score) return;
    setBusy(true); setMsg("");
    try {
      await lmsApi.peerSave(hw.id, about, score, text);
      setMsg(tr("Saved ✓ Thank you for helping your classmate.", "تم الحفظ ✓ شكرًا لمساعدة زميلك."));
      await load(about);
    } catch (e) { setMsg(lmsErrorText(e, tr)); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-3 rounded-3xl bg-violet-50 p-4 dark:bg-violet-950/30" data-testid="hw-peer-board">
      <h2 className="text-xl font-extrabold text-violet-900 dark:text-violet-100">🤝 {tr("Peer assessment", "تقييم الأقران")}</h2>
      <p className="text-sm font-semibold opacity-80">{tr("Look at a classmate’s submitted work and leave a kind, helpful comment.", "اطّلع على عمل زميلك المسلّم واترك تعليقًا لطيفًا ومفيدًا.")}</p>
      {!!received.length && (
        <div className="space-y-2 rounded-2xl bg-white/80 p-3 dark:bg-white/5" data-testid="hw-peer-received">
          <p className="text-sm font-extrabold">{tr("Feedback from classmates", "ملاحظات الزملاء")}</p>
          <ul className="space-y-2">
            {received.map((p) => (
              <li key={p.id} className="space-y-1" data-testid="hw-peer-note">
                <div className="flex flex-wrap items-center gap-2"><b dir="auto">{p.byName}</b> <SaBadge id={p.score} /> <span className="text-xs opacity-60">{new Date(p.at).toLocaleString(lang === "ar" ? "ar" : undefined, { day: "numeric", month: "short" })}</span></div>
                {p.text && <p className="whitespace-pre-wrap text-sm" dir="auto">{p.text}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {classmates.map((c) => (
          <button key={c.id} type="button" className={`${smallBtn} ${about === c.id ? "bg-header text-sun" : ""}`} onClick={() => open(c.id)} data-testid="hw-peer-classmate">
            {c.name}{c.mine ? " ✓" : ""}
          </button>
        ))}
        {!classmates.length && <p className="text-sm opacity-70">{tr("No classmates have submitted yet.", "لم يسلّم الزملاء بعد.")}</p>}
      </div>
      {work && (
        <div className="space-y-3 rounded-2xl bg-white p-3 dark:bg-[#0b1b2b]" data-testid="hw-peer-work">
          <p className="font-extrabold" dir="auto">{tr(`Work by ${work.name}`, `عمل ${work.name}`)}</p>
          {pack && <PackPlayer id={pack} review={{ student: work.student }} />}
          {work.text && <p className="whitespace-pre-wrap rounded-2xl bg-black/[0.04] px-3 py-2 dark:bg-white/5" dir="auto">{work.text}</p>}
          {work.audio && <AudioClip id={work.audio} label={"🎙️ " + tr("Recording", "التسجيل")} testId="peer-clip" />}
          {work.annot?.done && (work.photos || []).length > 0 ? (
            <HwMarkedWork sub={{ id: "", photos: work.photos, annot: work.annot }} />
          ) : (work.photos || []).map((p) => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-black/10 dark:border-white/10" style={{ aspectRatio: `${Math.max(1, p.w)} / ${Math.max(1, p.h)}` }}>
              <HwImg id={p.id} className="h-full w-full object-contain" />
            </div>
          ))}
          <SaChips value={score} onChange={(id) => setScore(id)} label={tr("Your assessment", "تقييمك")} testId="hw-pa-score" />
          <textarea className="mt-0 min-h-20 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 dark:border-white/15 dark:bg-white/5" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} dir="auto" placeholder={tr("A kind comment (optional)…", "تعليق لطيف (اختياري)…")} data-testid="hw-pa-text" />
          <button type="button" className="rounded-full bg-violet-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50" disabled={busy || !score} onClick={() => save()} data-testid="hw-pa-save">{busy ? "…" : tr("Save my assessment", "حفظ تقييمي")}</button>
          {msg && <p className="font-semibold" role="status">{msg}</p>}
        </div>
      )}
    </section>
  );
}

export function PeerNotes({ items, student }: { items: { about: string; byName: string; score: string; text: string; at: number }[]; student: string }) {
  const { tr, lang } = useTr();
  const mine = items.filter((p) => p.about === student);
  if (!mine.length) return null;
  return (
    <div className="space-y-2 rounded-2xl bg-violet-50 px-3 py-2 dark:bg-violet-950/30" data-testid="hw-peer-teacher">
      <p className="text-sm font-extrabold text-violet-900 dark:text-violet-100">🤝 {tr("Peer assessment", "تقييم الأقران")} ({mine.length})</p>
      <ul className="space-y-1.5 text-sm">
        {mine.map((p, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <b dir="auto">{p.byName}</b> <SaBadge id={p.score} />
            <span className="text-xs opacity-60">{new Date(p.at).toLocaleString(lang === "ar" ? "ar" : undefined, { day: "numeric", month: "short" })}</span>
            {p.text ? <span className="w-full whitespace-pre-wrap" dir="auto">{p.text}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
