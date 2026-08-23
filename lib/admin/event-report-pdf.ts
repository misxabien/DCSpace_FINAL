import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";

export type EventReportPhotoInput = {
  id: string;
  dataUrl: string;
  uploadedAt: string;
  archived: boolean;
  caption?: string;
  source?: string;
};

export type EventReportPdfInput = {
  title: string;
  generatedAt: string;
  trigger: string;
  event: {
    title: string;
    status: string;
    location: string;
    organizerName: string;
    startsAt: string;
    endsAt: string;
    category: string;
    description: string;
  };
  stats: {
    registrations: number;
    tapIn: number;
    tapOut: number;
    attendanceRate: number;
    uniqueParticipants: number;
    averageAttendanceMinutes: number;
    avgDurationLabel: string;
    qualifiedForCertificate: number;
    feedbackCount: number;
    averageRating: number;
    overallSentiment: string;
    savedInterest: number;
    duplicateScans: number;
    peakPeriod: string;
    lowestPeriod: string;
    photoCount?: number;
    activePhotoCount?: number;
    archivedPhotoCount?: number;
  };
  sections: {
    summary: string;
    attendance: string;
    feedback: string;
    security: string;
    recommendations: string;
  };
  feedbackSamples?: string[];
  photos?: EventReportPhotoInput[];
};

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function wrapText(text: string, maxChars: number): string[] {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  if (!words[0]) return ["—"];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 12);
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const trimmed = String(dataUrl || "").trim();
  const marker = ";base64,";
  const dataPrefix = "data:";
  if (!trimmed.startsWith(dataPrefix) || !trimmed.includes(marker)) return null;
  const mimeEnd = trimmed.indexOf(marker);
  const mime = trimmed.slice(dataPrefix.length, mimeEnd).toLowerCase().trim();
  const base64 = trimmed.slice(mimeEnd + marker.length);
  if (!mime || !base64) return null;
  try {
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    if (!bytes.length) return null;
    return { mime, bytes };
  } catch {
    return null;
  }
}

async function embedPhoto(
  pdf: PDFDocument,
  photo: EventReportPhotoInput,
): Promise<PDFImage | null> {
  const parsed = parseDataUrl(photo.dataUrl);
  if (!parsed) {
    console.error(`[DC Space] Event report photo ${photo.id}: invalid dataUrl`);
    return null;
  }

  try {
    if (parsed.mime.includes("png")) {
      return await pdf.embedPng(parsed.bytes);
    }
    if (
      parsed.mime.includes("jpeg") ||
      parsed.mime.includes("jpg") ||
      parsed.mime === "image/pjpeg"
    ) {
      return await pdf.embedJpg(parsed.bytes);
    }
    // Attempt JPEG then PNG for unknown image/* payloads.
    try {
      return await pdf.embedJpg(parsed.bytes);
    } catch {
      return await pdf.embedPng(parsed.bytes);
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`[DC Space] Event report photo ${photo.id} embed failed:`, details);
    return null;
  }
}

