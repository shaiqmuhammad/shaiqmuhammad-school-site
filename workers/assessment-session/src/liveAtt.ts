/** Live-lesson attendance helpers. Period fits the att.period 12-character cap. */
export const SITE_TZ_MS = 4 * 3600e3;

export function liveAttPeriod(created: number): { day: string; period: string } {
  const iso = new Date(created + SITE_TZ_MS).toISOString();
  return { day: iso.slice(0, 10), period: `Live ${iso.slice(11, 16)}` };
}

export function isLiveGuestId(id: string): boolean {
  return !id || id.startsWith("lg_") || id.startsWith("lk_") || id.startsWith("lgid_");
}

export function recObjectKey(roomId: string, started: number): string {
  return `live/${roomId}/${started}.webm`;
}
