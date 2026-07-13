import { AppLegacyPage } from "@/components/legacy/AppLegacyPage";
import type { LegacyPageData } from "@/lib/navigation";
import legacyData from "@/content/legacy/36-profile.json";

const legacy = legacyData as LegacyPageData;

export default function Page() {
  return <AppLegacyPage data={legacy} />;
}
