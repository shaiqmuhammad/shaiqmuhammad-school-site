"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { LANG_STORAGE_KEY } from "@/lib/langStorage";

export type Lang = "en" | "ar";
export { LANG_STORAGE_KEY };

const LANG_EVENT = "sm-lang-change";

const ar: Record<string, string> = {
  // Nav
  "nav./": "الرئيسية",
  "nav./encyclopedia/quran": "القرآن",
  "nav./encyclopedia/hadith": "الحديث",
  "nav./lessons": "الدروس",
  "nav./videos": "الفيديوهات",
  "nav./assessments": "التقييمات",
  "nav./quizzes": "التقييمات",
  "nav./forum": "المنتدى",
  "nav./about": "من نحن",
  "nav./contact": "اتصل بنا",
  // Chrome
  "header.tagline": "منصة تعليمية للطلاب",
  "header.menu": "فتح القائمة",
  "header.libraries": "المكتبات التعليمية",
  "enc.quran": "موسوعة القرآن الكريم",
  "enc.hadith": "موسوعة الحديث النبوي",
  "nav.resources": "مصادر الطلاب",
  "enc.quran-com": "القرآن الكريم (Quran.com)",
  "enc.sunnah": "السنة النبوية (Sunnah.com)",
  "ticker.label": "تعلّم",
  "footer.tagline": "بيت تعليمي هادئ لطلاب شائق محمد",
  "footer.location": "دبي، الإمارات العربية المتحدة",
  "footer.quickLinks": "روابط سريعة",
  "footer.copyright": "© شائق محمد. جميع الحقوق محفوظة.",
  "theme.toDark": "التبديل إلى الوضع الداكن",
  "theme.toLight": "التبديل إلى الوضع الفاتح",
  "lang.switch": "Switch to English",
  // Videos
  "videos.empty": "لا توجد فيديوهات منشورة بعد. يرجى العودة قريبًا.",
  "videos.watch": "شاهد على يوتيوب",
  // Admin login
  "adminLogin.eyebrow": "المشرف",
  "adminLogin.title": "تسجيل الدخول",
  "adminLogin.desc": "إدارة الدروس والفيديوهات والتقييمات واللافتات لطلاب شائق محمد.",
  "adminLogin.password": "كلمة مرور المشرف",
  "adminLogin.continue": "متابعة",
  "adminLogin.checking": "جارٍ التحقق…",
  "adminLogin.incorrect": "كلمة المرور غير صحيحة.",
  "adminLogin.notConfigured": "لم يتم إعداد تسجيل دخول المشرف بعد (رمز كلمة المرور مفقود).",
  "adminLogin.back": "العودة إلى موقع التعلم",
  // Admin CMS chrome
  "admin.eyebrow": "إدارة المحتوى",
  "admin.title": "إدارة المحتوى التعليمي",
  "admin.checking": "جارٍ التحقق من جلسة المشرف…",
  "admin.download": "تنزيل data.json",
  "admin.publishContent": "نشر المحتوى",
  "admin.publishAll": "نشر الكل",
  "admin.publishing": "جارٍ النشر…",
  "admin.viewSite": "عرض الموقع",
  "admin.logout": "تسجيل الخروج",
  "admin.tab.pages": "الصفحات",
  "admin.tab.videos": "الفيديوهات",
  "admin.tab.quizzes": "التقييمات",
  "admin.tab.certificate": "الشهادة",
  "admin.tab.banners": "اللافتات",
  "admin.tab.teacher": "المعلم",
  "admin.tab.forum": "المنتدى",
  "admin.tab.settings": "الإعدادات",
  "admin.pages.heading": "صفحات التعلم",
  "admin.pages.new": "+ صفحة جديدة",
  "admin.videos.heading": "فيديوهات يوتيوب",
  "admin.videos.new": "+ فيديو جديد",
  "admin.videos.url": "رابط يوتيوب أو المعرّف",
  "admin.videos.detected": "المعرّف المكتشف",
  "admin.videos.invalid": "لم يتم التعرف على رابط يوتيوب صالح",
  "admin.videos.save": "حفظ الفيديو",
  "admin.videos.empty": "لا توجد فيديوهات بعد.",
  "admin.videos.hint": "الحفظ محلي فقط في هذا المتصفح. اضغط «نشر المحتوى» (يتطلب رمز GitHub في الإعدادات) لتظهر الفيديوهات في صفحة /videos بعد إعادة البناء (١–٢ دقيقة).",
  "admin.unpublished": "توجد تغييرات غير منشورة — اضغط «نشر المحتوى» أو «نشر الكل».",
  "admin.field.title": "العنوان",
  "admin.field.description": "الوصف",
  "admin.published": "منشور",
  "admin.draft": "مسودة",
  "admin.edit": "تعديل",
  "admin.delete": "حذف",
  "admin.cancel": "إلغاء",
  "admin.teacher.heading": "ملف المعلم",
  "admin.forum.heading": "إشراف منتدى الأطفال",
  "admin.settings.heading": "إعدادات النشر",
};

