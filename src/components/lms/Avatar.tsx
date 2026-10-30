/** Friendly cartoon avatars drawn as SVG (no photos, no real faces). Code: "b3" boy, "g7" girl (modest, mostly hijab), "n2" neutral mascot. */
const SKIN = ["#f6d7b8", "#eac09a", "#d9a47a", "#b97d55", "#8d5a3b"];
const HAIR = ["#2b1d14", "#4a2f1d", "#6b4423", "#1c1c1c", "#8a5a2b"];
const SCARF = ["#1b3a57", "#f5c542", "#e76f51", "#2a9d8f", "#8e7cc3", "#e9a8b8", "#4f6d7a", "#6aa84f"];
const BG = ["#fde68a", "#bae6fd", "#bbf7d0", "#fecdd3", "#ddd6fe", "#fed7aa", "#c7d2fe", "#a7f3d0"];
const N = 24;
/** t329: animal characters ("a0".."a23"): 8 friendly animals × 3 colours, open to every student. */
export const ANIMALS = 24;

const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export function avatarCode(id: string, gender = "", avatar = ""): string {
  if (avatar.startsWith("data:image/")) return avatar;
  if (/^a\d{1,2}$/.test(avatar)) return avatar;
  if (/^[bgn]\d{1,2}$/.test(avatar) && (avatar[0] === (gender || "n") || !gender)) return avatar;
  return `${gender === "b" || gender === "g" ? gender : "n"}${hash(id) % 12}`;
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
  if (g === "a") body = <Animal n={n} />;
  else if (g === "b") {
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

const FUR = [["#f4a259", "#fde2c4"], ["#9ca3af", "#f3f4f6"], ["#8b5e3c", "#e8c9a6"]];
function Animal({ n }: { n: number }) {
  const kind = n % 8, [fur, light] = FUR[Math.floor(n / 8) % FUR.length];
  const eyes = <><circle cx="40" cy="56" r="4" fill="#1f2937" /><circle cx="60" cy="56" r="4" fill="#1f2937" /><circle cx="41.3" cy="54.7" r="1.3" fill="#fff" /><circle cx="61.3" cy="54.7" r="1.3" fill="#fff" /></>;
  const smile = <path d="M45 68q5 4 10 0" stroke="#3f1d0b" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  const cheeks = <><circle cx="33" cy="64" r="4" fill="#f87171" opacity=".3" /><circle cx="67" cy="64" r="4" fill="#f87171" opacity=".3" /></>;
  switch (kind) {
    case 0: // cat
      return <><path d="M24 44 30 18l16 16zM76 44 70 18 54 34z" fill={fur} /><circle cx="50" cy="60" r="28" fill={fur} />{eyes}{cheeks}<path d="M47 63h6l-3 3z" fill="#e76f51" />{smile}<path d="M22 62h14M22 68h14M64 62h14M64 68h14" stroke="#1f2937" strokeWidth="1.2" opacity=".5" /></>;
    case 1: // bear
      return <><circle cx="27" cy="34" r="10" fill={fur} /><circle cx="73" cy="34" r="10" fill={fur} /><circle cx="50" cy="60" r="28" fill={fur} /><ellipse cx="50" cy="68" rx="12" ry="9" fill={light} />{eyes}<ellipse cx="50" cy="64" rx="4" ry="3" fill="#1f2937" />{smile}</>;
    case 2: // panda
      return <><circle cx="27" cy="34" r="10" fill="#1f2937" /><circle cx="73" cy="34" r="10" fill="#1f2937" /><circle cx="50" cy="60" r="28" fill="#fff" /><ellipse cx="39" cy="56" rx="7" ry="9" fill="#1f2937" /><ellipse cx="61" cy="56" rx="7" ry="9" fill="#1f2937" /><circle cx="40" cy="55" r="2.4" fill="#fff" /><circle cx="60" cy="55" r="2.4" fill="#fff" /><ellipse cx="50" cy="66" rx="4" ry="3" fill="#1f2937" />{smile}<circle cx="50" cy="96" r="18" fill={fur} /></>;
    case 3: // fox
      return <><path d="M22 46 28 16l20 20zM78 46 72 16 52 36z" fill={fur} /><path d="M22 50q28-18 56 0-6 30-28 34-22-4-28-34z" fill={fur} /><path d="M32 62q18 26 36 0-4 20-18 22-14-2-18-22z" fill={light} />{eyes}<circle cx="50" cy="72" r="3.2" fill="#1f2937" /></>;
    case 4: // owl
      return <><path d="M24 40 32 24l10 10zM76 40 68 24 58 34z" fill={fur} /><ellipse cx="50" cy="62" rx="28" ry="30" fill={fur} /><circle cx="39" cy="54" r="10" fill="#fff" /><circle cx="61" cy="54" r="10" fill="#fff" /><circle cx="39" cy="54" r="5" fill="#1f2937" /><circle cx="61" cy="54" r="5" fill="#1f2937" /><path d="M46 64h8l-4 6z" fill="#f5c542" /><ellipse cx="50" cy="82" rx="14" ry="8" fill={light} /></>;
    case 5: // bunny
      return <><ellipse cx="38" cy="22" rx="7" ry="18" fill={light} stroke={fur} strokeWidth="4" /><ellipse cx="62" cy="22" rx="7" ry="18" fill={light} stroke={fur} strokeWidth="4" /><circle cx="50" cy="62" r="27" fill={light} />{eyes}{cheeks}<path d="M47 64h6l-3 3z" fill="#e76f51" /><path d="M47 72h6" stroke="#fff" strokeWidth="3" />{smile}</>;
    case 6: // lion
      return <><g fill={fur}>{Array.from({ length: 12 }, (_, i) => { const t = (i / 12) * Math.PI * 2; return <circle key={i} cx={50 + Math.cos(t) * 30} cy={58 + Math.sin(t) * 30} r="11" />; })}</g><circle cx="50" cy="58" r="25" fill="#f8d27a" />{eyes}<ellipse cx="50" cy="66" rx="4" ry="3" fill="#7c2d12" />{smile}</>;
    default: // penguin
      return <><ellipse cx="50" cy="62" rx="30" ry="32" fill="#1f2937" /><ellipse cx="50" cy="66" rx="20" ry="24" fill="#fff" /><circle cx="42" cy="54" r="3.6" fill="#1f2937" /><circle cx="58" cy="54" r="3.6" fill="#1f2937" /><path d="M45 61h10l-5 6z" fill="#f59e0b" />{cheeks}<path d="M26 32q24-12 48 0" stroke={fur} strokeWidth="6" fill="none" strokeLinecap="round" /></>;
  }
}
