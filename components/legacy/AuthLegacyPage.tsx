"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { useAuthFormBridge } from "@/components/legacy/useAuthFormBridge";

/** Same legacy auth pages — bridge only connects forms to the API. */
export function AuthLegacyPage({ data }: { data: LegacyPageData }) {
  useAuthFormBridge();
  return <LegacyContent data={data} />;
}
