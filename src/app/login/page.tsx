import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { getPortalUrl, portalRoles } from "@/content/login";

export const metadata: Metadata = {
  title: "Login Portal",
  description:
    "Role-based access for Admin, SLT, Teacher, Student, and Parent via the school portal.",
};

export default function LoginPage() {
  const portalUrl = getPortalUrl();

  return (
    <>
      <PageHero
        eyebrow="Portal"
        title="Login Portal"
        subtitle="Access school systems according to your role. Dashboards themselves live in the separate portal application — this page only routes you there."
      />
      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-muted leading-relaxed">
            The Login Portal provides role-based entry for school community members.
            Choose your role when prompted after signing in. This public website does
            not host Admin, Teacher, Student, or Parent dashboards.
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
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portalRoles.map((item) => (
            <Card key={item.role}>
              <h2 className="font-semibold text-primary">{item.role}</h2>
              <p className="mt-2 text-sm text-muted leading-relaxed">{item.description}</p>
            </Card>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-muted">
          Need an account? Contact the school office. Portal credentials are issued by
          the school — never share your password.
        </p>
      </Section>
    </>
  );
}
