import { ASSESSMENT_API_BASE } from "@/lib/groupSession";
import { getServerSession } from "@/lib/adminServer";
import type { QuizzesData } from "@/lib/quiz";

type SyncErr = { error?: string; slug?: string; title?: string; existing?: { slug: string; title: string } };

/** Server check before quizzes.json is published: every assessment needs a curriculum topic, one per topic.
 *  On success the curriculum links are updated to match. Returns an error message, or null when OK. */
export async function syncQuizTopics(data: QuizzesData, lang: "en" | "ar", dry = false): Promise<string | null> {
  const tok = getServerSession()?.token;
  const ar = lang === "ar";
  let body: SyncErr & { ok?: boolean } = {};
  try {
    const r = await fetch(`${ASSESSMENT_API_BASE}/api/lms/quiz-topics-sync`, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify({ dry, quizzes: data.quizzes.map((q) => ({ slug: q.slug, title: q.title, topic: q.topic || "" })) }) });
    body = await r.json().catch(() => ({}));
  } catch { return ar ? "تعذّر الاتصال بالخادم للتحقق من مواضيع التقييمات." : "Could not reach the server to check assessment topics."; }
  if (body.ok) return null;
  const t = body.title || body.slug || "";
  if (body.error === "topic_required") return ar ? `لا يمكن النشر: التقييم «${t}» غير مرتبط بموضوع من المنهج.` : `Not published: “${t}” has no curriculum topic. Every assessment must be linked to one.`;
  if (body.error === "topic_unknown") return ar ? `لا يمكن النشر: موضوع التقييم «${t}» غير موجود في المنهج.` : `Not published: the topic of “${t}” is not in the curriculum any more.`;
  if (body.error === "topic_taken") return ar ? `لا يمكن النشر: هذا الموضوع مرتبط بالفعل بالتقييم «${body.existing?.title || body.existing?.slug}». لكل موضوع تقييم واحد فقط (${t}).` : `Not published: “${t}” uses a topic that already has an assessment — “${body.existing?.title || body.existing?.slug}”. Only one assessment per topic.`;
  return ar ? "تعذّر التحقق من مواضيع التقييمات." : `Could not check assessment topics (${body.error || "error"}).`;
}
