/** t384: one short class label used everywhere: whole class (or every section) = "6ABC"; chosen sections = "6C" / "6AC". */
export function classLabel(cls: string, sections: string[] = [], all: string[] = []): string {
  const pre = String(cls || "").replace(/^(year|grade|yr)\s*/i, "").trim();
  const letter = (x: string) => (pre && x.startsWith(pre) ? x.slice(pre.length) : x).trim();
  const simple = all.filter((x) => letter(x).length === 1);
  const use = !sections.length || (simple.length > 0 && simple.every((x) => sections.includes(x))) ? (sections.length ? sections : simple) : sections;
  return pre + [...new Set(use.map(letter).join("").split(""))].join("");
}
