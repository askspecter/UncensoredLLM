import type { Metadata } from "next";
import { Space_Mono, VT323 } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Providers from "@/components/Providers";
import RefCapture from "@/components/RefCapture";

const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono-ui" });
const pixel = VT323({ subsets: ["latin"], weight: "400", variable: "--font-pixel" });

export const metadata: Metadata = {
  title: "Beeper — Private, uncensored AI credits at a discount",
  description: "Prepaid credits for private, uncensored AI models. One OpenAI-compatible API key, no logs, pay in USDG or by card.",
};

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
