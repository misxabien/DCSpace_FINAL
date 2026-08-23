import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type TimedProgramActivity = {
  title: string;
  startTime: string;
  endTime: string;
};

function parseHm(value: string): number | null {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  const meridian = (match[3] || "").toUpperCase();
  if (meridian === "PM" && hours < 12) hours += 12;
  if (meridian === "AM" && hours === 12) hours = 0;
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

function formatDisplayTime(value: string): string {
  const minutes = parseHm(value);
  if (minutes == null) return String(value || "").trim() || "TBA";
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const meridian = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${meridian}`;
}

export function formatTimedActivityLabel(activity: TimedProgramActivity): string {
  const start = formatDisplayTime(activity.startTime);
  const end = formatDisplayTime(activity.endTime);
  return `${start} – ${end} — ${activity.title}`;
}

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

export function buildProgramFlowFileName(title: string) {
  return `${sanitizeFilePart(title)}-program-flow.pdf`;
}

export async function buildProgramFlowPdf(input: {
  title: string;
  eventType?: string;
  venue?: string;
  venueType?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  activities: TimedProgramActivity[];
}): Promise<{ fileName: string; mimeType: "application/pdf"; base64: string }> {
  const pdf = await PDFDocument.create();
  const pageSize: [number, number] = [612, 792];
  let page = pdf.addPage(pageSize);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  const maxWidth = pageSize[0] - marginX * 2;
  let y = pageSize[1] - 56;

  const ensureSpace = (needed: number) => {
    if (y - needed >= 48) return;
    page = pdf.addPage(pageSize);
    y = pageSize[1] - 56;
  };

  const drawText = (
    text: string,
    options: {
      size: number;
      font?: typeof font;
      color?: ReturnType<typeof rgb>;
      x?: number;
      maxWidth?: number;
    },
  ) => {
    const usedFont = options.font || font;
    const size = options.size;
    const color = options.color || rgb(0.12, 0.14, 0.18);
    const x = options.x ?? marginX;
    const width = options.maxWidth ?? maxWidth;
    const words = text.split(/\s+/).filter(Boolean);
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (usedFont.widthOfTextAtSize(next, size) <= width) {
        line = next;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (!lines.length) lines.push("");

    for (const row of lines) {
      ensureSpace(size + 8);
      page.drawText(row, { x, y, size, font: usedFont, color });
      y -= size + 6;
    }
  };

  drawText("DC Space — Event Program Flow", {
    size: 11,
    font: bold,
    color: rgb(0.2, 0.35, 0.55),
  });
  y -= 4;
  drawText(input.title.trim() || "Untitled Event", {
    size: 20,
    font: bold,
  });

  const metaBits = [
    input.eventType ? `Type: ${input.eventType}` : "",
    input.startDate
      ? `Date: ${input.startDate}${input.endDate && input.endDate !== input.startDate ? ` – ${input.endDate}` : ""}`
      : "",
    input.startTime || input.endTime
      ? `Time: ${formatDisplayTime(input.startTime || "")}${input.endTime ? ` – ${formatDisplayTime(input.endTime)}` : ""}`
      : "",
    input.venue ? `Venue: ${input.venue}${input.venueType ? ` (${input.venueType})` : ""}` : "",
  ].filter(Boolean);

  for (const bit of metaBits) {
    drawText(bit, { size: 11, color: rgb(0.3, 0.33, 0.38) });
  }

  y -= 10;
  ensureSpace(2);
  page.drawRectangle({
    x: marginX,
    y: y + 4,
    width: maxWidth,
    height: 1.2,
    color: rgb(0.78, 0.8, 0.84),
  });
  y -= 18;

  drawText("Suggested Schedule", { size: 13, font: bold });
  y -= 4;

  input.activities.forEach((activity, index) => {
    ensureSpace(46);
    const rowTop = y + 12;
    page.drawRectangle({
      x: marginX,
      y: rowTop - 34,
      width: maxWidth,
      height: 38,
      color: index % 2 === 0 ? rgb(0.96, 0.97, 0.98) : rgb(1, 1, 1),
      borderColor: rgb(0.86, 0.88, 0.9),
      borderWidth: 0.8,
    });

    const timeLabel = `${formatDisplayTime(activity.startTime)} – ${formatDisplayTime(activity.endTime)}`;
    page.drawText(timeLabel, {
      x: marginX + 12,
      y: rowTop - 16,
      size: 10,
      font: bold,
      color: rgb(0.15, 0.35, 0.55),
    });
    const title =
      font.widthOfTextAtSize(activity.title, 11) <= maxWidth - 24
        ? activity.title
        : `${activity.title.slice(0, 70)}…`;
    page.drawText(title, {
      x: marginX + 12,
      y: rowTop - 30,
      size: 11,
      font,
      color: rgb(0.12, 0.14, 0.18),
    });
    y -= 46;
  });

  if (input.notes?.trim()) {
    y -= 8;
    drawText("Notes", { size: 12, font: bold });
    drawText(input.notes.trim(), { size: 10, color: rgb(0.3, 0.33, 0.38) });
  }

  y -= 16;
  drawText("Generated by DC Space with Gemini AI. Times are suggested and can be edited by organizers.", {
    size: 8,
    color: rgb(0.45, 0.48, 0.52),
  });

  const bytes = await pdf.save();
  return {
    fileName: buildProgramFlowFileName(input.title),
    mimeType: "application/pdf",
    base64: Buffer.from(bytes).toString("base64"),
  };
}

export function normalizeTimedActivities(
  raw: unknown,
  fallbackStart = "08:00",
  fallbackEnd = "12:00",
): TimedProgramActivity[] {
  const startMinutes = parseHm(fallbackStart) ?? 8 * 60;
  const endMinutes = parseHm(fallbackEnd) ?? 12 * 60;
  const span = Math.max(endMinutes - startMinutes, 60);

  if (!Array.isArray(raw)) return [];

  const items = raw
    .map((item) => {
      if (typeof item === "string") {
        const title = item.trim();
        return title ? { title, startTime: "", endTime: "" } : null;
      }
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = String(record.title || record.activity || record.name || "").trim();
      if (!title) return null;
      return {
        title: title.slice(0, 120),
        startTime: String(record.startTime || record.start || "").trim(),
        endTime: String(record.endTime || record.end || "").trim(),
      };
    })
    .filter(Boolean) as TimedProgramActivity[];

  if (!items.length) return [];

  const slot = Math.max(10, Math.floor(span / items.length));
  return items.slice(0, 12).map((item, index) => {
    const parsedStart = parseHm(item.startTime);
    const parsedEnd = parseHm(item.endTime);
    const start = parsedStart ?? startMinutes + index * slot;
    const end = parsedEnd && parsedEnd > start ? parsedEnd : start + slot;
    const toHm = (mins: number) => {
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };
    return {
      title: item.title,
      startTime: toHm(start),
      endTime: toHm(end),
    };
  });
}
