import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LifePlan Voice Demo",
  description: "Realtime voice LifePlan demo using OpenAI Realtime API + WebRTC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
