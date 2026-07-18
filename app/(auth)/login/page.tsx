import { AuthLegacyPage } from "@/components/legacy/AuthLegacyPage";
import { LoginBridge } from "@/components/auth/LoginBridge";
import type { LegacyPageData } from "@/lib/navigation";
import legacyData from "@/content/legacy/01-login.json";

const legacy = legacyData as LegacyPageData;

export default function Page() {
  return (
    <>
      <AuthLegacyPage data={legacy} />
      <LoginBridge />
    </>
  );
}
