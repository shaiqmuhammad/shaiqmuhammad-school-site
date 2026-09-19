import type { Metadata } from "next";
import { EncyclopediaEmbed } from "@/components/EncyclopediaEmbed";

export const metadata: Metadata = {
  title: "Encyclopedia of Quran",
  description:
    "Browse trusted Quran translations and explanations on the Shaiq Muhammad learning platform.",
};

export default function EncyclopediaQuranPage() {
  return (
    <EncyclopediaEmbed
      title="Encyclopedia of Quran"
      description="Translations and explanations — stay on this site while you study."
      src="https://quranenc.com/en/home#transes"
      externalUrl="https://quranenc.com/en/home#transes"
    />
  );
}
