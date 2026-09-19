import type { Metadata } from "next";
import Link from "next/link";
import { AdmissionsForm } from "@/components/AdmissionsForm";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import {
  admissionsProcess,
  eligibility,
  feeNotes,
  feeStructure,
} from "@/content/admissions";

export const metadata: Metadata = {
  title: "Admissions",
  description: "Admissions process, eligibility, sample fees, and enquiry form.",
};

export default function AdmissionsPage() {
  return (
    <>
      <PageHero
        eyebrow="Join us"
        title="Admissions"
        subtitle="We welcome applications for all year groups subject to places. Full enrolment is completed through the Login Portal after an offer."
      />
      <Section>
        <h2 className="text-2xl font-semibold tracking-tight">How to apply</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {admissionsProcess.map((step) => (
            <Card key={step.step}>
              <p className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {step.step}
              </p>
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{step.body}</p>
            </Card>
          ))}
        </ol>
      </Section>
      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Eligibility</h2>
            <ul className="mt-4 space-y-3 text-sm text-muted leading-relaxed">
              {eligibility.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-primary" aria-hidden>
                    •
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Fee structure{" "}
              <span className="text-sm font-normal text-muted">(sample data)</span>
            </h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-card-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-accent-soft text-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Stage</th>
                    <th className="px-4 py-3 font-semibold">Annual tuition</th>
                  </tr>
                </thead>
                <tbody>
                  {feeStructure.map((row) => (
                    <tr key={row.stage} className="border-t border-card-border">
                      <td className="px-4 py-3">
                        {row.stage}
                        <span className="ml-2 text-xs text-muted">({row.note})</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{row.annual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted leading-relaxed">{feeNotes}</p>
          </div>
        </div>
      </Section>
      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Enquiry form</h2>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              Use this form for an initial enquiry. After an offer, complete your full
              application documents via the{" "}
              <Link href="/login" className="font-medium text-primary underline">
                Login Portal
              </Link>
              .
            </p>
          </div>
          <AdmissionsForm />
        </div>
      </Section>
    </>
  );
}
