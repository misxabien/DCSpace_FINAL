import { createRequire } from "node:module";
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
import type { PDFFont, PDFPage } from "pdf-lib";
import { GREAT_VIBES_TTF_BASE64 } from "@/lib/certificates/fonts/great-vibes";

export {
  parseDurationToMinutes,
  formatMinutesLabel,
  inferCertificateCategory,
} from "@/lib/certificates/duration";

// Load fontkit through Node so Turbopack does not try to bundle its CJS entry.
const nodeRequire = createRequire(import.meta.url);

function loadFontkit() {
  const packageId = `@${"pdf-lib"}/fontkit`;
  return nodeRequire(packageId) as Parameters<PDFDocument["registerFontkit"]>[0];
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

type LineCandidate = { y: number; length: number };

/**
 * Find long, thin horizontal strokes in the upper-middle of the page —
 * typically the blank under "PRESENTED TO" for the recipient name.
 */
function findNameUnderlineY(page: PDFPage, width: number, height: number): number | null {
  const content = getPageContentText(page);
  if (!content) return null;

  const candidates: LineCandidate[] = [];
  const minLength = width * 0.28;
  const yMin = height * 0.5;
  const yMax = height * 0.82;

  const consider = (y: number, length: number) => {
    if (length < minLength) return;
    if (y < yMin || y > yMax) return;
    candidates.push({ y, length });
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
    consider((y1 + y2) / 2, Math.abs(x2 - x1));
  }

  // thin filled/stroked rect: x y w h re
  const rect = /([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s+re/g;
  while ((match = rect.exec(content))) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const w = Number(match[3]);
    const h = Number(match[4]);
    if (!Number.isFinite(x + y + w + h)) continue;
    if (Math.abs(h) > 4 || Math.abs(w) < minLength) continue;
    consider(y + Math.abs(h) / 2, Math.abs(w));
  }

  if (!candidates.length) return null;

  // Prefer the longest line in the name band (closest to typical blank slot).
  candidates.sort((a, b) => b.length - a.length || Math.abs(a.y - height * 0.64) - Math.abs(b.y - height * 0.64));
  return candidates[0]?.y ?? null;
}


type NameSlot = {
  source: string;
  top: number;
  bottom: number;
  cx: number;
  ruleY: number | null;
  maxWidth: number;
};

function planNameSlotFromPage(page: PDFPage, width: number, height: number): NameSlot {
  const underlineY = findNameUnderlineY(page, width, height);
  if (underlineY != null) {
    return {
      source: "underline",
      top: underlineY + height * 0.12,
      bottom: underlineY,
      cx: width / 2,
      ruleY: underlineY,
      maxWidth: width * 0.62,
    };
  }
  return {
    source: "default",
    top: height * 0.63,
    bottom: height * 0.51,
    cx: width / 2,
    ruleY: null,
    maxWidth: width * 0.6,
  };
}

/** "maria clara santos" / "MARIA CLARA SANTOS" -> "Maria Clara Santos"; mixed case is kept as typed. */
export function formatRecipientName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s\-'’.])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

export async function buildCertificatePdfFromTemplate(input: {
  templateBase64: string;
  recipientName: string;
  eventName: string;
  dateIssued: string;
}): Promise<string> {
  const templateBytes = bytesFromBase64(input.templateBase64);
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPages()[0];
  if (!page) {
    throw new Error("Certificate template PDF has no pages.");
  }
  const { width, height } = page.getSize();

  const slot = planNameSlotFromPage(page, width, height);

  // Elegant script for the name; Times Bold Italic if the font cannot be embedded.
  let font: PDFFont;
  try {
    pdf.registerFontkit(loadFontkit());
    font = await pdf.embedFont(Buffer.from(GREAT_VIBES_TTF_BASE64, "base64"), {
      subset: true,
    });
  } catch (error) {
    console.warn("[DC Space] Certificate font unavailable; using Times Bold Italic.", error);
    font = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  }

  const canDraw = (f: PDFFont, text: string) => {
    try {
      f.encodeText(text);
      return true;
    } catch {
      return false;
    }
  };
  let name = formatRecipientName(input.recipientName) || "Participant";
  // Characters the script font lacks (rare symbols, emoji): use Times, and drop
  // anything even Times cannot print rather than failing the certificate.
  if (!canDraw(font, name)) {
    font = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
    if (!canDraw(font, name)) {
      name = Array.from(name).filter((ch) => canDraw(font, ch)).join("").trim() || "Participant";
    }
  }
  const gap = Math.max(12, slot.top - slot.bottom);
  const ascentPerPoint = font.heightAtSize(100, { descender: false }) / 100;
  let size = Math.min(54, (gap * 0.78) / ascentPerPoint);
  const words = name.split(" ").filter(Boolean);
  const measure = (s: number) => {
    const gapWidth = s * 0.3;
    const widths = words.map((w) => font.widthOfTextAtSize(w, s));
    return { widths, gapWidth, total: widths.reduce((a, b) => a + b, 0) + gapWidth * (words.length - 1) };
  };
  while (size > 14 && measure(size).total > slot.maxWidth) size -= 0.5;
  const ascent = font.heightAtSize(size, { descender: false });
  const y =
    slot.ruleY != null
      ? slot.ruleY + size * 0.2 // sit just above the name line
      : slot.bottom + (gap - ascent) / 2 + size * 0.05; // centred in the empty space
  const { widths, gapWidth, total: nameWidth } = measure(size);
  let x = Math.max(18, Math.min(width - nameWidth - 18, slot.cx - nameWidth / 2));
  words.forEach((word, index) => {
    page.drawText(word, { x, y, size, font, color: rgb(0.11, 0.16, 0.3) });
    x += widths[index] + gapWidth;
  });

  // Keep event/date params in the signature for callers; unused on filled templates.
  void input.eventName;
  void input.dateIssued;

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString("base64");
}
