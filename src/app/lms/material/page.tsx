import type { Metadata } from "next";
import { PacksPage } from "@/components/lms/packs/PacksPage";

export const metadata: Metadata = { title: "Learning Material", robots: { index: false, follow: false } };

export default function Page() {
  return <PacksPage />;
}
