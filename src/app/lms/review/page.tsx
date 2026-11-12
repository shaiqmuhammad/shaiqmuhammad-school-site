import { redirect } from "next/navigation";

/** Teacher Review list lives on the homework hub (Year / section cards). */
export default function Page() {
  redirect("/lms/homework?tab=review");
}
