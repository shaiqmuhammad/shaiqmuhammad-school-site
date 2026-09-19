import type { Metadata } from "next";
import Image from "next/image";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { facilities } from "@/content/facilities";

export const metadata: Metadata = {
  title: "Facilities",
  description: "Labs, library, sports, and transport at our Dubai campus.",
};

export default function FacilitiesPage() {
  return (
    <>
      <PageHero
        eyebrow="Campus"
        title="Facilities"
        subtitle="Spaces designed for enquiry, creativity, sport, and safe daily travel across Dubai."
      />
      <Section>
        <div className="space-y-10">
          {facilities.map((facility, index) => (
            <Card
              key={facility.id}
              className={`grid gap-0 overflow-hidden p-0 md:grid-cols-2 ${
                index % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div className="relative min-h-[220px] bg-accent-soft md:min-h-[280px]">
                <Image
                  src={`https://picsum.photos/seed/${facility.imageSeed}/800/600`}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <h2 className="text-xl font-semibold sm:text-2xl">{facility.title}</h2>
                <p className="mt-3 text-sm text-muted leading-relaxed">
                  {facility.summary}
                </p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {facility.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-primary" aria-hidden>
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
