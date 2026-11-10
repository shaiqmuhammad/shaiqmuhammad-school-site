"use client";

import { useI18n } from "@/lib/i18n";

const btnGhost = "rounded-full border border-card-border px-3 py-1.5 text-sm";

export type PendingImage = {
  name: string;
  ext: "png" | "jpg" | "svg";
  mime: string;
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
  png512?: string;
};

const MAX_BYTES = 1024 * 1024;

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

export function toSquarePng(dataUrl: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const ctx = c.getContext("2d");
      if (!ctx) { reject(new Error("canvas")); return; }
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - s) / 2;
      const sy = (img.naturalHeight - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("image"));
    img.src = dataUrl;
  });
}

/** Upload / preview / reset for the site logo or favicon (used on Admin → Site & branding). */
export function BrandUpload({ kind, title, hint, currentUrl, isCustom, pending, onPick, onReset, onError, preferPng = false }: {
  kind: "logo" | "favicon";
  title: string;
  hint: string;
  currentUrl: string;
  isCustom: boolean;
  pending: PendingImage | null;
  onPick: (img: PendingImage | null) => void;
  onReset: () => void;
  onError: (msg: string) => void;
  /** Email logos: also rasterize so mail apps that cannot show SVG still have a PNG. */
  preferPng?: boolean;
}) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const preview = pending?.dataUrl || currentUrl;
  const warn: string[] = [];
  if (pending && pending.ext !== "svg") {
    if (pending.width !== pending.height) warn.push(tr("This image is not square — it will be cropped to a square when used as an icon.", "هذه الصورة ليست مربعة — ستُقصّ إلى مربع عند استخدامها كأيقونة."));
    if (pending.width < 192 || pending.height < 192) warn.push(tr("Smaller than 192 × 192 px — it may look blurry on some screens.", "أصغر من ١٩٢ × ١٩٢ بكسل — قد تبدو ضبابية على بعض الشاشات."));
  }
  if (preferPng && pending?.ext === "svg") warn.push(tr("Many email apps cannot show an SVG. A PNG copy will be used for emails if this image can be converted.", "كثير من تطبيقات البريد لا تعرض SVG. سيتم استخدام نسخة PNG في الرسائل إن أمكن تحويل الصورة."));

  async function pick(file: File | undefined) {
    if (!file) return;
    const mime = file.type;
    const ext = mime === "image/png" ? "png" as const : mime === "image/jpeg" ? "jpg" as const : mime === "image/svg+xml" ? "svg" as const : null;
    if (!ext) { onError(tr("Please choose a PNG, JPG or SVG file.", "يُرجى اختيار ملف PNG أو JPG أو SVG.")); return; }
    if (file.size > MAX_BYTES) { onError(tr("That file is larger than 1 MB. Please choose a smaller one.", "هذا الملف أكبر من ١ ميغابايت. يُرجى اختيار ملف أصغر.")); return; }
    try {
      const dataUrl = await readAsDataUrl(file);
      let width = 0, height = 0, png512: string | undefined;
      if (ext !== "svg") {
        const dim = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error("image"));
          img.src = dataUrl;
        });
        width = dim.w;
        height = dim.h;
      }
      if (kind === "favicon" || preferPng) {
        try { png512 = await toSquarePng(dataUrl, 512); } catch { png512 = undefined; }
      }
      onPick({ name: file.name, ext, mime, dataUrl, bytes: file.size, width, height, png512 });
    } catch {
      onError(tr("Could not read that image. Please try another file.", "تعذّر قراءة هذه الصورة. جرّب ملفًا آخر."));
    }
  }

  return (
    <div className="rounded-xl border border-card-border p-4" data-testid={`brand-${kind}`}>
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" width={80} height={80} className={`h-20 w-20 bg-accent-soft object-cover ${kind === "logo" ? "rounded-full" : "rounded-lg object-contain p-1"}`} data-testid={`brand-${kind}-preview`} />
          {kind === "favicon" && (
            <div className="flex items-end gap-2" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending?.png512 || preview} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending?.png512 || preview} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium">{title} <span className="text-xs font-normal text-muted">· {pending ? tr("new (not yet published)", "جديد (لم يُنشر بعد)") : isCustom ? tr("custom", "مخصص") : tr("default", "افتراضي")}</span></p>
          <p className="text-xs text-muted">{hint}</p>
          <p className="text-xs text-muted">{tr("Recommended: square, 512 × 512 px, PNG/JPG/SVG, max 1 MB.", "المقترح: مربعة ٥١٢ × ٥١٢ بكسل، PNG/JPG/SVG، بحد أقصى ١ ميغابايت.")}</p>
          {pending && <p className="break-all text-xs">{pending.name} · {pending.ext.toUpperCase()}{pending.ext !== "svg" ? ` · ${pending.width}×${pending.height}px` : ""} · {Math.ceil(pending.bytes / 1024)} KB</p>}
          {warn.map((w) => <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>)}
          <div className="flex flex-wrap gap-2 pt-1">
            <label className={btnGhost + " cursor-pointer"}>
              {tr("Upload…", "رفع…")}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg" className="sr-only" data-testid={`brand-${kind}-input`} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {pending && <button type="button" className={btnGhost} onClick={() => onPick(null)}>{tr("Cancel", "إلغاء")}</button>}
            {(isCustom || pending) && <button type="button" className={btnGhost} onClick={onReset} data-testid={`brand-${kind}-reset`}>{tr("Reset to default", "إعادة الافتراضي")}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
