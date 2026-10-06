/**
 * Routes that render full-screen without the site header, footer, ticker or chat bubble:
 * the assessment player, group join/wait room (/assessments/join and /join) and the teacher's host screen.
 */
export function isImmersivePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /^\/assessments\/[^/]+/.test(pathname) || /^\/join(\/|$)/.test(pathname);
}
