export const programmes = [
  {
    id: "early-years",
    title: "Early Years (FS1–FS2)",
    ages: "Ages 3–5",
    summary:
      "Play-based learning that builds language, social confidence, and early literacy and numeracy foundations.",
    highlights: [
      "Phonics and early reading",
      "Outdoor exploration",
      "Creative arts & music",
      "Gentle routines and pastoral care",
    ],
  },
  {
    id: "primary",
    title: "Primary (Years 1–6)",
    ages: "Ages 5–11",
    summary:
      "A broad, balanced curriculum with strong English, mathematics, science, and the humanities, enriched by languages and the arts.",
    highlights: [
      "Enquiry-based topic work",
      "Arabic & additional languages",
      "STEM challenges",
      "Sports and performing arts",
    ],
  },
  {
    id: "secondary",
    title: "Secondary (Years 7–11)",
    ages: "Ages 11–16",
    summary:
      "Specialist teaching across core and elective subjects, preparing learners for externally recognised qualifications.",
    highlights: [
      "Core academic pathway",
      "Option subjects & electives",
      "Careers guidance",
      "Leadership & service",
    ],
  },
  {
    id: "sixth-form",
    title: "Sixth Form (Years 12–13)",
    ages: "Ages 16–18",
    summary:
      "A focused post-16 programme with academic stretch, university counselling, and opportunities for independent research.",
    highlights: [
      "Advanced subject study",
      "Extended projects",
      "University & careers support",
      "Mentoring younger peers",
    ],
  },
] as const;

export const curriculumOverview = {
  intro:
    "Our curriculum balances academic challenge with wellbeing. Learners develop knowledge, skills, and character through classroom enquiry, practical work, and a rich co-curricular programme.",
  pillars: [
    {
      title: "Knowledge & skills",
      body: "Clear progression in literacy, numeracy, scientific thinking, and digital fluency.",
    },
    {
      title: "Languages & culture",
      body: "English as the language of instruction, with Arabic and additional modern languages celebrated across the school.",
    },
    {
      title: "Creativity & wellbeing",
      body: "Arts, sport, and pastoral programmes that help every child find belonging and purpose.",
    },
    {
      title: "Global citizenship",
      body: "Service learning, intercultural understanding, and environmental stewardship woven through the year.",
    },
  ],
} as const;
