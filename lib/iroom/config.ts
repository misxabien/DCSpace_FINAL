export type IroomConfig = {
  enabled: boolean;
  projectId: string;
  serviceAccountJson: string;
  appUrl: string;
  webhookSecret: string;
  usersCollection: string;
  reservationsCollection: string;
};

function readEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

export function getIroomConfig(): IroomConfig {
  const projectId = readEnv("IROOM_FIREBASE_PROJECT_ID");
  const serviceAccountJson = readEnv("IROOM_FIREBASE_SERVICE_ACCOUNT");
  const appUrl = readEnv("IROOM_APP_URL");
  const webhookSecret = readEnv("IROOM_WEBHOOK_SECRET");

  return {
    enabled: Boolean(projectId && serviceAccountJson),
    projectId,
    serviceAccountJson,
    appUrl,
    webhookSecret,
    usersCollection: readEnv("IROOM_USERS_COLLECTION") || "linkedUsers",
    reservationsCollection: readEnv("IROOM_RESERVATIONS_COLLECTION") || "reservations",
  };
}

export function buildIroomOpenUrl(config: IroomConfig, reservationId: string, eventId: string) {
  if (!config.appUrl) return "";
  const url = new URL(config.appUrl);
  url.searchParams.set("reservationId", reservationId);
  url.searchParams.set("dcSpaceEventId", eventId);
  url.searchParams.set("source", "dcspace");
  return url.toString();
}
