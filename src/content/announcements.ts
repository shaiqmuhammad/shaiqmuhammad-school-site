export type Announcement = {
  id: string;
  text: string;
  href?: string;
};

export const announcements: Announcement[] = [
  {
    id: "1",
    text: "Open Morning \u2014 Saturday 4 October 2026 \u00b7 Book your place",
    href: "/admissions",
  },
  {
    id: "2",
    text: "Term 1 starts Monday 1 September 2026 \u00b7 Welcome back",
    href: "/news/term-1-welcome",
  },
  {
    id: "3",
    text: "Sample data: Applications for 2026\u201327 are now open",
    href: "/admissions",
  },
  {
    id: "4",
    text: "Parent\u2013Teacher conferences \u2014 week of 20 October",
    href: "/news",
  },
];
