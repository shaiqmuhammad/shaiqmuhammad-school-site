import type { Metadata } from "next";
import { BehaviourPage } from "@/components/lms/mods/Behaviour";

export const metadata: Metadata = { title: "Behaviour", robots: { index: false, follow: false } };

export default function Page() {
  return <BehaviourPage />;
}
