import type { Metadata } from "next";
import "./globals.css";
import "./experience.css";
import "./analytics.css";
import "./social.css";

export const metadata: Metadata = {
  title: "KoliCreator AI | Make your audience work for you",
  description: "Creator-first monetisation, powered by your own numbers and ideas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}