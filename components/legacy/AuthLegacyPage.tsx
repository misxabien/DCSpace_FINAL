"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { LegacyContent } from "@/components/legacy/useLegacyPage";
import { useAuthFormBridge } from "@/components/legacy/useAuthFormBridge";

export function AuthLegacyPage({ data }: { data: LegacyPageData }) {
  useAuthFormBridge();
  return <LegacyContent data={data} />;
}
