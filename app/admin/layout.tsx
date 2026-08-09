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
      <link rel="stylesheet" href="/assets/admin-sidebar-collapse.css?v=11" />
      {/* Isolate admin HTML pages from student globals as much as possible */}
      <style>{`
        html:has([data-admin-legacy]),
        body:has([data-admin-legacy]),
        body[data-admin-legacy] {
          max-width: none !important;
          overflow-x: auto !important;
          background: #ffffff !important;
        }

        /* Sticky admin sidebar — profile/logout stay visible while main scrolls */
        [data-admin-legacy] .app {
          align-items: start !important;
        }
        [data-admin-legacy] .sidebar {
          position: sticky !important;
          top: 0 !important;
          align-self: start !important;
          height: 100vh !important;
          max-height: 100vh !important;
          min-height: 100vh !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }
        [data-admin-legacy] .sidebar .nav {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
        }
        [data-admin-legacy] .sidebar .user-menu {
          margin-top: auto !important;
          flex-shrink: 0 !important;
        }
        [data-admin-legacy] .main {
          min-width: 0 !important;
        }
      `}</style>
      {children}
    </>
  );
}
