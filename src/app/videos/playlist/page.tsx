import type { Metadata } from "next";
import { Suspense } from "react";
import { PlaylistPage } from "@/components/YoutubePages";

export const metadata: Metadata = { title: "Playlist", description: "Video playlist from Shaiqmuhammad Al-Madrasa." };

export default function Page() {
  return <Suspense fallback={null}><PlaylistPage /></Suspense>;
}
