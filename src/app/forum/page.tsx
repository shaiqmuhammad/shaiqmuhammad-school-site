import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { ForumClient } from "@/components/ForumClient";
import { loadForumDataSync } from "@/lib/forumServer";

export const metadata: Metadata = {
  title: "Kids Forum",
  description: "A safe, kid-friendly forum for students of Shaiq Muhammad.",
};

export default function ForumPage() {
  const published = loadForumDataSync();

  return (
    <>
      <PageHero
        eyebrow="Kids forum"
        title="Ask, share, encourage"
        subtitle="A calm space for students. Use a display name only — be kind, stay on-topic, never share private information."
      />
      <Section className="pt-0">
        <div className="mb-6 rounded-2xl border border-gold/40 bg-gold-soft/50 px-4 py-3 text-sm text-foreground">
          <p className="font-semibold text-primary">Forum rules (please read)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Be respectful and helpful — treat classmates like brothers and sisters.</li>
            <li>Use a first name or nickname only (no full private details).</li>
            <li>No phone numbers, addresses, passwords, or personal photos.</li>
            <li>Stay on learning topics. Teachers may hide posts that break the rules.</li>
          </ul>
        </div>
        <ForumClient initial={published} />
      </Section>
    </>
  );
}
