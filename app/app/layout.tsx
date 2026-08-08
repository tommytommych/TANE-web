import type { Metadata, Viewport } from "next";

// ルートlayout.tsxはTANEPROJECT（LP）のホーム画面アイコン・manifestに更新されたため、
// TANE:iチャットアプリ（/app）だけは独自のアイコン・manifest・ホーム画面ラベルを保つよう、
// このセグメント用のmetadataで明示的に上書きする
export const metadata: Metadata = {
  manifest: "/manifest-tanei.json",
  icons: {
    icon: [
      { url: "/favicon-tanei.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "TANE:i",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF8F4",
};

export default function TaneiAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
