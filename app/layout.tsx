import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { RoutePresence } from "@/components/motion/RoutePresence";
import { TopLoadingBarHost } from "@/components/navigation/TopLoadingBarHost";
import "./globals.css";

export const metadata: Metadata = {
  title: "DC Space",
  description: "DC Space student events platform",
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
          <RoutePresence>{children}</RoutePresence>
        </AuthProvider>
      </body>
    </html>
  );
}
