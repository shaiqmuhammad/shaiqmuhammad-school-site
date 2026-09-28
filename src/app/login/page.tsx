import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { getPortalUrl, portalRoles } from "@/content/login";

export const metadata: Metadata = {
  title: "Login Portal",
  description:
    "Access the student and school portal for communications and class materials.",
};

export default function LoginPage() {
  const portalUrl = getPortalUrl();

  return (
    <>
      <PageHero
        eyebrow="Portal"
        title="Login Portal"
        subtitle="Sign in for class communications, timetables, and school materials. Encyclopedias, lessons, and videos stay on this learning site."
      />
      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-muted leading-relaxed">
            The Login Portal provides role-based entry for students, teachers, parents,
            and staff. This public learning platform does not host those dashboards.
          </p>
          <a
            href={portalUrl}
            className="mt-8 inline-flex rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90"
          >
            Continue to Login Portal
          </a>
          <p className="mt-3 text-xs text-muted">
            Destination: <code className="rounded bg-accent-soft px-1.5 py-0.5">{portalUrl}</code>
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {portalRoles.map((item) => (
            <Card key={item.role}>
              <h2 className="font-semibold text-primary">{item.role}</h2>
              <p className="mt-2 text-sm text-muted leading-relaxed">{item.description}</p>
            </Card>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-muted">
          Need an account? Contact your teacher or the school office. Never share your password.
        </p>
      </Section>
    </>
  );
}
