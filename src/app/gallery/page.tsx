import type { Metadata } from "next";
import Image from "next/image";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { galleryItems } from "@/content/gallery";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Campus life in pictures — sample imagery for demonstration.",
};

export default function GalleryPage() {
  return (
    <>
      <PageHero
        eyebrow="Moments"
        title="Gallery"
        subtitle="A selection of campus scenes. Images are placeholders from picsum.photos for demonstration."
      />
      <Section>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {galleryItems.map((item) => (
            <figure
              key={item.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-card-border bg-accent-soft"
            >
              <Image
                src={`https://picsum.photos/seed/${item.imageSeed}/${item.width}/${item.height}`}
                alt={item.title}
                fill
                className="object-cover transition duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950/80 to-transparent p-3 pt-8 text-xs text-white opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                <span className="font-medium">{item.title}</span>
                <span className="ml-2 text-stone-300">{item.category}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>
    </>
  );
}
