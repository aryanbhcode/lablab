import type { Metadata } from "next";
import { Geist, Inter, JetBrains_Mono } from "next/font/google";
import Layout from "@/components/Layout";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist"
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono"
});

export const metadata: Metadata = {
  title: "Truth Terminal",
  description: "Truth Terminal"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${inter.variable} ${jetbrainsMono.variable} font-inter`}>
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
