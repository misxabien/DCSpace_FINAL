import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export function parseDurationToMinutes(value: string): number | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;

  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hours|hr|hrs)\b/);
  const minutesMatch = text.match(/(\d+)\s*(?:minute|minutes|min|mins)\b/);

  let total = 0;
  if (hoursMatch) total += Math.round(Number(hoursMatch[1]) * 60);
  if (minutesMatch) total += Number(minutesMatch[1]);

  if (total > 0) return total;

  const numeric = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return text.includes("hour") || text.includes("hr")
    ? Math.round(numeric * 60)
    : Math.round(numeric);
}

export function formatMinutesLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours && mins) {
    return `${hours}h ${mins}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

export function inferCertificateCategory(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "cert-month";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "cert-today";
  const day = date.getDay();
  if (day === 0 || day === 6) return "cert-weekend";
  return "cert-month";
}

function bytesFromBase64(base64: string): Uint8Array {
  const normalized = base64.replace(/^data:application\/pdf;base64,/, "").trim();
  return Uint8Array.from(Buffer.from(normalized, "base64"));
}

export async function buildCertificatePdfFromTemplate(input: {
  templateBase64: string;
  recipientName: string;
  eventName: string;
  dateIssued: string;
}): Promise<string> {
  const pdf = await PDFDocument.load(bytesFromBase64(input.templateBase64));
  const page = pdf.getPages()[0];
  if (!page) {
    throw new Error("Certificate template PDF has no pages.");
  }

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  const name = input.recipientName.trim() || "Participant";
  // Landscape certificate templates put the name blank under "PRESENTED TO"
  // (upper-middle). PDF y=0 is the bottom; ~0.538 sits the baseline a little
  // above that underline. Only overlay the recipient name — the template
  // already has event copy, dates, and signatures.
  const nameSize = Math.max(22, Math.min(28, width / 24));
  const nameWidth = font.widthOfTextAtSize(name, nameSize);
  page.drawText(name, {
    x: Math.max(36, (width - nameWidth) / 2),
    y: height * 0.538,
    size: nameSize,
    font,
    color: rgb(0.13, 0.2, 0.34),
  });

  // Keep event/date params in the signature for callers; unused on filled templates.
  void input.eventName;
  void input.dateIssued;

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString("base64");
}
