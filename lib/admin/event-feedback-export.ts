import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { toWinAnsi } from "@/lib/pdf/win-ansi";

type PhaseEntry = { at: string; rating: number; title: string; comment: string } | null;
type PhaseSummary = { responses: number; averageRating: number | null; responseRate: number | null };

export type EventFeedbackExportInput = {
  event: { title: string; startsAt: string; venue: string; status: string };
  feedbackStatus: string;
  registered: number;
  midEvent: PhaseSummary;
  postEvent: PhaseSummary;
  participants: Array<{ email: string; name: string; course: string; mid: PhaseEntry; post: PhaseEntry }>;
};

const when = (value?: string) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

export function feedbackExportFileName(title: string, ext: "csv" | "pdf") {
  const slug = String(title || "event").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50) || "event";
  return `${slug}-feedback-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

/** CSV of every participant's survey answers (BOM so Excel reads it as UTF-8). */
export function buildEventFeedbackCsv(input: EventFeedbackExportInput) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    // Comments are typed by participants: stop Excel from running them as formulas.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows: unknown[][] = [
    ["Name", "Email", "Course", "Mid-event submitted", "Mid-event rating", "Mid-event comment", "Post-event submitted", "Post-event rating", "Post-event comment"],
  ];
  for (const p of input.participants) {
    rows.push([
      p.name,
      p.email,
      p.course,
      p.mid ? when(p.mid.at) : "Pending",
      p.mid?.rating || "",
      p.mid?.comment || "",
      p.post ? when(p.post.at) : "Pending",
      p.post?.rating || "",
      p.post?.comment || "",
    ]);
  }
  return `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}

/** One-file summary + every participant's answers, for printing or sharing. */
export async function buildEventFeedbackPdf(input: EventFeedbackExportInput) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612;
  const H = 792;
  const M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const write = (raw: string, size: number, f: PDFFont = font, color = rgb(0.15, 0.18, 0.25), indent = 0) => {
    const maxWidth = W - M * 2 - indent;
    for (const paragraph of toWinAnsi(raw).split(/\n+/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";
      const flush = () => {
        if (y < M + size) {
          page = pdf.addPage([W, H]);
          y = H - M;
        }
        page.drawText(line, { x: M + indent, y, size, font: f, color });
        y -= size + 5;
        line = "";
      };
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && f.widthOfTextAtSize(next, size) > maxWidth) {
          flush();
          line = word;
        } else {
          line = next;
        }
      }
      if (line) flush();
    }
  };
  const blue = rgb(0.17, 0.4, 0.85);
  const grey = rgb(0.4, 0.45, 0.5);
  const phaseLine = (label: string, s: PhaseSummary) =>
    `${label}: ${s.responses}/${input.registered} responses` +
    (s.responseRate == null ? "" : ` (${s.responseRate}%)`) +
    (s.averageRating ? `, average rating ${s.averageRating}/5` : "");

  write("DC Space — Event Feedback", 18, bold, blue);
  write(input.event.title || "Event", 14, bold);
  write([when(input.event.startsAt), input.event.venue].filter(Boolean).join("  ·  ") || " ", 10, font, grey);
  write(`Exported ${when(new Date().toISOString())}  ·  Feedback status: ${input.feedbackStatus}`, 9, font, grey);
  y -= 8;
  write("Summary", 12, bold, blue);
  write(`Registered participants: ${input.registered}`, 10);
  write(phaseLine("Mid-event survey", input.midEvent), 10);
  write(phaseLine("Post-event survey", input.postEvent), 10);
  y -= 8;
  write("Responses", 12, bold, blue);
  if (!input.participants.length) write("No registered participants or feedback yet.", 10, font, grey);
  for (const p of input.participants) {
    y -= 4;
    write(p.name, 11, bold);
    write([p.course, p.email].filter(Boolean).join("  ·  "), 9, font, grey);
    for (const [label, entry] of [["Mid-event", p.mid], ["Post-event", p.post]] as const) {
      if (!entry) {
        write(`${label}: pending`, 10, font, grey, 12);
        continue;
      }
      write(`${label}: ${entry.rating ? `${entry.rating}/5` : "no rating"}  ·  ${when(entry.at)}`, 10, font, undefined, 12);
      if (entry.comment) write(`"${entry.comment}"`, 10, font, rgb(0.25, 0.28, 0.35), 24);
    }
  }
  return Buffer.from(await pdf.save());
}
