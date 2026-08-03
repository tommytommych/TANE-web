import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

// Geistはチャットアプリ（/app）のfont-sansが参照しているため変更しない
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// LP専用フォント（TANE PROJECT公式サイト）。/appには適用しない
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-jp",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "TANE PROJECT | Ideas into Reality.",
  description: "TANE PROJECTは、DIYを起点にAI・クリエイティブ・教育・デジタルファブリケーションを融合し、アイデアを現実へ変えるブランドです。",
  openGraph: {
    title: "TANE PROJECT | Ideas into Reality.",
    description: "アイデアの種を、カタチに。DIYを起点に、アイデアを現実へ変えるブランド。",
    type: "website",
    locale: "ja_JP",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${notoSansJP.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
