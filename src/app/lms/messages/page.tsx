import type { Metadata } from "next";
import { LmsMessagesPage } from "@/components/lms/LmsMessagesPage";

export const metadata: Metadata = { title: "Messages", robots: { index: false, follow: false } };

export default function Page() {
  return <LmsMessagesPage />;
}
