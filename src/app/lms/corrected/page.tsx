import { redirect } from "next/navigation";

/** Teacher Corrected list now lives on the homework hub (Year / section cards). */
export default function Page() {
  redirect("/lms/homework?tab=corrected");
}
