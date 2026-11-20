"use client";

import { useEffect, useRef, useState } from "react";
import { HwAnnotate } from "@/components/lms/HwMark";
import { SlideView } from "@/components/lms/packs/SlideView";
import { isWorkPage, jpegFromCanvas, paintWorkPage, workPageId, type CorrCode } from "@/lib/hwMark";
import { lmsApi, lmsErrorText, type GeneralData, type Submission } from "@/lib/lms";
import { lp, slideKind, type El, type Slide } from "@/lib/packs";
import { useTr } from "@/components/lms/useLms";

/** t684: raster typed answers + pack/slide work so teachers can mark them with the same pen / highlighter / codes / Next Steps tools. */
export function HwWorkPages({
  s, asAdmin, markView, markEdit, pack, gdata, hwTitle, codes, onCodes, reload, pdfMeta,
}: {
  s: Submission & { student: string; name: string; cls: string };
  asAdmin: boolean;
  markView: boolean;
  markEdit: boolean;
  pack?: string;
  gdata?: GeneralData;
  hwTitle: string;
  codes: CorrCode[];
  onCodes?: (c: CorrCode[]) => void;
  reload: () => void;
  pdfMeta: { title: string; student: string; cls?: string; hwId?: string; studentId?: string; date?: number };
}) {
  const { tr } = useTr();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [packSet, setPackSet] = useState<{ i: number; slide: Slide; layer: El[] }[] | null>(pack ? null : []);
  const host = useRef<HTMLDivElement>(null);
  const lock = useRef("");
  const ready = ["submitted", "approved", "returned"].includes(s.status);
  const photos = s.photos || [];

  useEffect(() => {
    if (!pack || !markEdit || !ready) return;
    let on = true;
    lp.work(pack, s.student, asAdmin).then((r) => {
      if (!on) return;
      const slides = r.pack?.slides || [];
      const work = r.work || [];
      const rows = slides.map((slide, i) => ({ i, slide, layer: (work[i]?.els || []) as El[] }))
        .filter((row) => {
          const part = slideKind(row.slide, r.pack?.type);
          const student = row.layer.length > 0;
          return student || part === "activity" || part === "homework" || !part;
        });
      const withWork = rows.filter((row) => row.layer.length);
      const rest = rows.filter((row) => !row.layer.length);
      setPackSet([...withWork, ...rest]);
    }).catch(() => { if (on) setPackSet([]); });
    return () => { on = false; };
    // packSet in deps would retrigger; we only load when the submission or pack changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, s.student, s.id, s.updated, markEdit, asAdmin, ready]);

  useEffect(() => {
    if (!markEdit || !ready) return;
    if (pack && packSet === null) return;
    if (lock.current === s.id + ":" + s.updated) return;
    const jobs = planJobs();
    const missing = jobs.filter((j) => !photos.some((p) => p.id === j.id));
    if (!missing.length) return;
    lock.current = s.id + ":" + s.updated;
    let on = true;
    (async () => {
      setBusy(true); setErr("");
      try {
        for (const job of missing) {
          if (!on) return;
          const page = await renderJob(job);
          if (!page) continue;
          await lmsApi.workRender(s.id, job.id, page.blob, page.w, page.h, asAdmin);
        }
        if (on) reload();
      } catch (e) {
        lock.current = "";
        if (on) setErr(lmsErrorText(e, tr) || tr("Could not prepare the work pages.", "تعذّر تجهيز صفحات العمل."));
      } finally { if (on) setBusy(false); }
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markEdit, ready, pack, packSet, s.id, s.updated, s.text, s.audio, photos.map((p) => p.id).join("|")]);

  function planJobs(): { id: string; kind: "text" | "g" | "pack" | "audio"; i?: number }[] {
    const room = Math.max(0, 16 - photos.filter((p) => !isWorkPage(p)).length);
    const out: { id: string; kind: "text" | "g" | "pack" | "audio"; i?: number }[] = [];
    const add = (kind: "text" | "g" | "pack" | "audio", slot: string, i?: number) => {
      if (out.length >= room) return;
      out.push({ id: workPageId(s.id, slot), kind, i });
    };
    if ((s.text || "").trim()) add("text", "text");
    const slides = (gdata?.slides || []).filter((sl) => sl && (sl.title || sl.text || sl.image));
    slides.forEach((_, i) => add("g", "g" + i, i));
    (packSet || []).forEach((row) => add("pack", "s" + row.i, row.i));
    if (!out.length && s.audio) add("audio", "audio");
    return out;
  }

  async function renderJob(job: { id: string; kind: "text" | "g" | "pack" | "audio"; i?: number }) {
    if (job.kind === "text") {
      return paintWorkPage({
        title: hwTitle,
        kicker: tr("Written answer", "إجابة مكتوبة"),
        question: gdata?.question || "",
        body: s.text,
      });
    }
    if (job.kind === "audio") {
      return paintWorkPage({
        title: hwTitle,
        kicker: tr("Voice answer", "إجابة صوتية"),
        question: gdata?.question || "",
        audioNote: true,
      });
    }
    if (job.kind === "g") {
      const sl = (gdata?.slides || [])[job.i || 0];
      if (!sl) return null;
      return paintWorkPage({
        title: hwTitle,
        kicker: tr(`Slide ${(job.i || 0) + 1}`, `الشريحة ${(job.i || 0) + 1}`),
        question: sl.title || gdata?.question || "",
        body: sl.text || "",
        image: sl.image || "",
      });
    }
    const el = host.current?.querySelector(`[data-wr-slide="${job.i}"]`) as HTMLElement | null;
    if (!el) return null;
    await waitImages(el);
    const { default: html2canvas } = await import("html2canvas-pro");
    const canvas = await html2canvas(el, { scale: 1, backgroundColor: "#ffffff", useCORS: true, logging: false, width: 1280, height: 720 });
    return jpegFromCanvas(canvas);
  }

  if (!markView || !ready) return null;
  return (
    <>
      {busy && <p className="rounded-2xl bg-sky-100 px-3 py-2 text-sm font-bold text-sky-900" role="status" data-testid="hw-work-prep">⏳ {tr("Preparing the student’s work so you can mark it…", "جارٍ تجهيز عمل الطالب ليصبح قابلًا للتصحيح…")}</p>}
      {err && (
        <p className="rounded-2xl bg-rose-100 px-3 py-2 text-sm font-bold text-rose-900" role="alert" data-testid="hw-work-prep-err">
          {err}{" "}
          <button type="button" className="underline" onClick={() => { lock.current = ""; setErr(""); setPackSet(pack ? null : []); }}>{tr("Try again", "حاول مجددًا")}</button>
        </p>
      )}
      {photos.length > 0 && (
        <HwAnnotate photos={photos} annot={s.annot || null} codes={codes} edit={markEdit} asAdmin={asAdmin} subId={s.id} onSaved={() => reload()} onCodes={onCodes} pdfMeta={pdfMeta} />
      )}
      {markEdit && pack && (packSet || []).length > 0 && (
        <div ref={host} className="pointer-events-none fixed start-[-4200px] top-0 z-[-1] w-[1280px] opacity-0" aria-hidden>
          {(packSet || []).map((row) => (
            <div key={row.i} data-wr-slide={row.i} className="w-[1280px] bg-white">
              <SlideView slide={row.slide} layer={row.layer} asAdmin={asAdmin} live={false} className="rounded-none shadow-none ring-0" testId={`wr-slide-${row.i}`} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

async function waitImages(el: HTMLElement) {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    const imgs = [...el.querySelectorAll("img")];
    if (imgs.every((img) => img.complete && img.naturalWidth)) return;
    await new Promise((r) => setTimeout(r, 140));
  }
}
