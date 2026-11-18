import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
  rgb,
} from "pdf-lib";
import type { PDFPage } from "pdf-lib";

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

function streamToText(stream: PDFStream | PDFRawStream): string {
  try {
    if (stream instanceof PDFRawStream) {
      const decoded = decodePDFRawStream(stream);
      return Buffer.from(decoded.decode()).toString("latin1");
    }
    return Buffer.from(stream.getContents()).toString("latin1");
  } catch {
    try {
      return Buffer.from(stream.getContents()).toString("latin1");
    } catch {
      return "";
    }
  }
}

function getPageContentText(page: PDFPage): string {
  const node = page.node;
  const contents = node.get(PDFName.of("Contents"));
  if (!contents) return "";

  const context = page.doc.context;
  const chunks: string[] = [];

  const pushRefOrStream = (value: unknown) => {
    let resolved = value;
    if (value instanceof PDFRef) {
      resolved = context.lookup(value);
    }
    if (resolved instanceof PDFStream || resolved instanceof PDFRawStream) {
      chunks.push(streamToText(resolved));
    }
  };

  if (contents instanceof PDFRef) {
    const looked = context.lookup(contents);
    if (looked instanceof PDFArray) {
      for (let i = 0; i < looked.size(); i += 1) {
        pushRefOrStream(looked.get(i));
      }
    } else {
      pushRefOrStream(looked);
    }
  } else if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) {
      pushRefOrStream(contents.get(i));
    }
  } else {
    pushRefOrStream(contents);
  }

  return chunks.join("\n");
}

type LineCandidate = { y: number; length: number; centerX: number };

/**
 * Find the blank under "PRESENTED TO" for the recipient name.
 * Prefers centered mid-length strokes in the upper name band — not footer
 * signature lines or full-bleed decorative rules.
 */
function findNameUnderlineY(page: PDFPage, width: number, height: number): number | null {
  const content = getPageContentText(page);
  if (!content) return null;

  const candidates: LineCandidate[] = [];
  const minLength = width * 0.22;
  const maxLength = width * 0.78;
  // Name blank sits under the title block, above body copy.
  const yMin = height * 0.56;
  const yMax = height * 0.78;
  const idealY = height * 0.68;
  const pageCenterX = width / 2;

  const consider = (y: number, length: number, x1: number, x2: number) => {
    if (length < minLength || length > maxLength) return;
    if (y < yMin || y > yMax) return;
    candidates.push({ y, length, centerX: (x1 + x2) / 2 });
  };

  // path: x1 y1 m x2 y2 l  (then stroke)
  const moveLine =
    /([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+m\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+l/g;
  let match: RegExpExecArray | null;
  while ((match = moveLine.exec(content))) {
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);
    if (!Number.isFinite(x1 + y1 + x2 + y2)) continue;
    if (Math.abs(y1 - y2) > 1.5) continue;
    consider((y1 + y2) / 2, Math.abs(x2 - x1), x1, x2);
  }

  // thin filled/stroked rect: x y w h re
  const rect = /([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+re/g;
  while ((match = rect.exec(content))) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const w = Number(match[3]);
    const h = Number(match[4]);
    if (!Number.isFinite(x + y + w + h)) continue;
    if (Math.abs(h) > 4 || Math.abs(w) < minLength || Math.abs(w) > maxLength) continue;
    consider(y + Math.abs(h) / 2, Math.abs(w), x, x + w);
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const score = (c: LineCandidate) =>
      Math.abs(c.y - idealY) * 2.2 +
      Math.abs(c.centerX - pageCenterX) * 0.35 +
      Math.abs(c.length - width * 0.42) * 0.15;
    return score(a) - score(b);
  });
  return candidates[0]?.y ?? null;
}

/**
 * Locate the Y of "PRESENTED TO" (or similar) text so the name can sit just below.
 */
function findPresentedToY(page: PDFPage, height: number): number | null {
  const content = getPageContentText(page);
  if (!content) return null;

  const markers: number[] = [];
  // Common text-show patterns with a preceding Tm / Td move.
  const patterns = [
    /(?:([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+Td|([+-]?\d*\.?\d+(?:\s+[+-]?\d*\.?\d+){4})\s+Tm)\s*\(([^)]*PRESENTED[^)]*)\)\s*Tj/gi,
    /(?:([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+Td|([+-]?\d*\.?\d+(?:\s+[+-]?\d*\.?\d+){4})\s+Tm)\s*\[([^\]]*PRESENTED[^\]]*)\]\s*TJ/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      if (match[1] != null && match[2] != null) {
        const y = Number(match[2]);
        if (Number.isFinite(y) && y > height * 0.45 && y < height * 0.9) markers.push(y);
        continue;
      }
      if (match[3]) {
        const parts = match[3].trim().split(/\s+/).map(Number);
        const y = parts[5];
        if (Number.isFinite(y) && y > height * 0.45 && y < height * 0.9) markers.push(y);
      }
    }
  }

  // Fallback: bare "(...PRESENTED...) Tj" — walk backward for a nearby Td/Tm.
  if (!markers.length) {
    const bare = /\(([^)]*PRESENTED[^)]*)\)\s*Tj/gi;
    let match: RegExpExecArray | null;
    while ((match = bare.exec(content))) {
      const slice = content.slice(Math.max(0, match.index - 180), match.index);
      const td = /([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+Td\s*$/m.exec(slice);
      if (td) {
        const y = Number(td[2]);
        if (Number.isFinite(y) && y > height * 0.45 && y < height * 0.9) markers.push(y);
        continue;
      }
      const tm = /([+-]?\d*\.?\d+(?:\s+[+-]?\d*\.?\d+){5})\s+Tm\s*$/m.exec(slice);
      if (tm) {
        const parts = tm[1].trim().split(/\s+/).map(Number);
        const y = parts[5];
        if (Number.isFinite(y) && y > height * 0.45 && y < height * 0.9) markers.push(y);
      }
    }
  }

  if (!markers.length) return null;
  markers.sort((a, b) => Math.abs(a - height * 0.72) - Math.abs(b - height * 0.72));
  return markers[0] ?? null;
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
  let nameSize = Math.max(22, Math.min(30, width / 22));
  let nameWidth = font.widthOfTextAtSize(name, nameSize);
  const maxNameWidth = width * 0.62;
  while (nameWidth > maxNameWidth && nameSize > 14) {
    nameSize -= 1;
    nameWidth = font.widthOfTextAtSize(name, nameSize);
  }

  // Prefer: underline under PRESENTED TO → just below PRESENTED TO text →
  // calibrated fallback in the name band (above body copy).
  const underlineY = findNameUnderlineY(page, width, height);
  const presentedY = findPresentedToY(page, height);
  let nameY: number;
  if (underlineY != null) {
    // Baseline sits on the blank so glyphs rest on the line.
    nameY = underlineY + Math.max(4, nameSize * 0.18);
  } else if (presentedY != null) {
    nameY = presentedY - nameSize - 14;
  } else {
    // Landscape participation templates typically leave the name slot ~68% up.
    nameY = height * 0.685;
  }

  // Keep the name in the blank under PRESENTED TO — above body copy.
  const minY = height * 0.62;
  const maxY = height * 0.74;
  nameY = Math.min(maxY, Math.max(minY, nameY));

  page.drawText(name, {
    x: Math.max(36, (width - nameWidth) / 2),
    y: nameY,
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
