export type NewsPost = {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  body: string[];
  category: string;
  imageSeed: number;
};

export const newsPosts: NewsPost[] = [
  {
    slug: "term-1-welcome",
    title: "Welcome back — Term 1 2026",
    date: "2026-09-01",
    excerpt:
      "A warm welcome to new and returning families as we begin another year of learning in Dubai.",
    category: "Announcements",
    imageSeed: 201,
    body: [
      "We are delighted to welcome our community back for Term 1. Classrooms are ready, teachers are excited, and our pastoral teams are prepared to support every learner.",
      "New families joining us this year will find orientation guides in the Login Portal, along with timetables and contact details for form tutors.",
      "We look forward to a year of curiosity, kindness, and achievement together.",
    ],
  },
  {
    slug: "open-morning-october",
    title: "Open Morning — 4 October 2026",
    date: "2026-08-15",
    excerpt:
      "Tour classrooms, meet teachers, and learn about our admissions process at our autumn Open Morning.",
    category: "Admissions",
    imageSeed: 202,
    body: [
      "Prospective families are invited to our Open Morning on Saturday 4 October 2026 from 09:00 to 12:00.",
      "The morning includes campus tours, subject showcases, and short talks with senior leaders. Booking is essential via the Admissions page.",
      "We cannot wait to show you what makes our community special.",
    ],
  },
  {
    slug: "stem-fair-success",
    title: "Students shine at the annual STEM Fair",
    date: "2026-05-20",
    excerpt:
      "Primary and secondary learners presented inventive projects spanning robotics, environmental science, and design.",
    category: "Academics",
    imageSeed: 203,
    body: [
      "Our annual STEM Fair celebrated enquiry and creativity. Visitors explored student-built robots, water-quality studies, and sustainable design prototypes.",
      "Congratulations to all participants and to the Science department for mentoring such ambitious work.",
    ],
  },
  {
    slug: "charity-walk-raises-funds",
    title: "Community charity walk raises AED 45,000",
    date: "2026-03-12",
    excerpt:
      "Families, staff, and learners walked together to support a local children’s literacy charity. (Sample figure.)",
    category: "Community",
    imageSeed: 204,
    body: [
      "On a bright March morning our community walked through Al Quoz in support of children’s literacy. Sample fundraising total: AED 45,000.",
      "Thank you to every volunteer, sponsor, and walker who made the day possible.",
    ],
  },
  {
    slug: "arts-week-highlights",
    title: "Arts Week: colour, music, and performance",
    date: "2026-02-05",
    excerpt:
      "A week of workshops, exhibitions, and a finale concert showcased creative talent across the school.",
    category: "Arts",
    imageSeed: 205,
    body: [
      "Arts Week filled corridors with colour and sound. Learners took part in printmaking, drama improvisation, and ensemble rehearsals culminating in a shared concert.",
      "We are proud of every performer and of the arts faculty who make creativity central to school life.",
    ],
  },
];

export function getPostBySlug(slug: string): NewsPost | undefined {
  return newsPosts.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return newsPosts.map((p) => p.slug);
}
