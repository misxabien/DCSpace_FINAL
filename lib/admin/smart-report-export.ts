import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toWinAnsi } from "@/lib/pdf/win-ansi";

export type SmartReportDraft = {
  executiveSummary?: string;
  rationale?: string;
  objectives?: string;
  highlights?: string;
  recommendations?: string;
  conclusion?: string;
};

export type SmartExportFormat = "word" | "docs" | "excel" | "pdf";

const SECTIONS: Array<{ key: keyof SmartReportDraft; title: string }> = [
  { key: "executiveSummary", title: "Executive Summary" },
  { key: "rationale", title: "Event Rationale" },
  { key: "objectives", title: "Event Objectives" },
  { key: "highlights", title: "Key Highlights" },
  { key: "recommendations", title: "Recommendations" },
  { key: "conclusion", title: "Conclusion" },
];

function escapeCsv(value: string) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function buildPlainBody(title: string, draft: SmartReportDraft) {
  const parts = [`${title}\n${"=".repeat(Math.min(title.length, 60))}`];
  for (const section of SECTIONS) {
    const value = String(draft[section.key] || "").trim();
    if (!value) continue;
    parts.push(`\n${section.title}\n${"-".repeat(section.title.length)}\n${value}`);
  }
  return parts.join("\n").trim() || title;
}

function buildRtf(title: string, draft: SmartReportDraft) {
  // RTF is read as ANSI: anything beyond plain ASCII ("ñ", "—", emoji) must be
  // written as \uN? (signed 16-bit; characters above U+FFFF as a surrogate pair).
  const escape = (text: string) => {
    let out = "";
    for (const ch of String(text || "")) {
      const code = ch.codePointAt(0) ?? 0;
      if (ch === "\\") out += "\\\\";
      else if (ch === "{") out += "\\{";
      else if (ch === "}") out += "\\}";
      else if (ch === "\n") out += "\\par ";
      else if (ch === "\r") continue;
      else if (code < 128) out += ch;
      else {
        for (let i = 0; i < ch.length; i++) {
          const unit = ch.charCodeAt(i);
          out += `\\u${unit > 32767 ? unit - 65536 : unit}?`;
        }
      }
    }
    return out;
  };

  let body = `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\b\\fs28 ${escape(title)}}\\par\\par `;
  for (const section of SECTIONS) {
    const value = String(draft[section.key] || "").trim();
    if (!value) continue;
    body += `{\\b\\fs22 ${escape(section.title)}}\\par ${escape(value)}\\par\\par `;
  }
  body += "}";
  return body;
}

function buildCsv(title: string, draft: SmartReportDraft) {
  const rows = [["Section", "Content"]];
  for (const section of SECTIONS) {
    const value = String(draft[section.key] || "").trim();
    if (!value) continue;
    rows.push([section.title, value]);
  }
  if (rows.length === 1) rows.push(["Report", title]);
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

async function buildPdf(title: string, draft: SmartReportDraft) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 740;
  const margin = 48;
  const lineHeight = 14;
  const maxWidth = 516;

  const drawLine = (text: string, size: number, isBold = false) => {
    const activeFont = isBold ? bold : font;
    const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (activeFont.widthOfTextAtSize(next, size) > maxWidth) {
        if (y < margin + lineHeight) {
          page = pdf.addPage([612, 792]);
          y = 740;
        }
        page.drawText(line, { x: margin, y, size, font: activeFont, color: rgb(0.1, 0.1, 0.15) });
        y -= lineHeight + 2;
        line = word;
      } else {
        line = next;
      }
    }
    if (line) {
      if (y < margin + lineHeight) {
        page = pdf.addPage([612, 792]);
        y = 740;
      }
      page.drawText(line, { x: margin, y, size, font: activeFont, color: rgb(0.1, 0.1, 0.15) });
      y -= lineHeight + 2;
    }
  };

  drawLine(title, 16, true);
  y -= 8;

  for (const section of SECTIONS) {
    const value = String(draft[section.key] || "").trim();
    if (!value) continue;
    drawLine(section.title, 12, true);
    y -= 4;
    for (const paragraph of value.split(/\n+/)) {
      if (!paragraph.trim()) continue;
      drawLine(paragraph, 10, false);
      y -= 4;
    }
    y -= 6;
  }

  return Buffer.from(await pdf.save());
}

export async function buildSmartReportExport(input: {
  format: SmartExportFormat;
  title: string;
  draft: SmartReportDraft;
}) {
  const { format, title, draft } = input;
  const safeDate = new Date().toISOString().slice(0, 10);
  const slug = title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "smart-report";

  switch (format) {
    case "word": {
      const body = buildRtf(title, draft);
      return {
        buffer: Buffer.from(body, "utf8"),
        fileName: `${slug}-${safeDate}.doc`,
        mimeType: "application/msword",
        formatLabel: "Word",
      };
    }
    case "docs": {
      const body = buildPlainBody(title, draft);
      return {
        buffer: Buffer.from(body, "utf8"),
        fileName: `${slug}-${safeDate}.txt`,
        mimeType: "text/plain; charset=utf-8",
        formatLabel: "Google Docs",
      };
    }
    case "excel": {
      const body = buildCsv(title, draft);
      return {
        // BOM so Excel opens it as UTF-8 (otherwise "ñ" shows as "Ã±").
        buffer: Buffer.from(`\uFEFF${body}`, "utf8"),
        fileName: `${slug}-${safeDate}.csv`,
        mimeType: "text/csv; charset=utf-8",
        formatLabel: "Excel",
      };
    }
    case "pdf": {
      const buffer = await buildPdf(title, draft);
      return {
        buffer,
        fileName: `${slug}-${safeDate}.pdf`,
        mimeType: "application/pdf",
        formatLabel: "PDF",
      };
    }
    default:
      throw new Error("Unsupported export format.");
  }
}
