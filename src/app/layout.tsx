import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_Arabic, Nunito } from "next/font/google";
import { AnnouncementTicker } from "@/components/AnnouncementTicker";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ChatWidget } from "@/components/ChatWidget";
import { siteConfig } from "@/content/site";
import { langInitScript } from "@/lib/langStorage";
import { SiteBrandProvider } from "@/components/SiteBrand";
import { brandUrl } from "@/lib/siteSettings";
import { loadSiteSettingsSync } from "@/lib/siteSettingsServer";
import "./globals.css";

// Rounded, friendly sans (matches the classroom slides).
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  display: "swap",
});

const settings = loadSiteSettingsSync();
const { brand } = settings;
// Uploaded favicon: gen-icons.mjs rebuilds favicon.ico / icon-32 / icon-192 / apple-touch-icon from it,
// so only the default SVG icon must be swapped (an uploaded SVG is served as-is).
const svgIcon = brand.faviconPath
  ? brand.faviconPath.endsWith(".svg")
    ? [{ url: brandUrl(brand.faviconPath, brand.version, ""), type: "image/svg+xml" }]
    : []
  : [{ url: "/favicon.svg", type: "image/svg+xml" }];
const v = brand.faviconPath && brand.version ? `?v=${encodeURIComponent(brand.version)}` : "";

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} | Student Learning Platform`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(`https://${siteConfig.domain}`),
  icons: {
    icon: [
      { url: `/favicon.ico${v}`, sizes: "any" },
      { url: `/icon-32.png${v}`, type: "image/png", sizes: "32x32" },
      { url: `/icon-192.png${v}`, type: "image/png", sizes: "192x192" },
      ...svgIcon,
    ],
    shortcut: `/favicon.ico${v}`,
    apple: [{ url: `/apple-touch-icon.png${v}`, sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" suppressHydrationWarning className={`${nunito.variable} ${geistMono.variable} ${notoArabic.variable} h-full antialiased`}>
      <head>
        {/* Apply saved Arabic/RTL preference before paint (theme is handled by next-themes). */}
        <script dangerouslySetInnerHTML={{ __html: langInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <SiteBrandProvider brand={brand} social={settings.social}>
            <AnnouncementTicker />
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <ChatWidget />
          </SiteBrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
