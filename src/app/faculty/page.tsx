import type { Metadata } from "next";
import Image from "next/image";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { faculty } from "@/content/faculty";

export const metadata: Metadata = {
  title: "Faculty",
  description: "Meet our senior leaders and sample teaching staff.",
};

export default function FacultyPage() {
  return (
    <>
      <PageHero
        eyebrow="People"
        title="Faculty & staff"
        subtitle="Sample staff directory — names and biographies are illustrative for this public website."
      />
      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {faculty.map((member) => (
            <Card key={member.id} className="overflow-hidden p-0">
              <div className="relative aspect-square bg-accent-soft">
                <Image
                  src={`https://picsum.photos/seed/${member.imageSeed}/400/400`}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 25vw"
                />
              </div>
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {member.department}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{member.name}</h2>
                <p className="text-sm text-muted">{member.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{member.bio}</p>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
