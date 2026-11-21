/** Who may allow or mute a student's camera, mic, or screen in a live room. */
export function canControlStudentMedia(
  a: { id: string; role: string; perms: string[] },
  teacherId: string,
  kind: "camMic" | "screenShare" = "camMic",
): boolean {
  if (a.role === "admin") return true;
  if (a.role === "teacher" && a.id && teacherId && a.id === teacherId) return true;
  const perm = kind === "screenShare" ? "liveScreenShare" : "liveCamMic";
  return a.role === "teacher" && (a.perms || []).includes(perm);
}

/** Who may present packs and open the whiteboard in a live room. */
export function canPresentInRoom(
  a: { id: string; role: string; perms: string[] },
  teacherId: string,
): boolean {
  if (a.role === "admin") return true;
  if (a.role === "teacher" && a.id && teacherId && a.id === teacherId) return true;
  return a.role === "teacher" && (a.perms || []).includes("livePresent");
}


export const PTR_KINDS = ["pen", "hand", "finger", "stick", "arrow", "laser"] as const;
export type PtrKind = (typeof PTR_KINDS)[number];
export function normalizePtrKind(v: unknown): PtrKind {
  return typeof v === "string" && (PTR_KINDS as readonly string[]).includes(v) ? v as PtrKind : "pen";
}


export type LiveFloor = "presenter" | "attendee";
/** The room host is always a presenter; everyone else defaults to attendee. */
export function memberFloor(m: { id?: string; floor?: string } | undefined, teacherId: string): LiveFloor {
  if (m?.id && teacherId && m.id === teacherId) return "presenter";
  return m?.floor === "presenter" ? "presenter" : "attendee";
}
export function canSetMemberFloor(actorId: string, actorRole: string, teacherId: string, targetId: string): boolean {
  if (!targetId || targetId === teacherId) return false;
  return actorRole === "admin" || (!!actorId && !!teacherId && actorId === teacherId);
}
