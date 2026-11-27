/**
 * Logic checks for schoolAssessmentsFor (must match src/components/lms/LmsAssessments.tsx).
 * Assessment slugs only — no student names.
 */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/lms/LmsAssessments.tsx", import.meta.url), "utf8");
const m = src.match(/export function schoolAssessmentsFor[\s\S]*?\n\}/);
if (!m) throw new Error("schoolAssessmentsFor not found");
const fnSrc = m[0]
  .replace("export function schoolAssessmentsFor", "function schoolAssessmentsFor")
  .replace(/\(me: \{ role: string; perms: string\[\] \} \| null, quizzes: Quiz\[\]\): Quiz\[\]/, "(me, quizzes)");
const run = new Function(`${fnSrc}\nreturn schoolAssessmentsFor;`)();

const quizzes = [
  { slug: "vis-active", visible: true, active: true },
  { slug: "vis-inactive", visible: true, active: false },
  { slug: "hidden-inactive", visible: false, active: false },
  { slug: "hidden-active", visible: false, active: true },
];

function slugs(me) { return run(me, quizzes).map((q) => q.slug); }

const cases = [
  ["student", { role: "student", perms: [] }, ["vis-active"]],
  ["teacher host:* includes hidden", { role: "teacher", perms: ["host:*"] }, ["vis-active", "vis-inactive", "hidden-inactive", "hidden-active"]],
  ["teacher specific slugs includes hidden", { role: "teacher", perms: ["host:hidden-inactive", "host:vis-active"] }, ["vis-active", "hidden-inactive"]],
  ["teacher with no host perms", { role: "teacher", perms: [] }, []],
  ["admin sees full catalog", { role: "admin", perms: [] }, ["vis-active", "vis-inactive", "hidden-inactive", "hidden-active"]],
  ["null me", null, []],
];

let fail = 0;
for (const [name, me, want] of cases) {
  const got = slugs(me);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(ok ? "OK" : "FAIL", name, "got", got);
}
if (fail) {
  console.log("LOGIC_FAIL", fail);
  process.exit(1);
}
console.log("LOGIC_PASS");
