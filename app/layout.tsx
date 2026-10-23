import type { Metadata } from "next";
import { Space_Mono, VT323 } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Providers from "@/components/Providers";
import RefCapture from "@/components/RefCapture";

const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono-ui" });
const pixel = VT323({ subsets: ["latin"], weight: "400", variable: "--font-pixel" });

const SITE = process.env.SITE_URL ?? "https://usebeeper.io";
const TITLE = "Beeper — Private, uncensored AI";
const DESCRIPTION = "Ask anything. No filters. No trace. Uncensored chat, images and an OpenAI-compatible API — credits 10%+ off, pay in USDG or card.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s" },
  description: DESCRIPTION,
  applicationName: "Beeper",
  openGraph: {
    type: "website", url: SITE, siteName: "Beeper", title: TITLE, description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Beeper — Ask anything. No filters. No trace." }],
  },
  twitter: { card: "summary_large_image", site: "@usebeeper", creator: "@usebeeper", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
};

export const viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${pixel.variable}`}>
      <body className="scanlines font-sans antialiased">
        <Providers>
          <RefCapture />
          <Nav />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
