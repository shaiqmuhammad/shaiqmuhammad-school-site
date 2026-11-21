"use client";

import type { LiveShape } from "@/lib/lms";

/** Draw a synced classroom shape inside the 100x56.25 board viewBox. */
export function ShapeMark({ sh }: { sh: LiveShape }) {
  const c = sh.c || "#1b3a57";
  const y = (n: number) => (n * 56.25) / 100;
  const x1 = Math.min(sh.x, sh.w);
  const y1 = y(Math.min(sh.y, sh.h));
  const x2 = Math.max(sh.x, sh.w);
  const y2 = y(Math.max(sh.y, sh.h));
  const sw = Math.max(0.6, x2 - x1);
  const shh = Math.max(0.6, y2 - y1);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const stroke = { fill: "none" as const, stroke: c, strokeWidth: 0.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const xA = sh.x, yA = y(sh.y), xB = sh.w, yB = y(sh.h);

  if (sh.kind === "rect") return <rect x={x1} y={y1} width={sw} height={shh} {...stroke} />;
  if (sh.kind === "circle") return <ellipse cx={cx} cy={cy} rx={sw / 2} ry={shh / 2} {...stroke} />;
  if (sh.kind === "triangle") return <polygon points={`${cx},${y1} ${x1},${y2} ${x2},${y2}`} {...stroke} />;
  if (sh.kind === "star") {
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + i * (2 * Math.PI / 5);
      const b = a + Math.PI / 5;
      return `${cx + Math.cos(a) * sw / 2},${cy + Math.sin(a) * shh / 2} ${cx + Math.cos(b) * sw / 5},${cy + Math.sin(b) * shh / 5}`;
    }).join(" ");
    return <polygon points={pts} {...stroke} />;
  }
  if (sh.kind === "hexagon") {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 30);
      return `${cx + Math.cos(a) * sw / 2},${cy + Math.sin(a) * shh / 2}`;
    }).join(" ");
    return <polygon points={pts} {...stroke} />;
  }
  if (sh.kind === "table") {
    const rows = Math.max(1, Math.min(12, sh.rows || 3));
    const cols = Math.max(1, Math.min(12, sh.cols || 3));
    const lines = [];
    for (let i = 0; i <= rows; i++) {
      const yy = y1 + (shh * i) / rows;
      lines.push(<line key={`r${i}`} x1={x1} y1={yy} x2={x2} y2={yy} stroke={c} strokeWidth="0.7" />);
    }
    for (let i = 0; i <= cols; i++) {
      const xx = x1 + (sw * i) / cols;
      lines.push(<line key={`c${i}`} x1={xx} y1={y1} x2={xx} y2={y2} stroke={c} strokeWidth="0.7" />);
    }
    return <g>{lines}</g>;
  }
  if (sh.kind === "numberline") {
    const ticks = 10;
    return (
      <g>
        <line x1={x1} y1={cy} x2={x2} y2={cy} stroke={c} strokeWidth="0.9" />
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const xx = x1 + (sw * i) / ticks;
          const tall = i === 0 || i === ticks || i === ticks / 2;
          return <line key={i} x1={xx} y1={cy - (tall ? shh * 0.28 : shh * 0.16)} x2={xx} y2={cy + (tall ? shh * 0.28 : shh * 0.16)} stroke={c} strokeWidth="0.7" />;
        })}
      </g>
    );
  }
  if (sh.kind === "axes") {
    return (
      <g>
        <line x1={x1} y1={y2 - shh * 0.15} x2={x2} y2={y2 - shh * 0.15} stroke={c} strokeWidth="0.9" />
        <line x1={x1 + sw * 0.15} y1={y2} x2={x1 + sw * 0.15} y2={y1} stroke={c} strokeWidth="0.9" />
        <polygon points={`${x2},${y2 - shh * 0.15} ${x2 - 2},${y2 - shh * 0.15 - 1.2} ${x2 - 2},${y2 - shh * 0.15 + 1.2}`} fill={c} />
        <polygon points={`${x1 + sw * 0.15},${y1} ${x1 + sw * 0.15 - 1.2},${y1 + 2} ${x1 + sw * 0.15 + 1.2},${y1 + 2}`} fill={c} />
      </g>
    );
  }
  if (sh.kind === "angle") {
    return (
      <g>
        <line x1={x1} y1={y2} x2={x2} y2={y2} stroke={c} strokeWidth="0.9" />
        <line x1={x1} y1={y2} x2={x1 + sw * 0.2} y2={y1} stroke={c} strokeWidth="0.9" />
        <path d={`M ${x1 + Math.min(sw, shh) * 0.28} ${y2} A ${Math.min(sw, shh) * 0.28} ${Math.min(sw, shh) * 0.28} 0 0 0 ${x1 + sw * 0.08} ${y2 - Math.min(sw, shh) * 0.22}`} fill="none" stroke={c} strokeWidth="0.7" />
      </g>
    );
  }
  if (sh.kind === "fraction") {
    const slices = Math.max(2, Math.min(12, sh.rows || 4));
    const rx = sw / 2, ry = shh / 2;
    const parts = Array.from({ length: slices }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / slices;
      return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * rx} y2={cy + Math.sin(a) * ry} stroke={c} strokeWidth="0.7" />;
    });
    return <g><ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...stroke} />{parts}</g>;
  }
  if (sh.kind === "cube") {
    const dx = sw * 0.28, dy = shh * 0.22;
    const front = `${x1},${y1 + dy} ${x1 + sw - dx},${y1 + dy} ${x1 + sw - dx},${y2} ${x1},${y2}`;
    return (
      <g>
        <polygon points={front} {...stroke} />
        <polygon points={`${x1},${y1 + dy} ${x1 + dx},${y1} ${x2},${y1} ${x1 + sw - dx},${y1 + dy}`} {...stroke} />
        <polygon points={`${x1 + sw - dx},${y1 + dy} ${x2},${y1} ${x2},${y2 - dy} ${x1 + sw - dx},${y2}`} {...stroke} />
      </g>
    );
  }
  if (sh.kind === "cylinder") {
    return (
      <g>
        <ellipse cx={cx} cy={y1 + shh * 0.16} rx={sw / 2} ry={shh * 0.16} {...stroke} />
        <line x1={x1} y1={y1 + shh * 0.16} x2={x1} y2={y2 - shh * 0.16} stroke={c} strokeWidth="0.9" />
        <line x1={x2} y1={y1 + shh * 0.16} x2={x2} y2={y2 - shh * 0.16} stroke={c} strokeWidth="0.9" />
        <ellipse cx={cx} cy={y2 - shh * 0.16} rx={sw / 2} ry={shh * 0.16} {...stroke} />
      </g>
    );
  }
  if (sh.kind === "cone") {
    return (
      <g>
        <line x1={cx} y1={y1} x2={x1} y2={y2 - shh * 0.18} stroke={c} strokeWidth="0.9" />
        <line x1={cx} y1={y1} x2={x2} y2={y2 - shh * 0.18} stroke={c} strokeWidth="0.9" />
        <ellipse cx={cx} cy={y2 - shh * 0.18} rx={sw / 2} ry={shh * 0.18} {...stroke} />
      </g>
    );
  }
  if (sh.kind === "protractor") {
    const rx = sw / 2, ry = shh * 0.9;
    return (
      <g>
        <path d={`M ${x1} ${y2} A ${rx} ${ry} 0 0 1 ${x2} ${y2}`} {...stroke} />
        <line x1={x1} y1={y2} x2={x2} y2={y2} stroke={c} strokeWidth="0.9" />
        {Array.from({ length: 7 }, (_, i) => {
          const a = Math.PI * (1 - i / 6);
          return <line key={i} x1={cx} y1={y2} x2={cx + Math.cos(a) * rx * 0.85} y2={y2 - Math.sin(a) * ry * 0.85} stroke={c} strokeWidth="0.45" />;
        })}
      </g>
    );
  }
  if (sh.kind === "ruler") {
    return (
      <g>
        <rect x={x1} y={y1 + shh * 0.25} width={sw} height={shh * 0.5} {...stroke} />
        {Array.from({ length: 11 }, (_, i) => {
          const xx = x1 + (sw * i) / 10;
          const tall = i % 5 === 0;
          return <line key={i} x1={xx} y1={y1 + shh * 0.25} x2={xx} y2={y1 + shh * (tall ? 0.52 : 0.4)} stroke={c} strokeWidth="0.6" />;
        })}
      </g>
    );
  }
  if (sh.kind === "beaker") {
    return (
      <g>
        <path d={`M ${x1 + sw * 0.15} ${y1} L ${x1 + sw * 0.2} ${y2} L ${x1 + sw * 0.8} ${y2} L ${x1 + sw * 0.85} ${y1}`} {...stroke} />
        <line x1={x1 + sw * 0.28} y1={y1 + shh * 0.55} x2={x1 + sw * 0.72} y2={y1 + shh * 0.55} stroke={c} strokeWidth="0.6" strokeDasharray="1 0.8" />
      </g>
    );
  }
  if (sh.kind === "flask") {
    return <path d={`M ${x1 + sw * 0.38} ${y1} L ${x1 + sw * 0.38} ${y1 + shh * 0.35} L ${x1 + sw * 0.12} ${y2} L ${x1 + sw * 0.88} ${y2} L ${x1 + sw * 0.62} ${y1 + shh * 0.35} L ${x1 + sw * 0.62} ${y1}`} {...stroke} />;
  }
  if (sh.kind === "testtube") {
    return (
      <g>
        <line x1={x1 + sw * 0.3} y1={y1} x2={x1 + sw * 0.3} y2={y2 - shh * 0.15} stroke={c} strokeWidth="0.9" />
        <line x1={x1 + sw * 0.7} y1={y1} x2={x1 + sw * 0.7} y2={y2 - shh * 0.15} stroke={c} strokeWidth="0.9" />
        <path d={`M ${x1 + sw * 0.3} ${y2 - shh * 0.15} A ${sw * 0.2} ${shh * 0.15} 0 0 0 ${x1 + sw * 0.7} ${y2 - shh * 0.15}`} fill="none" stroke={c} strokeWidth="0.9" />
        <line x1={x1 + sw * 0.22} y1={y1} x2={x1 + sw * 0.78} y2={y1} stroke={c} strokeWidth="0.9" />
      </g>
    );
  }
  if (sh.kind === "atom") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={Math.min(sw, shh) * 0.08} fill={c} />
        <ellipse cx={cx} cy={cy} rx={sw * 0.48} ry={shh * 0.2} {...stroke} />
        <ellipse cx={cx} cy={cy} rx={sw * 0.48} ry={shh * 0.2} transform={`rotate(60 ${cx} ${cy})`} {...stroke} />
        <ellipse cx={cx} cy={cy} rx={sw * 0.48} ry={shh * 0.2} transform={`rotate(-60 ${cx} ${cy})`} {...stroke} />
      </g>
    );
  }
  if (sh.kind === "magnet") {
    return (
      <g>
        <path d={`M ${x1 + sw * 0.2} ${y1} L ${x1 + sw * 0.2} ${y2 - shh * 0.35} A ${sw * 0.3} ${shh * 0.35} 0 0 0 ${x1 + sw * 0.8} ${y2 - shh * 0.35} L ${x1 + sw * 0.8} ${y1}`} {...stroke} />
        <line x1={x1 + sw * 0.2} y1={y1 + shh * 0.22} x2={x1 + sw * 0.2} y2={y1} stroke="#be123c" strokeWidth="2.2" />
        <line x1={x1 + sw * 0.8} y1={y1 + shh * 0.22} x2={x1 + sw * 0.8} y2={y1} stroke="#1d4ed8" strokeWidth="2.2" />
      </g>
    );
  }
  if (sh.kind === "battery") {
    return (
      <g>
        <line x1={x1 + sw * 0.2} y1={y1 + shh * 0.15} x2={x1 + sw * 0.2} y2={y2 - shh * 0.15} stroke={c} strokeWidth="1.6" />
        <line x1={x1 + sw * 0.45} y1={y1 + shh * 0.32} x2={x1 + sw * 0.45} y2={y2 - shh * 0.32} stroke={c} strokeWidth="0.9" />
        <line x1={x1 + sw * 0.7} y1={y1 + shh * 0.15} x2={x1 + sw * 0.7} y2={y2 - shh * 0.15} stroke={c} strokeWidth="1.6" />
        <line x1={x1 + sw * 0.88} y1={y1 + shh * 0.32} x2={x1 + sw * 0.88} y2={y2 - shh * 0.32} stroke={c} strokeWidth="0.9" />
      </g>
    );
  }
  if (sh.kind === "resistor") {
    const mid = cy;
    return <polyline points={`${x1},${mid} ${x1 + sw * 0.15},${mid} ${x1 + sw * 0.25},${y1} ${x1 + sw * 0.4},${y2} ${x1 + sw * 0.55},${y1} ${x1 + sw * 0.7},${y2} ${x1 + sw * 0.85},${mid} ${x2},${mid}`} fill="none" stroke={c} strokeWidth="0.9" strokeLinejoin="round" />;
  }
  if (sh.kind === "bulb") {
    return (
      <g>
        <circle cx={cx} cy={y1 + shh * 0.42} r={Math.min(sw, shh) * 0.32} {...stroke} />
        <rect x={cx - sw * 0.12} y={y1 + shh * 0.7} width={sw * 0.24} height={shh * 0.22} {...stroke} />
        <line x1={cx - sw * 0.08} y1={y1 + shh * 0.3} x2={cx + sw * 0.08} y2={y1 + shh * 0.5} stroke={c} strokeWidth="0.6" />
      </g>
    );
  }
  if (sh.kind === "switch") {
    return (
      <g>
        <line x1={x1} y1={cy} x2={x1 + sw * 0.35} y2={cy} stroke={c} strokeWidth="0.9" />
        <circle cx={x1 + sw * 0.35} cy={cy} r={1.1} fill={c} />
        <line x1={x1 + sw * 0.35} y1={cy} x2={x1 + sw * 0.7} y2={y1 + shh * 0.15} stroke={c} strokeWidth="0.9" />
        <circle cx={x1 + sw * 0.72} cy={cy} r={1.1} fill={c} />
        <line x1={x1 + sw * 0.72} y1={cy} x2={x2} y2={cy} stroke={c} strokeWidth="0.9" />
      </g>
    );
  }
  if (sh.kind === "cycle") {
    const rx = sw * 0.36, ry = shh * 0.36;
    return (
      <g>
        <path d={`M ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry}`} fill="none" stroke={c} strokeWidth="0.9" />
        <polygon points={`${cx},${cy - ry - 1.6} ${cx - 1.8},${cy - ry + 1.2} ${cx + 1.8},${cy - ry + 1.2}`} fill={c} />
      </g>
    );
  }
  if (sh.kind === "flow") {
    const h = shh * 0.35;
    const chev = (ox: number) => `${ox},${cy} ${ox + sw * 0.18},${cy - h} ${ox + sw * 0.3},${cy - h} ${ox + sw * 0.12},${cy} ${ox + sw * 0.3},${cy + h} ${ox + sw * 0.18},${cy + h}`;
    return (
      <g>
        <polygon points={chev(x1)} {...stroke} />
        <polygon points={chev(x1 + sw * 0.34)} {...stroke} />
        <polygon points={chev(x1 + sw * 0.68)} {...stroke} />
      </g>
    );
  }
  if (sh.kind === "arrow") {
    const ang = Math.atan2(yB - yA, xB - xA);
    const hx = xB - Math.cos(ang) * 3, hy = yB - Math.sin(ang) * 3;
    const left = `${xB},${yB} ${hx + Math.cos(ang + 1.3) * 2},${hy + Math.sin(ang + 1.3) * 2} ${hx + Math.cos(ang - 1.3) * 2},${hy + Math.sin(ang - 1.3) * 2}`;
    return (
      <g>
        <line x1={xA} y1={yA} x2={xB} y2={yB} stroke={c} strokeWidth="0.9" strokeLinecap="round" />
        <polygon points={left} fill={c} />
      </g>
    );
  }
  return <line x1={xA} y1={yA} x2={xB} y2={yB} stroke={c} strokeWidth="0.9" strokeLinecap="round" />;
}
