import type { Metadata } from "next";
import { AdminAuthClient } from "@/components/auth/AdminAuthClient";

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

        /* Unread notification red dot on topbar bell */
        [data-admin-legacy] a.icon-btn[href*="/admin/notif"],
        [data-admin-legacy] a.notif-bell[href*="/admin/notif"] {
          position: relative !important;
          display: inline-grid !important;
          place-items: center !important;
        }
        [data-admin-legacy] a.icon-btn[href*="/admin/notif"].has-unread::after,
        [data-admin-legacy] a.notif-bell[href*="/admin/notif"].has-unread::after {
          content: "" !important;
          position: absolute !important;
          top: 4px !important;
          right: 4px !important;
          width: 9px !important;
          height: 9px !important;
          border-radius: 50% !important;
          background: #ef4444 !important;
          border: 2px solid #ffffff !important;
          box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.25) !important;
          pointer-events: none !important;
          z-index: 2 !important;
        }
        [data-admin-legacy] .notif-unread-dot {
          position: absolute !important;
          top: 4px !important;
          right: 4px !important;
          width: 9px !important;
          height: 9px !important;
          border-radius: 50% !important;
          background: #ef4444 !important;
          border: 2px solid #ffffff !important;
          box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.25) !important;
          pointer-events: none !important;
          z-index: 3 !important;
        }
        [data-admin-legacy] .notif-item.unread {
          cursor: pointer !important;
          background: rgba(68, 138, 255, 0.06) !important;
          box-shadow: inset 3px 0 0 #ef4444 !important;
        }
        [data-admin-legacy] .notif-item.unread .title {
          font-weight: 700 !important;
        }

        /* RFID Tap In / Tap Out — taller blank time boxes */
        [data-admin-legacy] .tap-times {
          min-height: 96px !important;
        }
        [data-admin-legacy] .tap-times span,
        [data-admin-legacy] #tap-in,
        [data-admin-legacy] #tap-out {
          min-height: 96px !important;
          padding: 28px 16px !important;
          font-size: 28px !important;
          font-weight: 700 !important;
          letter-spacing: -0.02em !important;
          line-height: 1 !important;
          box-sizing: border-box !important;
        }
        [data-admin-legacy] .tap-times span.is-blank,
        [data-admin-legacy] #tap-in.is-blank,
        [data-admin-legacy] #tap-out.is-blank {
          color: rgba(30, 41, 59, 0.28) !important;
          letter-spacing: 0.08em !important;
        }

        /* RFID Tap In / Tap Out mode buttons */
        [data-admin-legacy] .dc-rfid-mode-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 14px 0 12px;
        }
        [data-admin-legacy] .dc-rfid-mode-btn {
          appearance: none;
          border: 1.5px solid rgba(68, 138, 255, 0.35);
          background: #fff;
          color: #448aff;
          border-radius: 12px;
          padding: 14px 16px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease,
            box-shadow 0.15s ease;
        }
        [data-admin-legacy] .dc-rfid-mode-btn:hover {
          border-color: #448aff;
          background: #f3f8ff;
        }
        [data-admin-legacy] .dc-rfid-mode-btn.is-active {
          background: #448aff;
          border-color: #448aff;
          color: #fff;
          box-shadow: 0 4px 14px rgba(68, 138, 255, 0.35);
        }
        [data-admin-legacy] .dc-rfid-mode-hint {
          grid-column: 1 / -1;
          margin: 2px 0 0;
          font-size: 12px;
          font-weight: 500;
          color: #64748b;
        }
        [data-admin-legacy] .tap-panel[data-scan-mode="in"] #tap-in,
        [data-admin-legacy] .tap-panel[data-scan-mode="out"] #tap-out {
          box-shadow: inset 0 0 0 2px rgba(68, 138, 255, 0.35);
          background: rgba(68, 138, 255, 0.04);
        }

        /* Attendance Security — recent RFID error list */
        [data-admin-legacy] .dc-security-event-list {
          margin: 12px 0 4px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #f8fafc;
          border: 1px solid rgba(68, 138, 255, 0.14);
        }
        [data-admin-legacy] .dc-security-event-heading {
          margin: 0 0 8px;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        [data-admin-legacy] .dc-security-event-empty {
          margin: 0;
          font-size: 13px;
          color: #94a3b8;
        }
        [data-admin-legacy] .dc-security-event-list ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 10px;
        }
        [data-admin-legacy] .dc-security-event-list li {
          display: grid;
          grid-template-columns: 72px 1fr;
          gap: 10px;
          align-items: start;
          font-size: 13px;
          color: #334155;
        }
        [data-admin-legacy] .dc-security-event-time {
          font-weight: 650;
          color: #448aff;
          font-size: 12px;
          padding-top: 2px;
        }
        [data-admin-legacy] .dc-security-event-msg {
          color: #64748b;
          font-size: 12px;
        }

        /* Smoother detail + RFID profile loading */
        [data-admin-legacy] .admin-legacy-root.is-loading-details .detail-top-main,
        [data-admin-legacy] .admin-legacy-root.is-loading-details #event-info-card {
          opacity: 0.72;
          transition: opacity 0.2s ease;
        }
        [data-admin-legacy] .admin-legacy-root.dc-details-loaded .detail-top-main,
        [data-admin-legacy] .admin-legacy-root.dc-details-loaded #event-info-card {
          opacity: 1;
          transition: opacity 0.25s ease;
        }
        [data-admin-legacy] .profile-card {
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        [data-admin-legacy] .profile-card.is-loading {
          opacity: 0.55;
        }
        [data-admin-legacy] .profile-card.dc-profile-live {
          opacity: 1;
        }
        [data-admin-legacy] .profile-card.dc-profile-live .profile-name,
        [data-admin-legacy] .profile-card.dc-profile-live .profile-meta span {
          transition: color 0.15s ease;
        }
        [data-admin-legacy] .ai-conclusion-box.is-loading {
          opacity: 0.65;
        }

        /* Event detail poster: image fills the blue box; hide when empty */
        [data-admin-legacy] .poster.has-image,
        [data-admin-legacy] .detail-top-aside .poster.has-image,
        [data-admin-legacy] .detail-top-meta .poster.has-image,
        [data-admin-legacy] .submit-meta .poster.has-image {
          background-color: transparent !important;
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
        }
        [data-admin-legacy] .poster[hidden],
        [data-admin-legacy] .poster[style*="display: none"] {
          display: none !important;
        }
      `}</style>
      <AdminAuthClient />
      {children}
    </>
  );
}
