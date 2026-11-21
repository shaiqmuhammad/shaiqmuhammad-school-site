/** True when a live API error means the class already ended (do not rejoin). */
export function isLiveEndedError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const rec = e as { code?: unknown; status?: unknown };
  return rec.code === "ended" || rec.status === 410;
}
