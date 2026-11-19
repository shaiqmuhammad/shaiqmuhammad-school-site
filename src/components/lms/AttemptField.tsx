"use client";
import { useTr } from "@/components/lms/useLms";
/** 0 = multiple (until approved). 1 = one attempt. Any other positive number is a custom cap. */
export function AttemptField({ value, onChange, testId = "attempt-limit" }: { value: number; onChange: (n: number) => void; testId?: string }) {
  const { tr } = useTr();
  const mode = value <= 0 ? "multiple" : value === 1 ? "one" : "custom";
  const setMode = (m: "one" | "multiple" | "custom") => onChange(m === "multiple" ? 0 : m === "one" ? 1 : Math.max(2, value > 1 ? value : 2));
  return (
    <div className="space-y-1" data-testid={testId}>
      <p className="text-sm font-bold">{tr("Student attempts", "محاولات الطالب")}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={tr("Student attempts", "محاولات الطالب")}>
        {([["one", "One attempt", "محاولة واحدة"], ["multiple", "Multiple", "عدة محاولات"], ["custom", "Custom number", "عدد تحدده"]] as const).map(([id, en, ar]) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={`rounded-full px-3 py-1 text-xs font-extrabold ring-1 ring-black/10 ${mode === id ? "bg-[#1b3a57] text-[#f5c542]" : "bg-white text-[#1b2f44]"}`} data-testid={`${testId}-${id}`}>{tr(en, ar)}</button>
        ))}
        {mode === "custom" && <label className="inline-flex items-center gap-1 text-xs font-bold">{tr("Number", "العدد")}<input type="number" min={2} max={30} className="w-16 rounded-lg border border-black/15 bg-white px-2 py-1" value={Math.max(2, value)} onChange={(e) => onChange(Math.max(2, Math.min(30, Math.floor(Number(e.target.value) || 2))))} data-testid={`${testId}-n`} /></label>}
      </div>
      <p className="text-xs opacity-70">{mode === "multiple" ? tr("Students may submit again until you approve the work.", "يمكن للطلاب التسليم مجددًا حتى تعتمد العمل.") : mode === "one" ? tr("One submission. Sending it back still allows one more try.", "تسليم واحد. إعادته تسمح بمحاولة أخرى.") : tr(`Students can submit ${value} times in total.`, `يمكن للطلاب التسليم ${value} مرات في المجموع.`)}</p>
    </div>
  );
}
