import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura Skincare · Client Care",
  description: "Speak with Aura Skincare client care."
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F6F2EC" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}