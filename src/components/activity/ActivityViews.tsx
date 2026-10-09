"use client";

import { PollHost, PollOptions, PollStudent } from "@/components/activity/Poll";
import { SurveyHost, SurveyOptions, SurveyStudent, type SurveyQuestion } from "@/components/activity/Survey";
import { TpsHost, TpsOptions, TpsStudent } from "@/components/activity/ThinkPairShare";
import { VoteHost, VoteOptions, VoteStudent, type VoteChoice } from "@/components/activity/Vote";
import { WordCloudHost, WordCloudOptions, WordCloudStudent } from "@/components/activity/WordCloud";
import { activityApi, type ActivityState, type ActivityType, type Who } from "@/lib/activity";
import { useI18n } from "@/lib/i18n";

/** Student screens for the non-wall activities. */
export function ActivityStudentView(props: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void; now: number }) {
  const { lang } = useI18n();
  switch (props.state.type) {
    case "wordcloud":
      return <WordCloudStudent {...props} />;
    case "poll":
      return <PollStudent {...props} />;
    case "vote":
      return <VoteStudent {...props} />;
    case "survey":
      return <SurveyStudent {...props} />;
    case "tps":
      return <TpsStudent {...props} />;
  }
  return <p className="glass rounded-3xl p-8 text-center text-lg">{lang === "ar" ? "هذا النشاط قادم قريبًا." : "This activity is coming soon."}</p>;
}

/** Teacher (projector) screens for the non-wall activities. */
export function ActivityHostView(props: { code: string; hostKey: string; state: ActivityState; reload: () => void; now: number; big: boolean }) {
  const { lang } = useI18n();
  switch (props.state.type) {
    case "wordcloud":
      return <WordCloudHost {...props} />;
    case "poll":
      return <PollHost {...props} />;
    case "vote":
      return <VoteHost {...props} />;
    case "survey":
      return <SurveyHost {...props} />;
    case "tps":
      return <TpsHost {...props} />;
  }
  return <p className="glass rounded-3xl p-8 text-center text-lg">{lang === "ar" ? "هذا النشاط قادم قريبًا." : "This activity is coming soon."}</p>;
}

/** Activity types whose screens are live (the admin create form only enables these). */
export const READY_TYPES: ActivityType[] = ["wall", "wordcloud", "poll", "survey", "tps", "vote"];

/** Type-specific options in the admin create form (poll choices, survey questions, …). */
export function ActivityOptionsEditor(props: { type: ActivityType; options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  switch (props.type) {
    case "wordcloud":
      return <WordCloudOptions {...props} />;
    case "poll":
      return <PollOptions {...props} />;
    case "vote":
      return <VoteOptions {...props} />;
    case "survey":
      return <SurveyOptions {...props} />;
    case "tps":
      return <TpsOptions {...props} />;
  }
  return null;
}

/**
 * Cleans the create-form options. Returns null when they are not usable yet (e.g. fewer than two options).
 * `images` are vote option pictures to upload once the activity exists.
 */
export function prepareOptions(type: ActivityType, raw: Record<string, unknown>): { options: Record<string, unknown>; images: Record<number, string> } | null {
  const o = { ...raw };
  if (type === "poll") {
    const choices = (Array.isArray(o.choices) ? (o.choices as string[]) : []).map((c) => String(c).trim()).filter(Boolean);
    if (choices.length < 2) return null;
    return { options: { choices, multiple: o.multiple === true, showResults: o.showResults === true }, images: {} };
  }
  if (type === "vote") {
    const list = Array.isArray(o.choices) ? (o.choices as VoteChoice[]) : [];
    const imgs = (o._imgs as Record<number, string>) || {};
    const images: Record<number, string> = {};
    const choices: VoteChoice[] = [];
    list.forEach((c, i) => {
      const text = String(c?.text ?? "").trim();
      if (!text && !imgs[i]) return;
      if (imgs[i]) images[choices.length] = imgs[i];
      choices.push({ text: text || `#${choices.length + 1}` });
    });
    if (choices.length < 2) return null;
    return { options: { choices, votesEach: Math.min(Math.max(1, Number(o.votesEach) || 1), choices.length), anonymous: o.anonymous === true, showResults: o.showResults !== false }, images };
  }
  if (type === "survey") {
    const qs = (Array.isArray(o.questions) ? (o.questions as SurveyQuestion[]) : [])
      .map((q) => ({ kind: q.kind, q: String(q.q || "").trim(), ...(q.kind === "choice" ? { choices: (q.choices || []).map((c) => String(c).trim()).filter(Boolean) } : {}) }))
      .filter((q) => q.q && (q.kind !== "choice" || (q.choices?.length ?? 0) >= 2));
    if (!qs.length) return null;
    return { options: { questions: qs }, images: {} };
  }
  if (type === "wordcloud") return { options: { maxPerStudent: Math.min(5, Math.max(1, Number(o.maxPerStudent) || 3)) }, images: {} };
  if (type === "tps") return { options: { stage: "think", minutes: o.minutes || { think: 2, pair: 3, share: 5 } }, images: {} };
  return { options: {}, images: {} };
}

/** After create: uploads vote option pictures as hidden teacher items and links them to the options. */
export async function afterCreate(type: ActivityType, code: string, hostKey: string, options: Record<string, unknown>, images: Record<number, string>) {
  if (type !== "vote" || !Object.keys(images).length) return;
  const choices = [...(options.choices as VoteChoice[])];
  for (const [k, image] of Object.entries(images)) {
    try {
      const r = await activityApi.post(code, { hostKey }, { image, kind: "optimg" });
      choices[Number(k)] = { ...choices[Number(k)], item: r.id };
    } catch {
      // keep the option without its picture
    }
  }
  await activityApi.settings(code, hostKey, { settings: { options: { ...options, choices } } }).catch(() => undefined);
}
