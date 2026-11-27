/**
 * t411: Success Criteria for results saved before their questions were tagged.
 * A result keeps each question's prompt; the assessment's current questions carry `sc` tags ("<unitId>#<i>").
 * Matching the prompt text (never the position) gives each old answer the SC of the same question today,
 * so the tracker scores every SC from that student's real answers instead of copying one overall % into all SCs.
 */
export type ScDefs = Record<string, Record<string, string>>; // quiz id or slug → normalised prompt → sc tag
type Q = { prompt?: unknown; sc?: unknown };
type QuizLike = { id?: unknown; slug?: unknown; questions?: unknown };
export type Detail = { sc?: string; prompt?: string; earned: number; points: number };

const TAG = /^[\w-]{1,40}#\d{1,2}$/;
export const normPrompt = (s: unknown) => String(s ?? "").slice(0, 600).replace(/\s+/g, " ").trim().toLowerCase();

/** Prompt → tag for every assessment that has tagged questions. A prompt used twice with different tags is ambiguous and dropped. */
export function scDefsFrom(quizzes: QuizLike[], into: ScDefs = {}): ScDefs {
  for (const q of quizzes) {
    const qs = Array.isArray(q.questions) ? (q.questions as Q[]) : [];
    const map: Record<string, string> = {}; const bad = new Set<string>();
    for (const x of qs) {
      const tag = typeof x.sc === "string" && TAG.test(x.sc) ? x.sc : ""; const p = normPrompt(x.prompt);
      if (!tag || !p) continue;
      if (map[p] && map[p] !== tag) bad.add(p); else map[p] = tag;
    }
    for (const p of bad) delete map[p];
    if (!Object.keys(map).length) continue;
    for (const k of [q.id, q.slug].map((v) => String(v || "")).filter(Boolean)) into[k] = { ...(into[k] || {}), ...map };
  }
  return into;
}

/** Fill the missing `sc` of each answer from the assessment's current tags (answers that already carry a tag keep it). */
/** t420: `stale` = units whose SC were replaced; an answer saved with a tag on such a unit takes today's tag for its prompt (or none). */
export function retag<T extends Detail>(details: T[], defs: ScDefs | null | undefined, keys: (string | undefined)[], stale?: Set<string>): T[] {
  if (!defs) return details;
  const maps = keys.map((k) => (k ? defs[k] : undefined)).filter(Boolean) as Record<string, string>[];
  if (!maps.length) return details;
  return details.map((d) => {
    const old = !!d.sc && !!stale && stale.has(String(d.sc).split("#")[0]);
    if (d.sc && !old) return d;
    const p = normPrompt(d.prompt);
    if (p) for (const m of maps) if (m[p]) return { ...d, sc: m[p] };
    if (old) { const { sc: _s, ...rest } = d; return rest as T; }
    return d;
  });
}
