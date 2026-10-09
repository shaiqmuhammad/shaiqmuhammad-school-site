import type { Metadata } from "next";
import { AboutView } from "@/components/about/AboutView";
import { loadAboutSync } from "@/lib/aboutServer";

export const metadata: Metadata = {
  title: "About — Shaiq Muhammad",
  description: "Shaiq Muhammad — Islamic Education B teacher in Dubai: experience, education, qualifications and skills.",
};

export default function AboutPage() {
  return <AboutView data={loadAboutSync()} />;
}
