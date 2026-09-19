export type StaffMember = {
  id: string;
  name: string;
  role: string;
  department: string;
  bio: string;
  imageSeed: number;
};

export const faculty: StaffMember[] = [
  {
    id: "dr-layla-hassan",
    name: "Dr Layla Hassan",
    role: "Principal",
    department: "Senior Leadership",
    bio: "Dr Hassan brings twenty years of international school leadership. She believes every child deserves to be known by name and challenged with kindness.",
    imageSeed: 11,
  },
  {
    id: "marcus-bennett",
    name: "Marcus Bennett",
    role: "Deputy Principal (Academic)",
    department: "Senior Leadership",
    bio: "Marcus leads curriculum design and teacher development, with a focus on enquiry learning and assessment for learning.",
    imageSeed: 22,
  },
  {
    id: "sara-al-maktoum",
    name: "Sara Al Maktoum",
    role: "Head of Primary",
    department: "Primary",
    bio: "Sara champions early literacy and a joyful primary culture where curiosity leads the day.",
    imageSeed: 33,
  },
  {
    id: "oliver-chen",
    name: "Oliver Chen",
    role: "Head of Secondary",
    department: "Secondary",
    bio: "Oliver oversees Years 7–13, balancing academic stretch with strong pastoral mentoring.",
    imageSeed: 44,
  },
  {
    id: "fatima-noor",
    name: "Fatima Noor",
    role: "Head of Pastoral Care",
    department: "Wellbeing",
    bio: "Fatima leads safeguarding and wellbeing programmes, ensuring every learner has a trusted adult.",
    imageSeed: 55,
  },
  {
    id: "daniel-okonkwo",
    name: "Daniel Okonkwo",
    role: "Head of Science",
    department: "Science",
    bio: "Daniel inspires practical science through labs, field work, and STEM competitions across the school.",
    imageSeed: 66,
  },
  {
    id: "emily-wright",
    name: "Emily Wright",
    role: "Head of English",
    department: "Languages",
    bio: "Emily cultivates a love of reading and writing, from foundation phonics to Sixth Form literary criticism.",
    imageSeed: 77,
  },
  {
    id: "yusuf-ibrahim",
    name: "Yusuf Ibrahim",
    role: "Head of Arabic & Islamic Studies",
    department: "Languages",
    bio: "Yusuf connects language learning with culture and identity, supporting both native and new speakers.",
    imageSeed: 88,
  },
];
