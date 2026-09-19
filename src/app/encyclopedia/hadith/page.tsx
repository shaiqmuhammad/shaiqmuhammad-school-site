import type { Metadata } from "next";
import { EncyclopediaEmbed } from "@/components/EncyclopediaEmbed";

export const metadata: Metadata = {
  title: "Encyclopedia of Hadith",
  description:
    "Explore authentic Hadith with clear explanations on the Shaiq Muhammad learning platform.",
};

export default function EncyclopediaHadithPage() {
  return (
    <EncyclopediaEmbed
      title="Encyclopedia of Hadith"
      description="Authentic Hadith with explanations — stay on this site while you study."
      src="https://hadeethenc.com/en/home/about"
      externalUrl="https://hadeethenc.com/en/home/about"
    />
  );
}
