/** t682 C: Self Assessment (task/homework) and Peer Assessment options. */
export type SaId = "proud" | "tried" | "understood" | "practice" | "hard";
export const SA_OPTIONS: { id: SaId; en: string; ar: string; icon: string; color: string }[] = [
  { id: "proud", en: "I'm proud of this work", ar: "أنا فخور بهذا العمل", icon: "🌟", color: "from-amber-300 to-orange-400" },
  { id: "tried", en: "I tried my best", ar: "اجتهدت قدر استطاعتي", icon: "💪", color: "from-sky-300 to-blue-500" },
  { id: "understood", en: "I understood this", ar: "فهمت هذا", icon: "✅", color: "from-emerald-300 to-teal-500" },
  { id: "practice", en: "I need more practice", ar: "أحتاج مزيدًا من التدرّب", icon: "🔁", color: "from-violet-300 to-purple-500" },
  { id: "hard", en: "I found this hard", ar: "وجدت هذا صعبًا", icon: "🤔", color: "from-rose-300 to-pink-500" },
];
export const saOf = (id: string) => SA_OPTIONS.find((x) => x.id === id) || null;
