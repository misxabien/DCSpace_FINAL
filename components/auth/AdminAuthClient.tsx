"use client";

import { Suspense, useEffect } from "react";
import { AdminLoginBridge } from "@/components/auth/AdminLoginBridge";
import { AdminDataBridge } from "@/components/auth/AdminDataBridge";
import { AdminEventActionsBridge } from "@/components/auth/AdminEventActionsBridge";
import { AdminOpsBridge } from "@/components/auth/AdminOpsBridge";
import { AdminAiBridge } from "@/components/auth/AdminAiBridge";
import { useAuth } from "@/components/auth/AuthProvider";

function AdminBridges() {
  return (
    <>
      <AdminLoginBridge />
      <AdminDataBridge />
      <Suspense fallback={null}>
        <AdminEventActionsBridge />
        <AdminOpsBridge />
        <AdminAiBridge />
      </Suspense>
    </>
  );
}

/** Mounts shared admin auth + live data bridges for all /admin pages. */
export function AdminAuthClient() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    try {
      if (user?.isAdmin) {
        localStorage.setItem(
          "dc_admin_role",
          user.role === "super-admin" ? "super-admin" : "admin",
        );
        document.body.classList.toggle(
          "is-super-admin",
          user.role === "super-admin",
        );
      }
    } catch {
      /* ignore */
    }
  }, [user, loading]);

  return <AdminBridges />;
}
