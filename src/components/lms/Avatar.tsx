/** Friendly cartoon avatars drawn as SVG (no photos, no real faces). Code: "b3" boy, "g7" girl (modest, mostly hijab), "n2" neutral mascot. */
const SKIN = ["#f6d7b8", "#eac09a", "#d9a47a", "#b97d55", "#8d5a3b"];
const HAIR = ["#2b1d14", "#4a2f1d", "#6b4423", "#1c1c1c", "#8a5a2b"];
const SCARF = ["#1b3a57", "#f5c542", "#e76f51", "#2a9d8f", "#8e7cc3", "#e9a8b8", "#4f6d7a", "#6aa84f"];
const BG = ["#fde68a", "#bae6fd", "#bbf7d0", "#fecdd3", "#ddd6fe", "#fed7aa", "#c7d2fe", "#a7f3d0"];
const N = 12;

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export function avatarCode(id: string, gender = "", avatar = ""): string {
  if (avatar.startsWith("data:image/")) return avatar;
  if (/^[bgn]\d{1,2}$/.test(avatar) && (avatar[0] === (gender || "n") || !gender)) return avatar;
  return `${gender === "b" || gender === "g" ? gender : "n"}${hash(id) % N}`;
}
export function rerollCode(gender = "", current = ""): string {
  const g = gender === "b" || gender === "g" ? gender : "n";
  let c = current;
  while (c === current) c = `${g}${Math.floor(Math.random() * N)}`;
  return c;
}

function Face({ skin }: { skin: string }) {
  return (
    <>
      <circle cx="50" cy="54" r="24" fill={skin} />
      <circle cx="41" cy="54" r="3.2" fill="#1f2937" /><circle cx="59" cy="54" r="3.2" fill="#1f2937" />
      <circle cx="42" cy="53" r="1" fill="#fff" /><circle cx="60" cy="53" r="1" fill="#fff" />
      <circle cx="35" cy="62" r="3.5" fill="#f87171" opacity=".35" /><circle cx="65" cy="62" r="3.5" fill="#f87171" opacity=".35" />
      <path d="M43 64q7 6 14 0" stroke="#7c2d12" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </>
  );
}

export function Avatar({ code, size = 56, className = "" }: { code: string; size?: number; className?: string }) {
  // t305: an uploaded profile photo (data URL) instead of a character.
  // eslint-disable-next-line @next/next/no-img-element
  if (code.startsWith("data:image/")) return <img src={code} alt="" width={size} height={size} className={`shrink-0 rounded-full object-cover ${className}`} style={{ width: size, height: size }} data-testid="avatar-photo" />;
  const g = code[0], n = Number(code.slice(1)) || 0;
  const skin = SKIN[n % SKIN.length], bg = BG[n % BG.length], hair = HAIR[(n >> 1) % HAIR.length], scarf = SCARF[n % SCARF.length];
  let body: React.ReactNode;
  if (g === "b") {
    const style = n % 3;
    body = (
      <>
        <path d="M22 100q0-20 28-20t28 20z" fill={SCARF[(n + 3) % SCARF.length]} />
        <Face skin={skin} />
        {style === 0 && <path d="M26 50q2-24 24-24t24 24q-6-10-24-10t-24 10z" fill={hair} />}
        {style === 1 && <g fill={hair}>{[30, 38, 46, 54, 62, 70].map((x) => <circle key={x} cx={x} cy={38 + Math.abs(50 - x) / 5} r="7" />)}</g>}
        {style === 2 && <><path d="M27 46q0-18 23-18t23 18z" fill="#fff" /><path d="M27 46h46" stroke="#e5e7eb" strokeWidth="2" /><path d="M33 40h34" stroke={scarf} strokeWidth="2" strokeDasharray="2 3" /></>}
      </>
    );
  } else if (g === "g") {
    const style = n % 4;
    body = style === 3 ? (
      <>
        <path d="M22 100q0-20 28-20t28 20z" fill={scarf} />
        <path d="M24 56q-2-30 26-30t26 30v14q-4-6-6-14H30q-2 8-6 14z" fill={hair} />
        <Face skin={skin} />
        <path d="M28 44q4-16 22-16t22 16q-8-8-22-8t-22 8z" fill={hair} />
        <rect x="26" y="40" width="48" height="5" rx="2.5" fill={SCARF[(n + 2) % SCARF.length]} />
        <circle cx="22" cy="68" r="5" fill={hair} /><circle cx="78" cy="68" r="5" fill={hair} />
      </>
    ) : (
      <>
        <path d="M18 100q0-22 32-24 32 2 32 24z" fill={scarf} />
        <path d="M22 60q-2-36 28-36t28 36q0 18-10 24H32q-10-6-10-24z" fill={scarf} />
        <Face skin={skin} />
        <path d="M26 52q2-22 24-22t24 22q-6-14-24-14t-24 14z" fill={scarf} />
        {style === 1 && <circle cx="72" cy="42" r="3.2" fill="#fff" opacity=".9" />}
        {style === 2 && <path d="M28 50q22-12 44 0" stroke="#fff" strokeOpacity=".55" strokeWidth="2" fill="none" />}
      </>
    );
  } else {
    // Neutral mascot: a friendly round star-buddy.
    body = (
      <>
        <circle cx="50" cy="58" r="30" fill={scarf} />
        <circle cx="40" cy="54" r="5" fill="#fff" /><circle cx="60" cy="54" r="5" fill="#fff" />
        <circle cx="41" cy="55" r="2.6" fill="#1f2937" /><circle cx="61" cy="55" r="2.6" fill="#1f2937" />
        <path d="M42 66q8 7 16 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M50 18l3.5 8 8.5.8-6.5 5.5 2 8.3-7.5-4.4-7.5 4.4 2-8.3-6.5-5.5 8.5-.8z" fill="#f5c542" />
      </>
    );
  }
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`shrink-0 rounded-full ${className}`} aria-hidden data-avatar={code}>
      <circle cx="50" cy="50" r="50" fill={bg} />
      <clipPath id={`av-${code}`}><circle cx="50" cy="50" r="50" /></clipPath>
      <g clipPath={`url(#av-${code})`}>{body}</g>
    </svg>
  );
}
