"use client";

import type { ActivityState, ActivityType, Who } from "@/lib/activity";
import { useI18n } from "@/lib/i18n";

/** Student screens for the non-wall activities (filled in activity by activity). */
export function ActivityStudentView(props: { code: string; who: Who; state: ActivityState; closed: boolean; reload: () => void; now: number }) {
  const { lang } = useI18n();
  void props;
  return <p className="glass rounded-3xl p-8 text-center text-lg">{lang === "ar" ? "هذا النشاط قادم قريبًا." : "This activity is coming soon."}</p>;
}

/** Teacher (projector) screens for the non-wall activities. */
export function ActivityHostView(props: { code: string; hostKey: string; state: ActivityState; reload: () => void; now: number; big: boolean }) {
  const { lang } = useI18n();
  void props;
  return <p className="glass rounded-3xl p-8 text-center text-lg">{lang === "ar" ? "هذا النشاط قادم قريبًا." : "This activity is coming soon."}</p>;
}

/** Activity types whose screens are live (the admin create form only enables these). */
export const READY_TYPES: ActivityType[] = ["wall"];

/** Type-specific options in the admin create form (poll choices, survey questions, …). */
export function ActivityOptionsEditor(props: { type: ActivityType; options: Record<string, unknown>; setOptions: (o: Record<string, unknown>) => void }) {
  void props;
  return null;
}