/** Build a multi-page DC Space event report PDF; returns raw base64 (no data: prefix). */
export async function buildEventReportPdf(input: EventReportPdfInput): Promise<string> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawLine = (text: string, size: number, useBold = false, color = rgb(0.15, 0.2, 0.3)) => {
    ensureSpace(size + 8);
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: useBold ? bold : font,
      color,
    });
    y -= size + 8;
  };

  const drawParagraph = (label: string, body: string) => {
    drawLine(label, 12, true, rgb(0.17, 0.4, 0.85));
    for (const line of wrapText(body, 88)) {
      drawLine(line, 10, false, rgb(0.2, 0.24, 0.3));
    }
    y -= 6;
  };

  drawLine("DC Space — Event Report", 18, true, rgb(0.17, 0.4, 0.85));
  drawLine(input.event.title || input.title || "Event", 14, true);
  drawLine(`Generated: ${formatDate(input.generatedAt)}  ·  Trigger: ${input.trigger}`, 9, false, rgb(0.4, 0.45, 0.5));
  y -= 8;

  drawLine("Event Information", 12, true, rgb(0.17, 0.4, 0.85));
  drawLine(`Status: ${(input.event.status || "—").toUpperCase()}`, 10);
  drawLine(`Location: ${input.event.location || "—"}`, 10);
  drawLine(`Organizer: ${input.event.organizerName || "—"}`, 10);
  drawLine(`Category: ${input.event.category || "—"}`, 10);
  drawLine(`Starts: ${formatDate(input.event.startsAt)}`, 10);
  drawLine(`Ends: ${formatDate(input.event.endsAt)}`, 10);
  y -= 4;
  for (const line of wrapText(input.event.description || "No description provided.", 88)) {
    drawLine(line, 10);
  }
  y -= 10;

  const photos = Array.isArray(input.photos) ? input.photos : [];
  const activePhotoCount =
    typeof input.stats.activePhotoCount === "number"
      ? input.stats.activePhotoCount
      : photos.filter((photo) => !photo.archived).length;
  const archivedPhotoCount =
    typeof input.stats.archivedPhotoCount === "number"
      ? input.stats.archivedPhotoCount
      : photos.filter((photo) => photo.archived).length;
  const photoCount =
    typeof input.stats.photoCount === "number" ? input.stats.photoCount : photos.length;

  drawLine("Key Metrics", 12, true, rgb(0.17, 0.4, 0.85));
  const metrics = [
    `Registrations: ${input.stats.registrations}`,
    `Tap-in / Tap-out: ${input.stats.tapIn} / ${input.stats.tapOut}`,
    `Attendance rate: ${input.stats.attendanceRate}%`,
    `Unique participants: ${input.stats.uniqueParticipants}`,
    `Avg duration: ${input.stats.avgDurationLabel || `${input.stats.averageAttendanceMinutes} min`}`,
    `Qualified for certificate: ${input.stats.qualifiedForCertificate}`,
    `Feedback responses: ${input.stats.feedbackCount} (avg ${input.stats.averageRating || "—"}/5, ${input.stats.overallSentiment})`,
    `Saved interest: ${input.stats.savedInterest}`,
    `Duplicate scan alerts: ${input.stats.duplicateScans}`,
    `Peak / lowest attendance: ${input.stats.peakPeriod} / ${input.stats.lowestPeriod}`,
    `Archived / gallery photos: ${photoCount} (active ${activePhotoCount}, archived ${archivedPhotoCount})`,
  ];
  for (const line of metrics) drawLine(line, 10);
  y -= 10;

  drawParagraph("Summary", input.sections.summary);
  drawParagraph("Attendance", input.sections.attendance);
  drawParagraph("Feedback", input.sections.feedback);
  drawParagraph("Security", input.sections.security);
  drawParagraph("Recommendations", input.sections.recommendations);

  if (input.feedbackSamples?.length) {
    drawLine("Feedback samples", 12, true, rgb(0.17, 0.4, 0.85));
    for (const sample of input.feedbackSamples.slice(0, 6)) {
      for (const line of wrapText(`• ${sample}`, 88)) {
        drawLine(line, 9);
      }
    }
  }

  // Event Photo Archive — embed current event_gallery images
  drawLine("Event Photo Archive", 12, true, rgb(0.17, 0.4, 0.85));
  if (!photos.length) {
    drawLine("No photos found in event_gallery for this event.", 10);
  } else {
    drawLine(
      `${photos.length} photo(s) from event_gallery · ${activePhotoCount} active · ${archivedPhotoCount} archived`,
      9,
      false,
      rgb(0.4, 0.45, 0.5),
    );
    y -= 4;

    const maxThumbWidth = 220;
    const maxThumbHeight = 150;

    for (const photo of photos) {
      const image = await embedPhoto(pdf, photo);
      const statusLabel = photo.archived ? "ARCHIVED" : "ACTIVE";
      const caption = (photo.caption || "").trim() || "No caption";
      const meta = `${statusLabel} · Uploaded ${formatDate(photo.uploadedAt)}${
        photo.source ? ` · ${photo.source}` : ""
      }`;

      if (!image) {
        ensureSpace(36);
        drawLine(`[Skipped invalid image] ${meta}`, 9, false, rgb(0.7, 0.25, 0.2));
        drawLine(caption, 9);
        y -= 6;
        continue;
      }

      const scaled = image.scale(
        Math.min(maxThumbWidth / image.width, maxThumbHeight / image.height, 1),
      );
      const blockHeight = scaled.height + 36;
      ensureSpace(blockHeight);

      page.drawImage(image, {
        x: margin,
        y: y - scaled.height,
        width: scaled.width,
        height: scaled.height,
      });
      y -= scaled.height + 6;

      drawLine(meta, 9, true, photo.archived ? rgb(0.55, 0.35, 0.1) : rgb(0.15, 0.45, 0.25));
      for (const line of wrapText(caption, 88)) {
        drawLine(line, 9);
      }
      y -= 8;
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString("base64");
}
