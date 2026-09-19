export const siteConfig = {
  name: "Shaiq Muhammad",
  shortName: "SM School",
  domain: "shaiqmuhammad.com",
  tagline: "Nurturing curious minds in the heart of Dubai",
  description:
    "An independent day school in Dubai, UAE, offering a broad British-inspired curriculum with a warm, inclusive community.",
  location: "Dubai, United Arab Emirates",
  address: "Al Quoz, Dubai, UAE",
  phone: "+971 4 000 0000",
  email: "info@shaiqmuhammad.com",
  admissionsEmail: "admissions@shaiqmuhammad.com",
  locale: "en-GB",
  copyright: "© Shaiq Muhammad. All rights reserved.",
} as const;

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/academics", label: "Academics" },
  { href: "/admissions", label: "Admissions" },
  { href: "/faculty", label: "Faculty" },
  { href: "/facilities", label: "Facilities" },
  { href: "/news", label: "News" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
] as const;
