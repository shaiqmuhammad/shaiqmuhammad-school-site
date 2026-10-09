import { ViewAsBanner } from "@/components/lms/ViewAsBanner";

export default function LmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ViewAsBanner />
      {children}
    </>
  );
}
