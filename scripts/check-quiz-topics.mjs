// Build-time guard: every assessment is linked to one curriculum topic, and a topic has only one assessment.
// A failing check stops the deploy, so the live site keeps its last good version.
import { readFileSync } from "node:fs";
const EXEMPT = new Set(["welcome-quiz"]); // general practice quiz (not part of the curriculum)
const { quizzes = [] } = JSON.parse(readFileSync(new URL("../public/content/quizzes.json", import.meta.url), "utf8"));
const seen = new Map();
const errs = [];
for (const q of quizzes) {
  if (EXEMPT.has(q.slug)) continue;
  if (!q.topic) { errs.push(`"${q.slug}" has no curriculum topic`); continue; }
  if (seen.has(q.topic)) errs.push(`"${q.slug}" uses the same topic as "${seen.get(q.topic)}"`);
  else seen.set(q.topic, q.slug);
}
if (errs.length) { console.error("Assessment topic check failed:\n  " + errs.join("\n  ")); process.exit(1); }
console.log(`Assessment topic check: ${seen.size} assessments, one per topic.`);
