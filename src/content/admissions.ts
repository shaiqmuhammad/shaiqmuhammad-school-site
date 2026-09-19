export const admissionsProcess = [
  {
    step: 1,
    title: "Enquire",
    body: "Complete the enquiry form or email admissions. We will share prospectuses and invite you to visit.",
  },
  {
    step: 2,
    title: "Visit & assessment",
    body: "Tour the campus, meet pastoral leaders, and complete an age-appropriate assessment or interview.",
  },
  {
    step: 3,
    title: "Offer",
    body: "Successful applicants receive a written offer with placement details and next steps.",
  },
  {
    step: 4,
    title: "Enrol via the portal",
    body: "Accept your offer and complete full registration documents through the Login Portal. The website form is for initial contact only.",
  },
] as const;

export const eligibility = [
  "Applicants must meet the age criteria for the requested year group by 31 August of the entry year.",
  "Previous school reports (where applicable) and a brief parent statement are required.",
  "English language support may be offered where a learner shows strong potential but needs language scaffolding.",
  "Places are offered subject to availability and a good fit with the school’s values and programme.",
] as const;

export const feeStructure = [
  {
    stage: "Early Years (FS1–FS2)",
    annual: "AED 42,000",
    note: "Sample figure",
  },
  {
    stage: "Primary (Years 1–6)",
    annual: "AED 55,000",
    note: "Sample figure",
  },
  {
    stage: "Secondary (Years 7–11)",
    annual: "AED 68,000",
    note: "Sample figure",
  },
  {
    stage: "Sixth Form (Years 12–13)",
    annual: "AED 72,000",
    note: "Sample figure",
  },
] as const;

export const feeNotes =
  "All figures above are sample data for demonstration purposes only and do not represent actual tuition. Sibling discounts, payment plans, and registration fees are confirmed in writing during enrolment.";
