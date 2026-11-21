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
