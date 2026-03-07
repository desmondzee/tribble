import type { Metadata } from "next";
import { Geist, Geist_Mono, Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/context/DataContext";
import { AuthSync } from "@/components/AuthSync";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Tribble — Humanitarian Intelligence",
  description: "Humanitarian intelligence platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} ${ibmPlexSans.variable} antialiased`}
      >
        <DataProvider>
          <AuthSync />
          {children}
        </DataProvider>
        <Toaster theme="dark" richColors position="bottom-right" />
      </body>
    </html>
  );
}
