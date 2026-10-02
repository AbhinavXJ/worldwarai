import type { Metadata, Viewport } from "next";
import { Lilita_One, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Lilita_One({ variable: "--font-display", subsets: ["latin"], weight: ["400"] });
const sans = Space_Grotesk({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "AI MASCOT BATTLE — Dots vs Muses vs Grok Bots",
  description: "The internet's AI mascots are having an absolutely ridiculous war. Pick a fighter. Survive the chaos.",
  openGraph: {
    title: "AI MASCOT BATTLE",
    description: "Dots vs Muses vs Grok Bots. A tiny Saturday-morning cartoon war, in your browser.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "AI MASCOT BATTLE", description: "Dots vs Muses vs Grok Bots. The internet is not safe." },
};

export const viewport: Viewport = { themeColor: "#0b0620", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
