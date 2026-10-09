/** About page content (about.json): hero + ordered sections of entries. Built from the CV; editable in Admin → About. */
export type AboutItem = { id: string; title: string; titleAr?: string; org?: string; orgAr?: string; period?: string; periodAr?: string; location?: string; locationAr?: string; text?: string; textAr?: string; logo?: string; monogram?: string; url?: string };
export type AboutSection = { id: string; kind: "timeline" | "cards" | "chips" | "links" | "text"; title: string; titleAr?: string; icon?: string; hidden?: boolean; text?: string; textAr?: string; items: AboutItem[] };
export type AboutData = { hero: { name: string; nameAr?: string; title: string; titleAr?: string; bio: string; bioAr?: string; photo: string; email: string; location?: string; locationAr?: string }; sections: AboutSection[] };

export const ABOUT_PATH = "/content/about.json";
export const GITHUB_ABOUT_PATH = "public/content/about.json";
export const fav = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

export const defaultAbout = (): AboutData => ({
  hero: {
    name: "Shaiq Muhammad", nameAr: "شائق محمد",
    title: "Islamic Education B Teacher", titleAr: "معلم التربية الإسلامية (ب)",
    bio: "My aim is to instill not only knowledge but also a sense of moral and ethical values rooted in Islamic teachings. By creating an engaging and interactive classroom experience while applying technology, my aim is to empower my students with a strong foundation in Islamic education, enabling them to navigate the complexities of the modern world while upholding the principles of their faith.",
    bioAr: "هدفي أن أغرس في طلابي المعرفة وكذلك القيم الأخلاقية المستمدة من التعاليم الإسلامية. ومن خلال بيئة صفية تفاعلية وممتعة توظّف التقنية، أسعى إلى تمكين طلابي من أساس متين في التربية الإسلامية يعينهم على مواجهة تعقيدات العالم الحديث مع التمسك بمبادئ دينهم.",
    photo: "/logo.svg", email: "contact@shaiqmuhammad.com", location: "Dubai, UAE", locationAr: "دبي، الإمارات",
  },
  sections: [
    { id: "experience", kind: "timeline", title: "Experience", titleAr: "الخبرات", icon: "💼", items: [
      { id: "e1", title: "Islamic B Teacher (Primary)", titleAr: "معلم التربية الإسلامية (ب) — المرحلة الابتدائية", org: "Raffles International School", orgAr: "مدرسة رافلز الدولية", location: "Dubai", locationAr: "دبي", period: "Aug 2017 – Present", periodAr: "أغسطس 2017 – حتى الآن", monogram: "RIS", url: "https://www.rafflesis.com" },
      { id: "e2", title: "Islamic B Teacher (Primary / Secondary)", titleAr: "معلم التربية الإسلامية (ب) — الابتدائي / الثانوي", org: "GEMS Our Own Indian School", orgAr: "مدرسة جيمس أور أون الهندية", location: "Dubai", locationAr: "دبي", period: "Apr 2015 – Jun 2017", periodAr: "أبريل 2015 – يونيو 2017", logo: fav("gemsoo-alquoz.com"), url: "https://www.gemsoo-alquoz.com" },
      { id: "e3", title: "Islamic B Teacher (Primary / Secondary)", titleAr: "معلم التربية الإسلامية (ب) — الابتدائي / الثانوي", org: "Pakistan Education Academy", orgAr: "أكاديمية باكستان التعليمية", location: "Dubai", locationAr: "دبي", period: "Nov 2012 – Mar 2015", periodAr: "نوفمبر 2012 – مارس 2015", logo: fav("pea.ae"), url: "https://www.pea.ae" },
      { id: "e4", title: "Quran / Islamic Teacher", titleAr: "معلم القرآن والتربية الإسلامية", org: "Eaalim Institute", orgAr: "معهد إعليم", location: "UK", locationAr: "المملكة المتحدة", period: "Nov 2009 – Mar 2012", periodAr: "نوفمبر 2009 – مارس 2012", logo: fav("eaalim.com"), url: "https://www.eaalim.com" },
    ] },
    { id: "education", kind: "timeline", title: "Education", titleAr: "التعليم", icon: "🎓", items: [
      { id: "d1", title: "M.Ed in Education", titleAr: "ماجستير في التربية (M.Ed)", monogram: "M.Ed" },
      { id: "d2", title: "M.A in Islamic Studies", titleAr: "ماجستير في الدراسات الإسلامية", monogram: "M.A" },
      { id: "d3", title: "7-Year Islamic Studies Diploma (Arabic medium)", titleAr: "دبلوم الدراسات الإسلامية لمدة 7 سنوات (باللغة العربية)", org: "Abubakr Islamic University", orgAr: "جامعة أبي بكر الإسلامية", logo: fav("abibakr.com"), url: "https://abibakr.com" },
      { id: "d4", title: "Memorization of the Quran (Hifz)", titleAr: "حفظ القرآن الكريم", monogram: "📖" },
    ] },
    { id: "qualifications", kind: "cards", title: "Professional qualifications", titleAr: "المؤهلات المهنية", icon: "🏅", items: [
      { id: "q1", title: "NPQLT — National Professional Qualification for Leading Teaching", titleAr: "NPQLT — المؤهل المهني الوطني لقيادة التدريس", org: "LLSE", location: "Dubai, UAE", locationAr: "دبي، الإمارات", logo: fav("llse.org.uk"), url: "https://www.llse.org.uk/npqlt" },
    ] },
    { id: "expertise", kind: "chips", title: "Expertise & skills", titleAr: "الخبرات والمهارات", icon: "✨", items: [
      { id: "x1", title: "Animated videos for the subject", titleAr: "فيديوهات متحركة للمادة" },
      { id: "x2", title: "Developed an Islamic website", titleAr: "تطوير موقع إسلامي" },
      { id: "x3", title: "Comfortable with teaching apps", titleAr: "إتقان تطبيقات التدريس" },
      { id: "x4", title: "Teaching Quran in creative ways", titleAr: "تعليم القرآن بأساليب إبداعية" },
      { id: "x5", title: "Critical thinking", titleAr: "التفكير الناقد" },
      { id: "x6", title: "Pressure management", titleAr: "إدارة الضغوط" },
      { id: "x7", title: "Leadership", titleAr: "القيادة" },
      { id: "x8", title: "Teamwork", titleAr: "العمل الجماعي" },
    ] },
    { id: "languages", kind: "chips", title: "Languages", titleAr: "اللغات", icon: "🗣️", items: [
      { id: "l1", title: "English", titleAr: "الإنجليزية" }, { id: "l2", title: "Arabic", titleAr: "العربية" }, { id: "l3", title: "Urdu / Hindi", titleAr: "الأردية / الهندية" },
    ] },
    { id: "creativity", kind: "links", title: "Samples of creativity within the subject", titleAr: "نماذج من الإبداع في المادة", icon: "🎬", items: [
      { id: "c1", title: "YouTube — @almudarris_ins", titleAr: "يوتيوب — ‎@almudarris_ins", url: "https://youtube.com/@almudarris_ins", logo: fav("youtube.com") },
      { id: "c2", title: "shaiqmuhammad.com", url: "https://shaiqmuhammad.com", logo: "/logo.svg" },
    ] },
  ],
});

