export const siteConfig = {
  name: "Shaiq Muhammad",
  shortName: "SM Learn",
  domain: "shaiqmuhammad.com",
  tagline: "A calm learning home for students of Shaiq Muhammad",
  description:
    "Educational learning platform for students of Shaiq Muhammad — Quran and Hadith encyclopedias, written lessons, and video classes.",
  location: "Dubai, United Arab Emirates",
  address: "Dubai, UAE",
  email: "contact@shaiqmuhammad.com",
  locale: "en-GB",
  copyright: "© Shaiq Muhammad. All rights reserved.",
} as const;

/**
 * Libraries embedded full-height on this site (iframe pages). Deliberately no external URLs here:
 * the header/footer never link visitors away to these websites.
 */
export const encyclopediaLinks = [
  {
    id: "quran",
    kind: "quran",
    label: "Encyclopedia of Quran",
    href: "/encyclopedia/quran",
    description:
      "Browse trusted Quran translations and explanations — open alongside your lessons.",
  },
  {
    id: "quran-com",
    kind: "quran",
    label: "Quran.com",
    href: "/encyclopedia/quran-com",
    description:
      "Read and listen to the Quran with recitations, translations and tafsir — right here on this site.",
  },
  {
    id: "hadith",
    kind: "hadith",
    label: "Encyclopedia of Hadith",
    href: "/encyclopedia/hadith",
    description:
      "Explore authentic Hadith with clear explanations — a companion for deeper study.",
  },
  {
    id: "sunnah",
    kind: "hadith",
    label: "Sunnah.com",
    href: "/encyclopedia/sunnah",
    description:
      "Search the major Hadith collections (Bukhari, Muslim and more) in English and Arabic — on this site.",
  },
] as const;

/** "Students Resources" header dropdown (desktop) / expandable group (mobile menu). All internal pages. */
export const resourceLinks = [
  { href: "/encyclopedia/quran", key: "enc.quran", label: "Encyclopedia of Quran", kind: "quran" },
  { href: "/encyclopedia/hadith", key: "enc.hadith", label: "Encyclopedia of Hadith", kind: "hadith" },
  { href: "/encyclopedia/quran-com", key: "enc.quran-com", label: "Quran.com", kind: "quran" },
  { href: "/encyclopedia/sunnah", key: "enc.sunnah", label: "Sunnah.com", kind: "hadith" },
  { href: "/lessons", key: "nav./lessons", label: "Lessons", kind: "lessons" },
  { href: "/videos", key: "nav./videos", label: "Videos", kind: "videos" },
] as const;

export type ResourceLink = (typeof resourceLinks)[number];

/** Top-level header items; the entry with `menu` opens the Students Resources dropdown. */
export const navLinks: readonly { href: string; label: string; menu?: "resources" }[] = [
  { href: "#resources", label: "Students Resources", menu: "resources" },
  { href: "/assessments", label: "Assessments" },
  { href: "/forum", label: "Forum" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/** Footer "Explore" column (plain links, no dropdown). */
export const footerLinks = [
  { href: "/", label: "Home" },
  { href: "/lessons", label: "Lessons" },
  { href: "/videos", label: "Videos" },
  { href: "/assessments", label: "Assessments" },
  { href: "/forum", label: "Forum" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;
