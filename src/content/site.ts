export const siteConfig = {
  name: "Shaiq Muhammad",
  shortName: "SM Learn",
  domain: "shaiqmuhammad.com",
  tagline: "A calm learning home for students of Shaiq Muhammad",
  description:
    "Educational learning platform for students of Shaiq Muhammad — Quran and Hadith encyclopedias, written lessons, and video classes.",
  location: "Dubai, United Arab Emirates",
  address: "Dubai, UAE",
  phone: "+971 4 000 0000",
  email: "info@shaiqmuhammad.com",
  locale: "en-GB",
  copyright: "© Shaiq Muhammad. All rights reserved.",
} as const;

export const encyclopediaLinks = [
  {
    id: "quran",
    label: "Encyclopedia of Quran",
    href: "/encyclopedia/quran",
    externalUrl: "https://quranenc.com/en/home#transes",
    description:
      "Browse trusted Quran translations and explanations — open alongside your lessons.",
  },
  {
    id: "hadith",
    label: "Encyclopedia of Hadith",
    href: "/encyclopedia/hadith",
    externalUrl: "https://hadeethenc.com/en/home/about",
    description:
      "Explore authentic Hadith with clear explanations — a companion for deeper study.",
  },
] as const;

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/encyclopedia/quran", label: "Quran" },
  { href: "/encyclopedia/hadith", label: "Hadith" },
  { href: "/lessons", label: "Lessons" },
  { href: "/videos", label: "Videos" },
  { href: "/forum", label: "Forum" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;
