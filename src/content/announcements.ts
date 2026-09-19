export type Announcement = {
  id: string;
  text: string;
  href?: string;
};

export const announcements: Announcement[] = [
  {
    id: "1",
    text: "Welcome students — open the Encyclopedia of Quran and Hadith from Home or the nav",
    href: "/encyclopedia/quran",
  },
  {
    id: "2",
    text: "New video lessons and written pages are published regularly — check Lessons & Videos",
    href: "/lessons",
  },
  {
    id: "3",
    text: "Portal Login is available for class communications and school materials",
    href: "/login",
  },
];
