import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/theme-provider";
import { TopControls } from "@/components/top-controls";
import { TopLoader } from "@/components/top-loader";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "경기도볼링협회",
  description: "경기도볼링협회 대회 운영 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={null}>
            <TopLoader />
          </Suspense>
          {/* 모든 페이지 우상단 고정 컨트롤 (테마 토글 + 관리자 링크) */}
          <TopControls />
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
