import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Form Forge",
  description: "Generative UI agent demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative bg-[#08071a]">
        {/* Decorative gradient orbs — fixed so they persist through scroll */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-56 -left-40 w-[640px] h-[640px] rounded-full bg-violet-600/25 blur-[160px]" />
          <div className="absolute top-1/3 -right-56 w-[520px] h-[520px] rounded-full bg-indigo-500/18 blur-[140px]" />
          <div className="absolute -bottom-40 left-1/3 w-[440px] h-[440px] rounded-full bg-emerald-600/12 blur-[130px]" />
        </div>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
