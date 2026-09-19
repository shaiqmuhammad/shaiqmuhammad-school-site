/** Markdown-ish → HTML for lesson bodies: headings, lists, bold, links, images, YouTube. */

export function renderMarkdownLite(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      closeLists();
      continue;
    }

    const ytBlock = trimmed.match(/^:::youtube\s+(.+)$/i);
    if (ytBlock) {
      flushPara();
      closeLists();
      const id = extractId(ytBlock[1]);
      if (id) {
        out.push(
          `<div class="video-embed"><iframe title="YouTube video" src="https://www.youtube.com/embed/${id}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`,
        );
      }
      continue;
    }

    const imgOnly = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgOnly) {
      flushPara();
      closeLists();
      const alt = escapeHtml(imgOnly[1] || "Image");
      const src = escapeAttr(imgOnly[2].trim());
      out.push(
        `<figure class="lesson-figure"><img src="${src}" alt="${alt}" loading="lazy" /><figcaption>${alt}</figcaption></figure>`,
      );
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushPara();
      closeLists();
      out.push(`<h1>${inline(trimmed.slice(2))}</h1>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushPara();
      closeLists();
      out.push(`<h2>${inline(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushPara();
      closeLists();
      out.push(`<h3>${inline(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flushPara();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }
    closeLists();
    para.push(trimmed);
  }
  flushPara();
  closeLists();
  return out.join("\n");
}

function extractId(raw: string): string | null {
  const t = raw.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = t.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  const ok =
    /^https?:\/\//i.test(s) ||
    s.startsWith("/") ||
    /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(s);
  if (!ok) return "";
  return escapeHtml(s);
}

function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const src = escapeAttr(String(url).trim());
    if (!src) return escapeHtml(String(alt || ""));
    return `<img src="${src}" alt="${escapeHtml(String(alt || "Image"))}" class="inline-lesson-img" loading="lazy" />`;
  });
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return t;
}
