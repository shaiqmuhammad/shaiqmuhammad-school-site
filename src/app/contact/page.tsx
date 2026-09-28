import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { siteConfig } from "@/content/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Shaiq Muhammad — questions about lessons and the student learning platform.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Get in touch"
        title="Contact"
        subtitle="Questions about lessons, classes, or the learning platform? Reach out — we are happy to help."
      />
      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold">Contact</h2>
              <ul className="mt-4 space-y-3 text-sm text-muted">
                <li>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-foreground">
                    Address
                  </span>
                  {siteConfig.address}
                </li>
                <li>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-foreground">
                    Phone
                  </span>
                  <a
                    href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                    className="hover:text-primary"
                  >
                    {siteConfig.phone}
                  </a>
                </li>
                <li>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-foreground">
                    Email
                  </span>
                  <a href={`mailto:${siteConfig.email}`} className="hover:text-primary">
                    {siteConfig.email}
                  </a>
                </li>
              </ul>
            </Card>
            <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
              <iframe
                title="Map placeholder — Dubai, UAE"
                src="https://maps.google.com/maps?q=Dubai%2C%20UAE&t=&z=11&ie=UTF8&iwloc=&output=embed"
                className="h-64 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <p className="border-t border-card-border px-4 py-2 text-xs text-muted">
                Map centred on Dubai, UAE.
              </p>
            </div>
          </div>
          <ContactForm />
        </div>
      </Section>
    </>
  );
}
