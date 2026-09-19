export type Announcement = {
  id: string;
  text: string;
  href?: string;
};

export const announcements: Announcement[] = [
  {
    id: "1",
    text: "Open Morning — Saturday 4 October 2026 · Book your place",
    href: "/admissions",
  },
  {
    id: "2",
    text: "Term 1 starts Monday 1 September 2026 · Welcome back",
    href: "/news/term-1-welcome",
  },
  {
    id: "3",
    text: "Sample data: Applications for 2026–27 are now open",
    href: "/admissions",
  },
  {
    id: "4",
    text: "Parent–Teacher conferences — week of 20 October",
    href: "/news",
  },
];
