import assert from "node:assert/strict";
import { test } from "node:test";
import { retag, scDefsFrom } from "../src/scRetag";

const quiz = { id: "sow-y3-nuh", slug: "year-3-nuh", questions: [
  { prompt: "Who sent Prophet Nuh (A.S) to his people?", sc: "cu_u1#0" },
  { prompt: "What did Allah tell Nuh (A.S) to build?", sc: "cu_u1#1" },
  { prompt: "What does Nuh teach you to do?", sc: "cu_u1#2" },
  { prompt: "Untagged question" },
] };

// Same per-SC rule as the tracker: earned/points on that SC's questions → 0–3.
const perSc = (d: { sc?: string; earned: number; points: number }[]) => {
  const m = new Map<string, { e: number; p: number }>();
  for (const x of d) if (x.sc) { const v = m.get(x.sc) || { e: 0, p: 0 }; v.e += x.earned; v.p += x.points; m.set(x.sc, v); }
  return Object.fromEntries([...m].map(([k, v]) => [k, Math.round((v.e / v.p) * 3)]));
};

test("old untagged answers get each question's own SC by prompt, so SC scores differ per student answer", () => {
  const defs = scDefsFrom([quiz]);
  const saved = [ // a result saved before tagging (whitespace/case differences are tolerated)
    { prompt: "Who sent Prophet Nuh (A.S) to his people?", earned: 1, points: 1 },
    { prompt: "what did Allah tell  Nuh (A.S) to build?", earned: 0, points: 1 },
    { prompt: "What does Nuh teach you to do?", earned: 1, points: 1 },
    { prompt: "Untagged question", earned: 1, points: 1 },
  ];
  const out = retag(saved, defs, ["year-3-nuh"]);
  assert.deepEqual(out.map((d) => d.sc), ["cu_u1#0", "cu_u1#1", "cu_u1#2", undefined]);
  assert.deepEqual(perSc(out), { "cu_u1#0": 3, "cu_u1#1": 0, "cu_u1#2": 3 }); // not one copied value
});

test("answers that already carry a tag keep it; unknown quizzes and prompts are left untagged (never a default)", () => {
  const defs = scDefsFrom([quiz]);
  const d = [{ sc: "cu_x#4", prompt: "Who sent Prophet Nuh (A.S) to his people?", earned: 1, points: 1 }, { prompt: "Something else", earned: 1, points: 1 }];
  assert.deepEqual(retag(d, defs, ["sow-y3-nuh"]).map((x) => x.sc), ["cu_x#4", undefined]);
  assert.deepEqual(retag(d, defs, ["other-quiz"]).map((x) => x.sc), ["cu_x#4", undefined]);
  assert.deepEqual(retag(d, null, ["sow-y3-nuh"]), d);
});

test("a prompt used twice with different tags is ambiguous and not guessed", () => {
  const defs = scDefsFrom([{ slug: "q", questions: [{ prompt: "Same?", sc: "u#0" }, { prompt: "Same?", sc: "u#1" }, { prompt: "Bad tag", sc: "nope" }] }]);
  assert.equal(defs.q, undefined);
});
