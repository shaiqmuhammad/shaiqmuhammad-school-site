import type { Metadata } from "next";
import { EncyclopediaEmbed } from "@/components/EncyclopediaEmbed";

export const metadata: Metadata = {
  title: "Quran.com",
  description: "Read and listen to the Quran with translations and tafsir on the Shaiq Muhammad learning platform.",
};

export default function QuranComPage() {
  return (
    <EncyclopediaEmbed
      title="Quran.com"
      description="Read, listen and study the Quran — stay on this site while you learn."
      src="https://quran.com/"
    />
  );
}
