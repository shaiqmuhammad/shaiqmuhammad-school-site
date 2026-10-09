/**
 * Routes that render full-screen without the site header, footer, ticker or chat bubble:
 * the assessment player, group join/wait room (/assessments/join and /join), the teacher's host screen
 * and the classroom-activity host screen (/activities/host).
 */
export function isImmersivePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/assessments\/[^/]+/.test(pathname) || /^\/activities\/[^/]+/.test(pathname) || /^\/join(\/|$)/.test(pathname);
}
