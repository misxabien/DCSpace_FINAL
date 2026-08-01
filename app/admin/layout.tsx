import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DC Space | Admin",
  description: "DC Space Administrator Console",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <link rel="stylesheet" href="/assets/admin-sidebar-collapse.css" />
      {/* Isolate admin HTML pages from student globals as much as possible */}
      <style>{`
        html:has([data-admin-legacy]),
        body:has([data-admin-legacy]) {
          max-width: none !important;
          overflow-x: auto !important;
          background: transparent;
        }
      `}</style>
      {children}
    </>
  );
}
