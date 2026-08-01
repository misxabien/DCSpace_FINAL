"use client";

import { useEffect } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { useLegacyScripts } from "@/components/legacy/useLegacyPage";

/**
 * Renders a full admin HTML document body + styles with no AppShell wrapper,
 * so Figma/HTML designs stay visually identical.
 */
export function AdminLegacyPage({ data }: { data: LegacyPageData }) {
  useLegacyScripts(data.scripts);

  useEffect(() => {
    document.title = data.title || "DC Space Admin";
    document.documentElement.setAttribute("data-admin-legacy", "true");
    document.body.setAttribute("data-admin-legacy", "true");
    return () => {
      document.documentElement.removeAttribute("data-admin-legacy");
      document.body.removeAttribute("data-admin-legacy");
    };
  }, [data.title]);

  return (
    <div data-admin-legacy="" className="admin-legacy-root">
      <style dangerouslySetInnerHTML={{ __html: data.styles }} />
      <div dangerouslySetInnerHTML={{ __html: data.html }} />
    </div>
  );
}
