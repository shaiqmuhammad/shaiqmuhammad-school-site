/** Original school stickers (no outside artwork). Codes match the worker list k0–k7. */

export const STICKERS: { id: string; en: string; ar: string }[] = [
  { id: "k0", en: "Gold star", ar: "نجمة ذهبية" },
  { id: "k1", en: "Sunny smile", ar: "شمس مبتسمة" },
  { id: "k2", en: "Story book", ar: "كتاب" },
  { id: "k3", en: "Rainbow", ar: "قوس قزح" },
  { id: "k4", en: "Flower", ar: "زهرة" },
  { id: "k5", en: "Trophy", ar: "كأس" },
  { id: "k6", en: "Paper plane", ar: "طائرة ورقية" },
  { id: "k7", en: "Little sprout", ar: "نبتة" },
];

export const stickerOk = (v: string) => STICKERS.some((s) => s.id === v);

function Art({ code }: { code: string }) {
  if (code === "k0") return (<><circle cx="32" cy="32" r="30" fill="#fff4cc" /><path d="M32 8l6.2 15.2L54 25.2 41.2 36.4l3.6 16.2L32 44.6 19.2 52.6l3.6-16.2L10 25.2l15.8-2z" fill="#f5c542" stroke="#b8860b" strokeWidth="2" strokeLinejoin="round" /></>);
  if (code === "k1") return (<><circle cx="32" cy="32" r="30" fill="#fff7e0" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <rect key={a} x="29" y="4" width="6" height="11" rx="3" fill="#f59e0b" transform={`rotate(${a} 32 32)`} />)}<circle cx="32" cy="34" r="15" fill="#fbbf24" /><circle cx="26" cy="32" r="2.1" fill="#1b3a57" /><circle cx="38" cy="32" r="2.1" fill="#1b3a57" /><path d="M25 38q7 7 14 0" stroke="#1b3a57" strokeWidth="2" fill="none" strokeLinecap="round" /></>);
  if (code === "k2") return (<><circle cx="32" cy="32" r="30" fill="#e0f2fe" /><path d="M12 18h16c3 0 4 2 4 5v24c-4-3-8-4-12-4H12z" fill="#1b3a57" /><path d="M52 18H36c-3 0-4 2-4 5v24c4-3 8-4 12-4h8z" fill="#f5c542" /><path d="M32 23v24" stroke="#fffaf3" strokeWidth="2" /><path d="M44 30c1.6-3.2 6.4-3.2 6.4 0 0 3.2-3.2 4.6-6.4 8-3.2-3.4-6.4-4.8-6.4-8 0-3.2 4.8-3.2 6.4 0z" fill="#e11d48" /></>);
  if (code === "k3") return (<><circle cx="32" cy="32" r="30" fill="#f0f9ff" /><path d="M8 42a24 24 0 0 1 48 0" fill="none" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" /><path d="M14 42a18 18 0 0 1 36 0" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" /><path d="M20 42a12 12 0 0 1 24 0" fill="none" stroke="#22c55e" strokeWidth="5" strokeLinecap="round" /><ellipse cx="16" cy="46" rx="9" ry="6" fill="#fff" /><ellipse cx="48" cy="46" rx="9" ry="6" fill="#fff" /><ellipse cx="32" cy="48" rx="12" ry="7" fill="#fff" /></>);
  if (code === "k4") return (<><circle cx="32" cy="32" r="30" fill="#fdf2f8" /><circle cx="32" cy="16" r="8" fill="#fb7185" /><circle cx="46" cy="26" r="8" fill="#f472b6" /><circle cx="40" cy="42" r="8" fill="#fb7185" /><circle cx="24" cy="42" r="8" fill="#f472b6" /><circle cx="18" cy="26" r="8" fill="#fb7185" /><circle cx="32" cy="30" r="8" fill="#fde047" stroke="#f59e0b" strokeWidth="1.5" /></>);
  if (code === "k5") return (<><circle cx="32" cy="32" r="30" fill="#fff7ed" /><path d="M22 14h20v14a10 10 0 0 1-20 0z" fill="#f5c542" stroke="#b45309" strokeWidth="2" /><path d="M22 18h-7a8 8 0 0 0 8 9" fill="none" stroke="#b45309" strokeWidth="3" strokeLinecap="round" /><path d="M42 18h7a8 8 0 0 1-8 9" fill="none" stroke="#b45309" strokeWidth="3" strokeLinecap="round" /><rect x="29" y="38" width="6" height="8" rx="1" fill="#b45309" /><rect x="22" y="46" width="20" height="5" rx="2" fill="#1b3a57" /><path d="M32 20l1.4 3 3.2.3-2.4 2.1.7 3.1L32 27l-2.9 1.5.7-3.1-2.4-2.1 3.2-.3z" fill="#fff" /></>);
  if (code === "k6") return (<><circle cx="32" cy="32" r="30" fill="#ecfeff" /><path d="M8 36 56 16 26 54l6-16z" fill="#38bdf8" stroke="#0369a1" strokeWidth="2" strokeLinejoin="round" /><path d="M32 38 26 54l8-10z" fill="#0284c7" /></>);
  if (code === "k7") return (<><circle cx="32" cy="32" r="30" fill="#f0fdf4" /><ellipse cx="32" cy="50" rx="14" ry="6" fill="#a16207" /><path d="M32 48V30" stroke="#15803d" strokeWidth="3" strokeLinecap="round" /><path d="M32 36c8-1 14 3 13 9-8 1-13-3-13-9z" fill="#4ade80" /><path d="M32 32c-10-1-15 4-13 11 8 0 13-4 13-11z" fill="#22c55e" /></>);
  return null;
}

export function Sticker({ code, size = 48, className = "" }: { code: string; size?: number; className?: string }) {
  if (!stickerOk(code)) return null;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden data-sticker={code}>
      <Art code={code} />
    </svg>
  );
}

/** Corner pin drawn inside an avatar's 100×100 viewBox. */
export function StickerPin({ code }: { code: string }) {
  if (!stickerOk(code)) return null;
  return (
    <g transform="translate(56,56)" data-testid="sticker-badge" data-sticker={code}>
      <circle cx="16" cy="16" r="16" fill="#fffef8" stroke="#1b3a57" strokeWidth="1.6" />
      <svg x="3" y="3" width="26" height="26" viewBox="0 0 64 64"><Art code={code} /></svg>
    </g>
  );
}
