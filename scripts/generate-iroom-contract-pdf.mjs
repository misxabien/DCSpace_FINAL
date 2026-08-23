#!/usr/bin/env node
/**
 * Generate docs/IROOM_INTEGRATION_CONTRACT.pdf from structured content.
 * Usage: node scripts/generate-iroom-contract-pdf.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "docs", "IROOM_INTEGRATION_CONTRACT.pdf");

const PAGE = [612, 792];
const MARGIN_X = 48;
const MARGIN_BOTTOM = 48;
const MAX_WIDTH = PAGE[0] - MARGIN_X * 2;

const sections = [
  {
    title: "DC Space ↔ eRoomReserve Integration Contract",
    subtitle: "Version 1.0 · August 23, 2026 · DC Space (MongoDB) · eRoomReserve (Firebase)",
    body: [],
  },
  {
    title: "1. Purpose",
    body: [
      "Connect DC Space and eRoomReserve without sharing databases. DC Space sends on-campus event room requests; eRoomReserve checks availability and performs first-level room approval; DC Space admin gives final event sign-off.",
    ],
  },
  {
    title: "2. System Ownership",
    body: [
      "DC Space (MongoDB: dcspace_user, dcspace_admin) owns users, events, registrations, attendance, and certificates.",
      "eRoomReserve (Firebase) owns rooms, availability, and the reservation approval workflow.",
      "Neither system reads or writes the other's primary database directly.",
    ],
  },
  {
    title: "3. Integration Flow",
    body: [
      "1. Organizer submits On Campus event in DC Space (status: pending).",
      "2. DC Space writes reservation to eRoom Firebase (status: pending).",
      "3. Organizer opens eRoomReserve (optional deep link).",
      "4. eRoomReserve checks availability and approves or rejects the room.",
      "5. eRoomReserve calls the DC Space webhook with the status update.",
      "6. DC Space admin reviews the event and gives final approve/reject.",
      "7. Event goes live for students.",
    ],
  },
  {
    title: "4.1 DC Space → eRoomReserve (Firebase Write)",
    body: [
      "DC Space upserts linkedUsers and reservations using a Firebase service account provided by eRoomReserve.",
      "",
      "Collection: linkedUsers (document ID = normalized email)",
      "Required fields: dcSpaceUserId, email, fullName, sourceSystem (always \"dcspace\"), updatedAt.",
      "Optional: firstName, lastName, studentNumber, role, organizationPart, organizationRole, school, course.",
      "",
      "Collection: reservations (document ID = dcspace-{eventId})",
      "DC Space writes: reservationId, dcSpaceEventId, eventTitle, startAt, endAt, requestedByEmail, requestedByName, venueType (On Campus), conceptPaperUrl, conceptPaperName, status (pending).",
      "eRoomReserve writes on approval: roomId, roomName, building, approvedBy, approvedAt, status (approved).",
      "eRoomReserve writes on rejection: rejectionReason, status (rejected).",
      "",
      "Collection: rooms (eRoom-owned)",
      "Fields: roomId, roomName, building, capacity, isActive.",
    ],
  },
  {
    title: "4.2 eRoomReserve → DC Space (HTTPS Webhook)",
    body: [
      "Endpoint: POST {DC_SPACE_BASE_URL}/api/integrations/iroom/webhook",
      "Header: X-Iroom-Secret: {shared secret}",
      "Header: Content-Type: application/json",
      "",
      "Valid status values: pending, approved, rejected, cancelled",
      "",
      "Approved payload example:",
      "{",
      '  "reservationId": "dcspace-674abc123",',
      '  "dcSpaceEventId": "674abc123",',
      '  "status": "approved",',
      '  "roomId": "avr-101",',
      '  "roomName": "AVR Room 101",',
      '  "building": "Main Building",',
      '  "approvedBy": "admin@sdca.edu.ph",',
      '  "approvedAt": "2026-08-23T08:00:00.000Z"',
      "}",
      "",
      "Rejected payload example:",
      "{",
      '  "reservationId": "dcspace-674abc123",',
      '  "dcSpaceEventId": "674abc123",',
      '  "status": "rejected",',
      '  "rejectionReason": "No rooms available for the requested time slot."',
      "}",
      "",
      "Responses: 200 success · 401 unauthorized · 400 validation error",
      "",
      "eRoomReserve must call this webhook when a room is approved, rejected, or cancelled.",
    ],
  },
  {
    title: "4.3 DC Space Endpoints (Reference)",
    body: [
      "POST /api/integrations/iroom/reservations — DC Space creates or refreshes a reservation.",
      "GET /api/integrations/iroom/reservations?eventId= — DC Space reads room status.",
      "POST /api/integrations/iroom/webhook — eRoomReserve pushes status updates.",
    ],
  },
  {
    title: "5. Deep Link (Organizer Handoff)",
    body: [
      "When configured, DC Space opens:",
      "{IROOM_APP_URL}?reservationId=dcspace-{eventId}&dcSpaceEventId={eventId}&source=dcspace",
      "",
      "Concept paper URL:",
      "{DC_SPACE_BASE_URL}/api/events/{eventId}/attachments/concept-paper",
    ],
  },
  {
    title: "6. Credentials to Exchange",
    body: [
      "From eRoomReserve to DC Space: Firebase Project ID, Service Account JSON, IROOM_APP_URL, shared webhook secret.",
      "From DC Space to eRoomReserve: production webhook URL, staging webhook URL (optional), DC Space base URL.",
      "",
      "DC Space .env keys:",
      "IROOM_FIREBASE_PROJECT_ID",
      "IROOM_FIREBASE_SERVICE_ACCOUNT",
      "IROOM_APP_URL",
      "IROOM_WEBHOOK_SECRET",
      "IROOM_USERS_COLLECTION=linkedUsers",
      "IROOM_RESERVATIONS_COLLECTION=reservations",
    ],
  },
  {
    title: "7. Approval Responsibilities",
    body: [
      "Stage 1 — Room request: DC Space submits event and writes reservation to Firebase.",
      "Stage 2 — Availability + room approval: eRoomReserve checks slots, assigns room, sends webhook.",
      "Stage 3 — Final event approval: DC Space admin approves or rejects for publication.",
      "",
      "For on-campus events, DC Space admin final approval should only happen after eRoomReserve sets status: approved.",
    ],
  },
  {
    title: "8. Security Requirements",
    body: [
      "All production traffic over HTTPS.",
      "Webhook authenticated via X-Iroom-Secret header.",
      "Firebase service account scoped to linkedUsers and reservations writes only.",
      "Do not sync passwords, auth tokens, attendance, registrations, or full media files.",
      "Recommend webhook retries with exponential backoff (max 5 attempts).",
    ],
  },
  {
    title: "9. Status Lifecycle",
    body: [
      "none → pending → approved (happy path)",
      "              → rejected (no room / policy)",
      "              → cancelled (event cancelled in either system)",
      "",
      "eRoom Firebase: reservations.status",
      "DC Space Mongo: events.iroomStatus, events.iroomRoomId, events.iroomRoomName",
    ],
  },
  {
    title: "10. eRoomReserve Delivery Checklist",
    body: [
      "[ ] Firebase linkedUsers + reservations collections created",
      "[ ] Service account issued to DC Space team",
      "[ ] Reservation review UI (filter sourceSystem = dcspace)",
      "[ ] Room availability check for startAt / endAt",
      "[ ] Approve/reject workflow with room assignment",
      "[ ] Webhook caller to DC Space on every status change",
      "[ ] Deep-link page for reservationId + dcSpaceEventId",
      "[ ] Handle cancelled when DC Space cancels/postpones event",
      "[ ] Staging environment tested end-to-end",
    ],
  },
  {
    title: "11. Contacts",
    body: [
      "DC Space backend: ___________________________",
      "eRoomReserve backend: ______________________",
      "Shared secret owner: _______________________",
    ],
  },
  {
    title: "12. References",
    body: [
      "docs/IROOM_INTEGRATION.md",
      "app/api/integrations/iroom/webhook/route.ts",
      "lib/iroom/sync.ts",
    ],
  },
  {
    title: "Signatures",
    body: [
      "DC Space: Name / Date ______________________",
      "",
      "eRoomReserve: Name / Date __________________",
    ],
  },
];

function sanitizeForPdf(text) {
  return String(text)
    .replace(/\u2194/g, "<->")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2192/g, "->")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function wrapText(text, font, size, maxWidth) {
  const words = sanitizeForPdf(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  let page = pdf.addPage(PAGE);
  let y = PAGE[1] - 56;
  let pageNum = 1;

  const drawFooter = () => {
    page.drawText(`DC Space · eRoomReserve Integration Contract · Page ${pageNum}`, {
      x: MARGIN_X,
      y: 28,
      size: 8,
      font,
      color: rgb(0.5, 0.52, 0.55),
    });
  };

  const newPage = () => {
    drawFooter();
    page = pdf.addPage(PAGE);
    pageNum += 1;
    y = PAGE[1] - 56;
  };

  const ensureSpace = (needed) => {
    if (y - needed >= MARGIN_BOTTOM) return;
    newPage();
  };

  const drawLines = (text, options = {}) => {
    const size = options.size ?? 10;
    const usedFont = options.mono ? mono : options.bold ? bold : font;
    const color = options.color ?? rgb(0.12, 0.14, 0.18);
    const indent = options.indent ?? 0;
    const lineHeight = size + (options.mono ? 4 : 5);
    const width = MAX_WIDTH - indent;
    const rows = options.mono
      ? sanitizeForPdf(text).split("\n")
      : wrapText(text, usedFont, size, width);

    for (const row of rows) {
      ensureSpace(lineHeight + 2);
      page.drawText(row, {
        x: MARGIN_X + indent,
        y,
        size,
        font: usedFont,
        color,
      });
      y -= lineHeight;
    }
  };

  // Cover block
  drawLines("DC Space <-> eRoomReserve", { size: 22, bold: true });
  y -= 4;
  drawLines("Integration Contract", { size: 18, bold: true });
  y -= 8;
  drawLines("Version 1.0 · August 23, 2026", { size: 11, color: rgb(0.35, 0.38, 0.42) });
  drawLines("DC Space (MongoDB) · eRoomReserve (Firebase)", {
    size: 11,
    color: rgb(0.35, 0.38, 0.42),
  });
  y -= 12;
  page.drawRectangle({
    x: MARGIN_X,
    y: y + 4,
    width: MAX_WIDTH,
    height: 1,
    color: rgb(0.78, 0.8, 0.84),
  });
  y -= 20;

  for (const section of sections.slice(1)) {
    ensureSpace(28);
    drawLines(section.title, { size: 13, bold: true, color: rgb(0.15, 0.35, 0.55) });
    y -= 4;
    for (const paragraph of section.body) {
      if (paragraph === "") {
        y -= 6;
        continue;
      }
      const isCode =
        paragraph.startsWith("{") ||
        paragraph.startsWith("  ") ||
        paragraph.startsWith("IROOM_") ||
        paragraph.startsWith("POST ") ||
        paragraph.startsWith("GET ") ||
        paragraph.includes("?reservationId=") ||
        paragraph.includes("/api/events/");
      drawLines(paragraph, {
        size: isCode ? 8.5 : 10,
        mono: isCode,
        color: isCode ? rgb(0.2, 0.22, 0.26) : rgb(0.12, 0.14, 0.18),
        indent: isCode ? 8 : 0,
      });
      y -= 2;
    }
    y -= 8;
  }

  drawFooter();
  const bytes = await pdf.save();
  fs.writeFileSync(outPath, bytes);
  console.log(`Wrote ${outPath} (${bytes.length} bytes)`);
}

buildPdf().catch((error) => {
  console.error(error);
  process.exit(1);
});
