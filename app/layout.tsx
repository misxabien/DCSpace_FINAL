import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { RoutePresence } from "@/components/motion/RoutePresence";
import { SoftNavEnhancer } from "@/components/motion/SoftNavEnhancer";
import { TopLoadingBarHost } from "@/components/navigation/TopLoadingBarHost";
import "./globals.css";

export const metadata: Metadata = {
  title: "DC Space",
  description: "DC Space student events platform",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/site-tour.css" />
      </head>
      <body>
        <AuthProvider>
          <TopLoadingBarHost />
          <SoftNavEnhancer />
          <RoutePresence>{children}</RoutePresence>
        </AuthProvider>
      </body>
    </html>
  );
}
