import { AdminLegacyPage } from "@/components/legacy/AdminLegacyPage";
import type { LegacyPageData } from "@/lib/navigation";
import legacyData from "@/content/admin-legacy/managef29.json";

const legacy = legacyData as LegacyPageData;

export default function Page() {
  return <AdminLegacyPage data={legacy} />;
}
