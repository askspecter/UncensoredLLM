import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Providers from "@/components/Providers";
import RefCapture from "@/components/RefCapture";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Beeper — Private, uncensored AI credits at a discount",
  description: "Prepaid credits for private, uncensored AI models. One OpenAI-compatible API key, no logs, pay in USDG or by card.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="grain font-sans antialiased">
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
