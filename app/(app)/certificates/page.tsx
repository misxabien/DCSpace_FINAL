import { AppLegacyPage } from "@/components/legacy/AppLegacyPage";
import type { LegacyPageData } from "@/lib/navigation";
import legacyData from "@/content/legacy/26-certificates.json";

const legacy = legacyData as LegacyPageData;

export default function Page() {
  return <AppLegacyPage data={legacy} />;
}
