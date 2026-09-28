import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { AnnouncementTicker } from "@/components/AnnouncementTicker";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ChatWidget } from "@/components/ChatWidget";
import { WhatsAppButton } from "@/components/WhatsApp";
import { siteConfig } from "@/content/site";
import { langInitScript } from "@/lib/langStorage";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} | Student Learning Platform`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(`https://${siteConfig.domain}`),
  icons: { icon: "/favicon.svg", apple: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} h-full antialiased`}>
      <head>
        {/* Apply saved Arabic/RTL preference before paint (theme is handled by next-themes). */}
        <script dangerouslySetInnerHTML={{ __html: langInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <AnnouncementTicker />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <WhatsAppButton />
          <ChatWidget />
        </ThemeProvider>
      </body>
    </html>
  );
}
