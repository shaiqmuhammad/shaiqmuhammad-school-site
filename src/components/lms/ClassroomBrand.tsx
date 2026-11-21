"use client";

import { useLogoUrl } from "@/components/SiteBrand";
import { useSiteName } from "@/components/SiteIdentity";

/** Company logo and site name from admin Site & branding settings. */
export function ClassroomBrand({ variant = "page", testId = "classroom-brand" }: { variant?: "page" | "room"; testId?: string }) {
  const logoUrl = useLogoUrl();
  const siteName = useSiteName();
  return (
    <div className={`lb-site lb-site-${variant}`} data-testid={testId}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="" width={44} height={44} className="lb-logo" />
      <span className="lb-site-name">{siteName}</span>
    </div>
  );
}
