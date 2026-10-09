"use client";

import { useSearchParams } from "next/navigation";
import { ActivityJoin } from "@/components/activity/ActivityJoin";
import { GroupJoin } from "@/components/assessment/GroupJoin";
import { isActivityCode } from "@/lib/activity";

/** /join: 5-character codes are classroom activities, 6-character codes are live group assessments. */
export function JoinRouter() {
  const params = useSearchParams();
  const code = (params.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (isActivityCode(code)) return <ActivityJoin key={code} code={code} />;
  return <GroupJoin />;
}
