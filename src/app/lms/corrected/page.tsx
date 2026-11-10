import { redirect } from "next/navigation";

export default function Page() {
  redirect("/lms/homework?tab=corrected");
}