/** Exact English → Arabic for page hero copy (PageHero) and other free text. */
const arText: Record<string, string> = {
  Videos: "الفيديوهات",
  "Video lessons": "دروس الفيديو",
  "Watch explanations from your teacher. You can pause, rewind, and revisit anytime.":
    "شاهد شروحات معلمك. يمكنك الإيقاف والرجوع والمراجعة في أي وقت.",
  Practice: "تدريب",
  Quizzes: "الاختبارات",
  "Test what you have learned. Each quiz is timed — finish it to download your certificate.":
    "اختبر ما تعلمته. كل اختبار محدد بوقت — أكمله لتنزيل شهادتك.",
  "Kids forum": "منتدى الأطفال",
  "Ask, share, encourage": "اسأل، شارك، شجّع",
  "A calm space for students. Use a display name only — be kind, stay on-topic, never share private information.":
    "مساحة هادئة للطلاب. استخدم اسمًا مستعارًا فقط — كن لطيفًا، والتزم بالموضوع، ولا تشارك معلومات خاصة.",
  About: "من نحن",
  "Learning with Shaiq Muhammad": "التعلّم مع شائق محمد",
  "An educational platform for students — encyclopedias, lessons, and video classes in one calm place.":
    "منصة تعليمية للطلاب — موسوعات ودروس وحصص فيديو في مكان واحد هادئ.",
  Lessons: "الدروس",
  "Learning pages": "صفحات التعلم",
  "Notes, summaries, and guidance from your teacher — read at your own pace.":
    "ملاحظات وملخصات وإرشادات من معلمك — اقرأ بالسرعة التي تناسبك.",
  "Get in touch": "تواصل معنا",
  Contact: "اتصل بنا",
  "Questions about lessons, classes, or the learning platform? Reach out — we are happy to help.":
    "لديك أسئلة عن الدروس أو الحصص أو المنصة؟ تواصل معنا — يسعدنا مساعدتك.",
  Lesson: "درس",
  "Welcome students — open the Encyclopedia of Quran and Hadith from Home or the nav":
    "أهلًا بالطلاب — افتحوا موسوعة القرآن وموسوعة الحديث من الصفحة الرئيسية أو القائمة",
  "New video lessons and written pages are published regularly — check Lessons & Videos":
    "تُنشر دروس فيديو وصفحات مكتوبة جديدة بانتظام — تابعوا الدروس والفيديوهات",
  Quiz: "اختبار",
  Assessments: "التقييمات",
  Assessment: "تقييم",
  "Test what you have learned. Each assessment is timed — finish it to download your certificate.":
    "اختبر ما تعلّمته. لكل تقييم وقت محدد — أكمله لتنزيل شهادتك.",
};

