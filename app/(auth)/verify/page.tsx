import { AuthLegacyPage } from "@/components/legacy/AuthLegacyPage";
import type { LegacyPageData } from "@/lib/navigation";
import legacyData from "@/content/legacy/05verify.json";

const legacy = legacyData as LegacyPageData;

export default function Page() {
  return <AuthLegacyPage data={legacy} />;
}
