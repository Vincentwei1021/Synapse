import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LocaleProvider } from "@/contexts/locale-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Synapse",
    template: "%s | Synapse",
  },
  description: "AI-powered research experimentation platform",
  openGraph: {
    title: "Synapse",
    description: "AI-powered research experimentation platform",
    type: "website",
    siteName: "Synapse",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