const en: Record<string, string> = {
  "header.tagline": "Student learning platform",
  "header.menu": "Toggle menu",
  "header.libraries": "Learning libraries",
  "ticker.label": "Learn",
  "footer.quickLinks": "Quick links",
  "theme.toDark": "Switch to dark mode",
  "theme.toLight": "Switch to light mode",
  "lang.switch": "التبديل إلى العربية",
  "videos.empty": "No published videos yet. Please check back soon.",
  "videos.watch": "Watch on YouTube",
  "adminLogin.eyebrow": "Admin",
  "adminLogin.title": "Sign in",
  "adminLogin.desc": "Manage lessons, videos, assessments, and banners for students of Shaiq Muhammad.",
  "adminLogin.password": "Admin password",
  "adminLogin.continue": "Continue",
  "adminLogin.checking": "Checking…",
  "adminLogin.incorrect": "Incorrect password.",
  "adminLogin.notConfigured": "Admin sign-in is not configured yet (password hash missing).",
  "adminLogin.back": "Back to learning site",
  "admin.eyebrow": "CMS",
  "admin.title": "Learning content admin",
  "admin.checking": "Checking admin session…",
  "admin.download": "Download data.json",
  "admin.publishContent": "Publish content",
  "admin.publishAll": "Publish all",
  "admin.publishing": "Publishing…",
  "admin.viewSite": "View site",
  "admin.logout": "Log out",
  "admin.tab.pages": "Pages",
  "admin.tab.videos": "Videos",
  "admin.tab.quizzes": "Assessments",
  "admin.tab.certificate": "Certificate",
  "admin.tab.banners": "Banners",
  "admin.tab.teacher": "Teacher",
  "admin.tab.forum": "Forum",
  "admin.tab.settings": "Settings",
  "admin.pages.heading": "Learning pages",
  "admin.pages.new": "+ New page",
  "admin.videos.heading": "YouTube videos",
  "admin.videos.new": "+ New video",
  "admin.videos.url": "YouTube URL or ID",
  "admin.videos.detected": "Detected ID",
  "admin.videos.invalid": "Not a recognised YouTube URL/ID",
  "admin.videos.save": "Save video",
  "admin.videos.empty": "No videos yet.",
  "admin.videos.hint":
    "Saving only keeps changes in this browser. Click “Publish content” (needs a GitHub token in Settings) so videos appear on /videos after the rebuild (~1–2 min). Paste any YouTube link: watch?v=, youtu.be/, shorts/, embed/ or live/.",
  "admin.unpublished": "You have unpublished changes — click “Publish content” or “Publish all”.",
  "admin.field.title": "Title",
  "admin.field.description": "Description",
  "admin.published": "Published",
  "admin.draft": "Draft",
  "admin.edit": "Edit",
  "admin.delete": "Delete",
  "admin.cancel": "Cancel",
  "admin.teacher.heading": "Teacher profile",
  "admin.forum.heading": "Kids forum moderation",
  "admin.settings.heading": "Publish settings",
};

function readLang(): Lang {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === LANG_STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LANG_EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LANG_EVENT, cb);
  };
}

type I18nValue = {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** Translate a key; `fallback` is the English text (defaults to the en table, then the key). */
  t: (key: string, fallback?: string) => string;
  /** Translate free English text if an Arabic version exists. */
  tx: (text: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore<Lang>(subscribe, readLang, () => "en");

  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang === "ar" ? "ar" : "en-GB";
    el.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // storage unavailable — still update this tab
    }
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = (key: string, fallback?: string) =>
      lang === "ar" ? ar[key] ?? fallback ?? en[key] ?? key : fallback ?? en[key] ?? key;
    const tx = (text: string) => (lang === "ar" ? arText[text] ?? text : text);
    return {
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      setLang,
      toggleLang: () => setLang(lang === "ar" ? "en" : "ar"),
      t,
      tx,
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      lang: "en",
      dir: "ltr",
      setLang: () => undefined,
      toggleLang: () => undefined,
      t: (key, fallback) => fallback ?? en[key] ?? key,
      tx: (text) => text,
    };
  }
  return ctx;
}
