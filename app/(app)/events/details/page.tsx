import { AppLegacyPage } from "@/components/legacy/AppLegacyPage";
import type { LegacyPageData } from "@/lib/navigation";
import legacyData from "@/content/legacy/19-event-details.json";
import "./event-details-mobile.css";

const legacy = legacyData as LegacyPageData;

export default function Page() {
  return <AppLegacyPage data={legacy} mainClassName="main--event-details" />;
}
