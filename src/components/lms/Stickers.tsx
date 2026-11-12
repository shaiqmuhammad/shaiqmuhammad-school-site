"use client";

import { STICKERS, Sticker } from "@/components/lms/stickerArt";
import { useTr } from "@/components/lms/useLms";

export type StickerBuy = { id: string; at: number; sticker: string; status: string };

/** Pick a design for each granted sticker, and choose which one the character wears. */
export function StickerDesk({ items, badge, onChoose, onWear, locked = false }: { items: StickerBuy[]; badge: string; onChoose: (id: string, code: string) => Promise<void>; onWear: (code: string) => Promise<void>; locked?: boolean }) {
  const { tr } = useTr();
  const granted = items.filter((x) => x.status === "approved" || x.status === "fulfilled");
  const waiting = items.filter((x) => x.status === "pending").length;
  if (!granted.length && !waiting) return null;
  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <div className="space-y-3" data-testid="sticker-desk">
      <h3 className="text-lg font-extrabold">{tr("My stickers", "ملصقاتي")}</h3>
      <p className="text-sm opacity-70">{tr("Choose a sticker for each one you were given. The one on your character can be changed whenever you like — earlier choices stay saved.", "اختر ملصقًا لكل ملصق حصلت عليه. يمكنك تغيير المعروض على شخصيتك في أي وقت، وتبقى اختياراتك السابقة محفوظة.")}</p>
      {waiting > 0 && <p className="rounded-2xl bg-amber-100 px-3 py-2 text-sm text-amber-950">{tr(waiting === 1 ? "1 sticker is waiting for your teacher. You can choose its design after it is approved." : `${waiting} stickers are waiting for your teacher. You can choose a design after each one is approved.`, waiting === 1 ? "ملصق واحد بانتظار معلمك. يمكنك اختيار رسمه بعد الموافقة." : `${waiting} ملصقات بانتظار معلمك. يمكنك اختيار الرسم بعد الموافقة على كل واحد.`)}</p>}
      {granted.map((buy, i) => (
        <div key={buy.id} className="rounded-2xl bg-black/[0.03] p-3 dark:bg-white/5" data-testid="sticker-buy">
          <p className="mb-2 text-sm font-bold">{tr(`Sticker ${i + 1}`, `الملصق ${i + 1}`)} <span className="font-normal opacity-60">· {date(buy.at)}</span>{buy.sticker && badge === buy.sticker ? <span className="ms-2 rounded-full bg-[#1b3a57] px-2 py-0.5 text-xs text-[#f5c542]">{tr("On my character", "على شخصيتي")}</span> : null}</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {STICKERS.map((s) => {
              const on = buy.sticker === s.id;
              return (
                <button key={s.id} type="button" disabled={locked} aria-pressed={on} aria-label={tr(s.en, s.ar)} title={tr(s.en, s.ar)} data-testid="sticker-opt" data-sticker={s.id} onClick={() => onChoose(buy.id, s.id)} className={`grid place-items-center rounded-2xl p-1 transition hover:scale-105 disabled:opacity-60 ${on ? "bg-[#f5c542] ring-4 ring-[#1b3a57]" : "bg-white dark:bg-white/10"}`}>
                  <Sticker code={s.id} size={48} />
                </button>
              );
            })}
          </div>
          {buy.sticker && badge !== buy.sticker && !locked && <button type="button" className="mt-2 rounded-full bg-[#1b3a57] px-3 py-1 text-xs font-bold text-[#f5c542]" data-testid="sticker-wear" onClick={() => onWear(buy.sticker)}>{tr("Show this sticker on my character", "أظهر هذا الملصق على شخصيتي")}</button>}
        </div>
      ))}
    </div>
  );
}
