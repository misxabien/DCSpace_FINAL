"use client";

import type { LegacyPageData } from "@/lib/navigation";
import { LegacyContent } from "@/components/legacy/useLegacyPage";

export function AuthLegacyPage({ data }: { data: LegacyPageData }) {
  return <LegacyContent data={data} />;
}
