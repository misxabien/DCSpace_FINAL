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

/** Blank landscape template used when an event has e-cert enabled but no uploaded PDF yet. */
export async function buildDefaultCertificateTemplate(): Promise<string> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([792, 612]);
  const { width, height } = page.getSize();
  const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: rgb(0.27, 0.54, 1),
    borderWidth: 3,
    color: rgb(0.98, 0.99, 1),
  });

  const heading = "Certificate of Participation";
  const headingSize = 28;
  const headingWidth = titleFont.widthOfTextAtSize(heading, headingSize);
  page.drawText(heading, {
    x: (width - headingWidth) / 2,
    y: height * 0.72,
    size: headingSize,
    font: titleFont,
    color: rgb(0.13, 0.2, 0.34),
  });

  const subtitle = "St. Dominic College of Asia · DC Space";
  const subtitleSize = 14;
  const subtitleWidth = bodyFont.widthOfTextAtSize(subtitle, subtitleSize);
  page.drawText(subtitle, {
    x: (width - subtitleWidth) / 2,
    y: height * 0.64,
    size: subtitleSize,
    font: bodyFont,
    color: rgb(0.35, 0.4, 0.48),
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString("base64");
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
  const subFont = await pdf.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();

  const name = input.recipientName.trim() || "Participant";
  const title = input.eventName.trim() || "Event";
  const nameSize = Math.max(24, Math.min(34, width / 18));
  const metaSize = Math.max(12, Math.min(16, width / 42));

  const nameWidth = font.widthOfTextAtSize(name, nameSize);
  page.drawText(name, {
    x: Math.max(36, (width - nameWidth) / 2),
    y: height * 0.38,
    size: nameSize,
    font,
    color: rgb(0.13, 0.2, 0.34),
  });

  const subtitle = `For completing the attendance requirement for ${title}`;
  const subtitleWidth = subFont.widthOfTextAtSize(subtitle, metaSize);
  page.drawText(subtitle, {
    x: Math.max(36, (width - subtitleWidth) / 2),
    y: height * 0.31,
    size: metaSize,
    font: subFont,
    color: rgb(0.23, 0.27, 0.33),
  });

  const issued = `Issued ${input.dateIssued}`;
  const issuedWidth = subFont.widthOfTextAtSize(issued, metaSize);
  page.drawText(issued, {
    x: Math.max(36, (width - issuedWidth) / 2),
    y: height * 0.25,
    size: metaSize,
    font: subFont,
    color: rgb(0.23, 0.27, 0.33),
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString("base64");
}
