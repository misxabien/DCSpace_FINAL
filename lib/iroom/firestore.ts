import { createSign } from "node:crypto";
import type { IroomLinkedUserDoc, IroomReservationDoc } from "@/lib/iroom/types";
import { getIroomConfig } from "@/lib/iroom/config";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { arrayValue: { values: FirestoreValue[] } }
  | { nullValue: null };

let cachedToken: { token: string; expiresAt: number } | null = null;

function parseServiceAccount(raw: string): ServiceAccount {
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("IROOM_FIREBASE_SERVICE_ACCOUNT must include client_email and private_key.");
  }
  return parsed;
}

function base64Url(input: Buffer | string) {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claimSet}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payload = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error || "Failed to obtain Firebase access token.");
  }

  cachedToken = {
    token: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 3600),
  };
  return payload.access_token;
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(record: Record<string, unknown>) {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

async function upsertDocument(collection: string, documentId: string, data: Record<string, unknown>) {
  const config = getIroomConfig();
  if (!config.enabled) {
    throw new Error("IRoomReserve Firebase is not configured.");
  }

  const serviceAccount = parseServiceAccount(config.serviceAccountJson);
  const token = await getAccessToken(serviceAccount);
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}` +
    `/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(documentId)}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Firestore write failed (${response.status}): ${details.slice(0, 300)}`);
  }
}

export async function upsertIroomReservation(doc: IroomReservationDoc) {
  const config = getIroomConfig();
  await upsertDocument(config.reservationsCollection, doc.reservationId, doc as unknown as Record<string, unknown>);
}

export async function upsertIroomLinkedUser(doc: IroomLinkedUserDoc) {
  const config = getIroomConfig();
  const documentId = doc.email.toLowerCase().replace(/\//g, "_");
  await upsertDocument(config.usersCollection, documentId, doc as unknown as Record<string, unknown>);
}

export async function patchIroomReservationStatus(
  reservationId: string,
  patch: Partial<IroomReservationDoc>,
) {
  const config = getIroomConfig();
  if (!config.enabled) return;

  const serviceAccount = parseServiceAccount(config.serviceAccountJson);
  const token = await getAccessToken(serviceAccount);
  const fieldPaths = Object.keys(patch)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}` +
    `/databases/(default)/documents/${encodeURIComponent(config.reservationsCollection)}/${encodeURIComponent(reservationId)}` +
    `?${fieldPaths}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(patch as Record<string, unknown>) }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Firestore reservation patch failed (${response.status}): ${details.slice(0, 300)}`);
  }
}
