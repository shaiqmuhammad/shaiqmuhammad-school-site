import { ViewAsBanner } from "@/components/lms/ViewAsBanner";
import { ClassTimer } from "@/components/lms/ClassTimer";

export default function LmsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ViewAsBanner />
      {children}
      <ClassTimer />
    </>
  );
}
