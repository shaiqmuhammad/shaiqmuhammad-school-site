import type { Metadata } from "next";
import { EncyclopediaEmbed } from "@/components/EncyclopediaEmbed";

export const metadata: Metadata = {
  title: "Sunnah.com",
  description: "Search the major Hadith collections on the Shaiq Muhammad learning platform.",
};

export default function SunnahPage() {
  return (
    <EncyclopediaEmbed
      title="Sunnah.com"
      description="Hadith collections in English and Arabic — stay on this site while you study."
      src="https://sunnah.com/"
    />
  );
}
