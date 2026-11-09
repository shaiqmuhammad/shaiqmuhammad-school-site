"use client";

import { useState } from "react";
import { lmsApi, lmsErrorText } from "@/lib/lms";
import type { QuizQuestion } from "@/lib/quiz";

type BankItem = { quizId: string; quizTitle: string; subject?: string; yr?: string; question: QuizQuestion };

function readU32(buf: Uint8Array, i: number) {
  return buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24);
}

async function inflateRaw(data: Uint8Array) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntry(buf: Uint8Array, name: string): Promise<string | null> {
  const td = new TextDecoder();
  let i = 0;
  while (i < buf.length - 30) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) {
      const method = buf[i + 8] | (buf[i + 9] << 8);
      const compSize = readU32(buf, i + 18);
      const nameLen = buf[i + 26] | (buf[i + 27] << 8);
      const extraLen = buf[i + 28] | (buf[i + 29] << 8);
      const fname = td.decode(buf.subarray(i + 30, i + 30 + nameLen));
      const start = i + 30 + nameLen + extraLen;
      const data = buf.subarray(start, start + compSize);
      if (fname === name) {
        const raw = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
        return raw ? td.decode(raw) : null;
      }
      i = start + Math.max(0, compSize);
      continue;
    }
    i++;
  }
  return null;
}

export async function fileToText(file: File): Promise<string> {
  const isDocx = /\.docx$/i.test(file.name) || file.type.includes("wordprocessingml");
  if (!isDocx) return file.text();
  const xml = await unzipEntry(new Uint8Array(await file.arrayBuffer()), "word/document.xml");
  if (!xml) throw new Error("import_empty");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.getElementsByTagName("w:p")].map((p) => (p.textContent || "").trim()).filter(Boolean).join("\n");
}

const btn = "rounded-full border border-black/10 px-4 py-2 text-sm font-bold dark:border-white/15 disabled:opacity-50";
const cta = "rounded-full bg-sun px-4 py-2 text-sm font-bold text-[#0b1b2b] disabled:opacity-50";

/** Draft from the linked curriculum topic, import a Word/text list, or reuse questions from the same subject. */
export function AssessDraftTools({
  topic, asAdmin = false, tr, onApply, onMeta, onStatus,
}: {
  topic?: string;
  asAdmin?: boolean;
  tr: (en: string, ar: string) => string;
  onApply: (questions: QuizQuestion[], mode: "replace" | "append") => void;
  onMeta?: (meta: { title?: string; description?: string }) => void;
  onStatus: (msg: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [bank, setBank] = useState<BankItem[] | null>(null);

  const draft = async () => {
    if (!topic) { onStatus(tr("Choose the curriculum topic first.", "اختر موضوع المنهج أولًا.")); return; }
    setBusy("draft");
    try {
      const r = await lmsApi.tquizDraft(topic, asAdmin);
      onMeta?.({ title: r.title, description: r.description });
      onApply(r.questions as QuizQuestion[], "replace");
      onStatus(r.source === "ai"
        ? tr("Drafted from this curriculum topic. Please check every question before saving — especially Islamic wording and verses.", "صِيغ من موضوع المنهج. راجع كل سؤال قبل الحفظ — خاصة صياغة الدراسات الإسلامية والآيات.")
        : tr("Starter questions were built from this topic’s success criteria and objectives. Please check and edit them before saving.", "بُنيت أسئلة أولية من معايير النجاح وأهداف هذا الموضوع. راجعها وعدّلها قبل الحفظ."));
    } catch (e) { onStatus(lmsErrorText(e, tr)); }
    setBusy("");
  };

  const onImport = async (file: File) => {
    setBusy("import");
    try {
      const text = await fileToText(file);
      const r = await lmsApi.tquizImport(text, topic, asAdmin);
      onApply(r.questions as QuizQuestion[], "append");
      onStatus(tr(`Imported ${r.questions.length} questions. Check they match this curriculum topic.`, `تم استيراد ${r.questions.length} أسئلة. تأكد أنها تطابق موضوع المنهج.`));
    } catch (e) {
      onStatus(e instanceof Error && e.message === "import_empty"
        ? tr("I couldn't find questions in that file. Use a list like 1. Question… a) … b) …", "لم أجد أسئلة في هذا الملف. استخدم قائمة مثل: 1. السؤال… a) … b) …")
        : lmsErrorText(e, tr));
    }
    setBusy("");
  };

  const loadBank = async () => {
    setBusy("bank");
    try { setBank((await lmsApi.tquizBank(topic, asAdmin)).items as BankItem[]); }
    catch (e) { onStatus(lmsErrorText(e, tr)); }
    setBusy("");
  };

  const addBank = (item: BankItem) => {
    const q = { ...item.question, id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` };
    if (q.sc && topic) {
      const idx = String(q.sc).split("#")[1] || "0";
      q.sc = `${topic}#${idx}`;
    } else if (topic) {
      q.sc = `${topic}#0`;
    }
    onApply([q], "append");
    onStatus(tr("Added from the question bank. You can edit it below.", "أُضيف من بنك الأسئلة. يمكنك تعديله بالأسفل."));
  };

  return (
    <div className="glass space-y-3 rounded-3xl p-4" data-testid="tquiz-quick">
      <p className="text-sm font-extrabold">{tr("Save time — draft from the curriculum", "وفّر الوقت — صِغ من المنهج")}</p>
      <p className="text-xs opacity-70">{tr("Questions are based on this topic’s objectives and success criteria. This works for every subject you add, including Islamic. Always review before saving.", "تُبنى الأسئلة على أهداف هذا الموضوع ومعايير نجاحه. يعمل لكل مادة تضيفها، بما فيها الإسلامية. راجع دائمًا قبل الحفظ.")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={cta} disabled={!topic || busy === "draft"} onClick={draft} data-testid="tquiz-draft">{busy === "draft" ? "…" : "✨"} {tr("Draft questions from this topic", "صياغة الأسئلة من هذا الموضوع")}</button>
        <label className={btn + " cursor-pointer"} data-testid="tquiz-import">⬆ {tr("Import Word or text", "استيراد Word أو نص")}
          <input type="file" accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) onImport(f); }} />
        </label>
        <button type="button" className={btn} disabled={busy === "bank"} onClick={loadBank} data-testid="tquiz-bank">{tr("Question bank", "بنك الأسئلة")}</button>
      </div>
      {bank && (
        <div className="max-h-64 space-y-1 overflow-auto rounded-2xl bg-black/[0.03] p-2 dark:bg-white/5" data-testid="tquiz-bank-list">
          {!bank.length ? <p className="px-2 py-3 text-sm opacity-70">{tr("No saved questions for this subject yet.", "لا توجد أسئلة محفوظة لهذه المادة بعد.")}</p>
            : bank.map((item, i) => (
              <button key={`${item.quizId}-${i}`} type="button" className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-start text-sm hover:bg-sun/30" onClick={() => addBank(item)} data-testid="tquiz-bank-item">
                <span className="min-w-0 flex-1 truncate" dir="auto">{item.question.prompt}</span>
                <span className="shrink-0 text-[11px] opacity-60">{item.quizTitle}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