const s = (v: unknown, n = 4000) => (typeof v === "string" ? v.slice(0, n) : undefined);
const KINDS = ["timeline", "cards", "chips", "links", "text"] as const;
export function normalizeAbout(raw: unknown): AboutData {
  const d = defaultAbout();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as { hero?: Record<string, unknown>; sections?: unknown[] };
  const h = r.hero || {};
  const hero: AboutData["hero"] = { name: s(h.name, 120) || d.hero.name, nameAr: s(h.nameAr, 120), title: s(h.title, 200) ?? d.hero.title, titleAr: s(h.titleAr, 200), bio: s(h.bio, 6000) ?? "", bioAr: s(h.bioAr, 6000), photo: s(h.photo, 300000) || d.hero.photo, email: s(h.email, 200) || d.hero.email, location: s(h.location, 120), locationAr: s(h.locationAr, 120) };
  const sections: AboutSection[] = (Array.isArray(r.sections) ? r.sections : []).slice(0, 30).map((x, i) => {
    const o = (x || {}) as Record<string, unknown>;
    return {
      id: s(o.id, 60) || `sec${i}`, kind: (KINDS as readonly string[]).includes(String(o.kind)) ? (o.kind as AboutSection["kind"]) : "cards",
      title: s(o.title, 200) || "", titleAr: s(o.titleAr, 200), icon: s(o.icon, 8), hidden: o.hidden === true, text: s(o.text), textAr: s(o.textAr),
      items: (Array.isArray(o.items) ? o.items : []).slice(0, 60).map((y, j) => {
        const it = (y || {}) as Record<string, unknown>;
        return { id: s(it.id, 60) || `i${j}`, title: s(it.title, 300) || "", titleAr: s(it.titleAr, 300), org: s(it.org, 200), orgAr: s(it.orgAr, 200), period: s(it.period, 80), periodAr: s(it.periodAr, 80), location: s(it.location, 120), locationAr: s(it.locationAr, 120), text: s(it.text, 3000), textAr: s(it.textAr, 3000), logo: s(it.logo, 100000), monogram: s(it.monogram, 8), url: s(it.url, 1000) };
      }),
    };
  });
  return { hero, sections };
}

export async function loadAboutData(): Promise<AboutData> {
  try {
    const res = await fetch(ABOUT_PATH, { cache: "no-store" });
    if (!res.ok) return defaultAbout();
    return normalizeAbout(await res.json());
  } catch {
    return defaultAbout();
  }
}
