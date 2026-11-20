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

// ---------------------------------------------------------------------------
// Name slot detection
//
// Read the template like a person would: find the "given to / presented to /
// certify that" line, then place the name in the empty space under it — on the
// name line when one is drawn there. Works with Canva/Word exports (scaled
// coordinates, form XObjects, image or vector rules). Falls back to the older
// underline scan, then to a sensible default band.
// ---------------------------------------------------------------------------

const NAME_ANCHOR =
  /(given|presented|awarded|conferred|granted|issued)to|certif(y|ies)that|thisistocertify|ipinagkakaloobkay|iginagawadkay/;

type TextLine = { y: number; size: number; xMin: number; xMax: number; text: string };
type Rule = { x: number; w: number; y: number; top: number };
type View = { x0: number; y0: number; width: number; height: number };
type NameSlot = {
  source: string;
  top: number;
  bottom: number;
  cx: number;
  ruleY: number | null;
  maxWidth: number;
};

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const applyMatrix = (m: Matrix, x: number, y: number) =>
  [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] as const;

async function analyzeTemplateLayout(
  bytes: Uint8Array,
): Promise<{ view: View; lines: TextLine[]; rules: Rule[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const [vx0, vy0, vx1, vy1] = page.view;
    const view: View = { x0: vx0, y0: vy0, width: vx1 - vx0, height: vy1 - vy0 };

    // Text lines (page space, y up), grouping fragments that share a baseline.
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is (typeof item & { str: string; transform: number[]; width: number; height: number }) =>
        "str" in item && typeof item.str === "string" && item.str.trim().length > 0,
      )
      .map((item) => {
        const [, , c, d, e, f] = item.transform;
        return { str: item.str, x: e, y: f, w: item.width, size: Math.hypot(c, d) || item.height || 10 };
      })
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const grouped: Array<TextLine & { parts: typeof items }> = [];
    for (const item of items) {
      const line = grouped.find(
        (l) => Math.abs(l.y - item.y) < Math.max(2, Math.min(l.size, item.size) * 0.45),
      );
      if (line) {
        line.parts.push(item);
        line.size = Math.max(line.size, item.size);
        line.xMin = Math.min(line.xMin, item.x);
        line.xMax = Math.max(line.xMax, item.x + item.w);
      } else {
        grouped.push({ y: item.y, size: item.size, xMin: item.x, xMax: item.x + item.w, text: "", parts: [item] });
      }
    }
    const lines: TextLine[] = grouped.map(({ parts, ...line }) => ({
      ...line,
      text: parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(" "),
    }));

    // Long, thin horizontal shapes (strokes, thin fills, thin images) = name rules.
    const ops = await page.getOperatorList();
    const OPS = pdfjs.OPS;
    let ctm: Matrix = [1, 0, 0, 1, 0, 0];
    const stack: Matrix[] = [];
    const rules: Rule[] = [];
    const addBox = (bx0: number, by0: number, bx1: number, by1: number) => {
      const pts = [applyMatrix(ctm, bx0, by0), applyMatrix(ctm, bx1, by0), applyMatrix(ctm, bx0, by1), applyMatrix(ctm, bx1, by1)];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      if (w >= view.width * 0.22 && h <= 6) {
        rules.push({ x: Math.min(...xs), w, y: (Math.max(...ys) + Math.min(...ys)) / 2, top: Math.max(...ys) });
      }
    };
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i] as unknown[];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = multiply(ctm, args as unknown as Matrix);
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push(ctm);
        if (Array.isArray(args[0]) && args[0].length === 6) ctm = multiply(ctm, args[0] as Matrix);
      } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === OPS.constructPath) {
        const minMax = args[2] as number[] | undefined;
        if (minMax && minMax.length === 4 && minMax.every(Number.isFinite)) {
          addBox(minMax[0], minMax[1], minMax[2], minMax[3]);
        }
      } else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageMaskXObject
      ) {
        addBox(0, 0, 1, 1);
      }
    }
    return { view, lines, rules };
  } finally {
    await doc.destroy();
  }
}

function planNameSlot(layout: { view: View; lines: TextLine[]; rules: Rule[] }): NameSlot {
  const { view, lines, rules } = layout;
  const anchor = lines.find(
    (l) =>
      NAME_ANCHOR.test(l.text.toLowerCase().replace(/[^a-zñ]/g, "")) &&
      l.y > view.y0 + view.height * 0.3,
  );
  if (anchor) {
    const below = lines
      .filter((l) => l.y < anchor.y - anchor.size * 0.6)
      .sort((a, b) => b.y - a.y)[0];
    const top = anchor.y - anchor.size * 0.35;
    const bottom = below
      ? below.y + below.size * 0.8
      : Math.max(view.y0 + view.height * 0.3, anchor.y - view.height * 0.22);
    const cx = (anchor.xMin + anchor.xMax) / 2;
    const rule = rules
      .filter((r) => r.y < top - 4 && r.y > bottom - 2 && r.x < cx && r.x + r.w > cx)
      .sort((a, b) => a.y - b.y)[0];
    return {
      source: rule ? "anchor+rule" : "anchor-gap",
      top,
      bottom,
      cx: rule ? rule.x + rule.w / 2 : cx,
      ruleY: rule ? rule.top : null,
      maxWidth: Math.max(rule ? rule.w * 1.08 : 0, view.width * 0.7),
    };
  }
  const band = rules
    .filter((r) => r.y > view.y0 + view.height * 0.35 && r.y < view.y0 + view.height * 0.75)
    .sort((a, b) => b.w - a.w)[0];
  if (band) {
    return {
      source: "rule",
      top: band.top + view.height * 0.12,
      bottom: band.top,
      cx: band.x + band.w / 2,
      ruleY: band.top,
      maxWidth: Math.max(band.w * 1.08, view.width * 0.7),
    };
  }
  const mid = view.y0 + view.height * 0.55;
  return {
    source: "default",
    top: mid + view.height * 0.08,
    bottom: mid - view.height * 0.04,
    cx: view.x0 + view.width / 2,
    ruleY: null,
    maxWidth: view.width * 0.6,
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

  // Where does the name go?
  let slot: NameSlot;
  try {
    slot = planNameSlot(await analyzeTemplateLayout(templateBytes));
  } catch (error) {
    console.warn("[DC Space] Certificate layout analysis failed; using underline scan.", error);
    const underlineY = findNameUnderlineY(page, width, height);
    slot =
      underlineY != null
        ? { source: "underline", top: underlineY + height * 0.12, bottom: underlineY, cx: width / 2, ruleY: underlineY, maxWidth: width * 0.62 }
        : { source: "default", top: height * 0.63, bottom: height * 0.51, cx: width / 2, ruleY: null, maxWidth: width * 0.6 };
  }

  // Elegant script for the name; Times Bold Italic if the font cannot be embedded.
  let font: PDFFont;
  try {
    const [{ default: fontkit }, { GREAT_VIBES_TTF_BASE64 }] = await Promise.all([
      import("@pdf-lib/fontkit"),
      import("@/lib/certificates/fonts/great-vibes"),
    ]);
    pdf.registerFontkit(fontkit);
    font = await pdf.embedFont(Buffer.from(GREAT_VIBES_TTF_BASE64, "base64"), { subset: true });
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
