"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { patchChildren } from "@/lib/legacy-dom-patch";
import { resolveAdminEventId } from "@/lib/events/resolve-admin-event-id";

type EventInsights = {
  expectedAttendees: number;
  expectedAttendanceRate: number;
  predictionConfidence: number;
  capacityRisk: string;
  overbookingRisk: string;
  underutilizationRisk: string;
  capacityConclusion: string;
  crowdInsight: string;
  attendanceInsight: string;
  securityInsight: string;
  eventSummary: string;
  performanceSummary: string;
  futureRecommendations: string;
  peakPeriod: string;
  lowestPeriod: string;
  avgDurationLabel: string;
  comparedToPrediction: number;
  recommendations: string[];
  tappedIn?: number;
  tappedOut?: number;
  currentlyInside?: number;
  attendanceRate?: number;
  registrations?: number;
  savedInterest?: number;
  feedbackCount?: number;
  averageRating?: number;
  overallSentiment?: string;
  crowdDensity?: string;
  congestionRisk?: string;
  predictedPeakTime?: string;
  predictedPeakOccupancy?: number;
  crowdFlow?: string;
  flowStatus?: string;
  securityRisk?: string;
  duplicateScans?: number;
  interestFlow?: string;
  registrationStatus?: string;
};

type SmartReport = {
  executiveSummary?: string;
  rationale?: string;
  objectives?: string;
  highlights?: string;
  recommendations?: string;
  conclusion?: string;
};

const EVENT_DETAIL_PAGES = new Set([
  "edetails14",
  "aed15",
  "pop26",
  "reject25",
  "rr24",
  "live16",
  "cc19",
  "c23",
  "postponed22",
  "rejected21",
  "deets43",
]);

const REPORT_STORAGE = {
  draft: "dc_ai_report",
  eventIds: "dc_ai_report_event_ids",
  reportType: "dc_ai_report_type",
  sections: "dc_ai_report_sections",
};

function pageIdFromPath(pathname: string) {
  if (!pathname.startsWith("/admin")) return "";
  return pathname.replace(/^\/admin\/?/, "").split("/")[0] || "";
}

function riskClass(value: string) {
  const text = value.toLowerCase();
  if (text.includes("critical") || text.includes("high") || text.includes("alert")) return "bad";
  if (text.includes("moderate") || text.includes("medium") || text.includes("watch")) return "warn";
  return "";
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.sessionStorage.setItem(key, JSON.stringify(value));
}

function setMetricRow(root: ParentNode, labelIncludes: string, value: string, pct?: number) {
  root.querySelectorAll(".metric-row, .stat-row").forEach((row) => {
    const label = row.querySelector(".metric-label, .stat-label");
    if (!label) return;
    if (!(label.textContent || "").toLowerCase().includes(labelIncludes.toLowerCase())) return;
    const valueEl = row.querySelector(".metric-value, .flow-pill, .stat-value");
    if (valueEl) {
      valueEl.textContent = value;
      if (valueEl.classList.contains("flow-pill")) {
        valueEl.classList.remove("bad", "warn");
        const cls = riskClass(value);
        if (cls) valueEl.classList.add(cls);
      }
    }
    const fill = row.querySelector<HTMLElement>(".progress-fill");
    if (fill && pct != null) {
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      fill.style.width = `${clamped}%`;
      if (/%/.test(fill.textContent || "")) fill.textContent = `${clamped}%`;
    }
  });
}

function setConclusion(root: ParentNode, titleIncludes: string, text: string) {
  if (!text) return;
  root.querySelectorAll(".ai-conclusion").forEach((block) => {
    const title = block.querySelector(".ai-conclusion-title");
    if (!title) return;
    if (!(title.textContent || "").toLowerCase().includes(titleIncludes.toLowerCase())) return;
    const box = block.querySelector(".ai-conclusion-box");
    if (box) box.textContent = text;
  });
}

function applyEventInsights(root: ParentNode, data: EventInsights) {
  setMetricRow(root, "predictive expected attendee", `${data.expectedAttendees} Attendees`);
  setMetricRow(root, "expected attendance rate", `${data.expectedAttendanceRate}%`, data.expectedAttendanceRate);
  setMetricRow(root, "predicted attendance", `${data.expectedAttendanceRate}%`, data.expectedAttendanceRate);
  setMetricRow(root, "prediction confidence", `${data.predictionConfidence}%`, data.predictionConfidence);
  setMetricRow(root, "capacity risk", data.capacityRisk);
  setMetricRow(root, "overbooking risk", data.overbookingRisk);
  setMetricRow(root, "underutilization risk", data.underutilizationRisk);
  setMetricRow(root, "attendance rate compared", `${data.comparedToPrediction}%`, data.comparedToPrediction);
  setMetricRow(root, "peak attendance", data.peakPeriod);
  setMetricRow(root, "lowest attendance", data.lowestPeriod);
  setMetricRow(root, "average attendance duration", data.avgDurationLabel);
  setMetricRow(root, "registered participants", String(data.registrations ?? data.expectedAttendees));
  setMetricRow(root, "saved the event", String(data.savedInterest ?? 0));
  setMetricRow(root, "tapped in", String(data.tappedIn ?? 0));
  setMetricRow(root, "tapped out", String(data.tappedOut ?? 0));
  setMetricRow(root, "current inside", String(data.currentlyInside ?? 0));
  setMetricRow(root, "attendance rate", `${data.attendanceRate ?? data.expectedAttendanceRate}%`, data.attendanceRate ?? data.expectedAttendanceRate);
  setMetricRow(root, "crowd density", data.crowdDensity || "Low");
  setMetricRow(root, "congestion risk", data.congestionRisk || "Low");
  setMetricRow(root, "predicted peak time", data.predictedPeakTime || data.peakPeriod);
  setMetricRow(root, "predicted peak occupancy", String(data.predictedPeakOccupancy ?? data.currentlyInside ?? 0));
  setMetricRow(root, "crowd flow", data.crowdFlow || "Stable");
  setMetricRow(root, "peak arrival", data.peakPeriod);
  setMetricRow(root, "flow status", data.flowStatus || "Normal");
  setMetricRow(root, "duplicate scans", String(data.duplicateScans ?? 0));
  setMetricRow(root, "security risk", data.securityRisk || "Low");
  setMetricRow(root, "responses received", String(data.feedbackCount ?? 0));
  setMetricRow(root, "average rating", data.averageRating ? `${data.averageRating}/5` : "—");
  setMetricRow(root, "overall sentiment", data.overallSentiment || "Pending");
  setMetricRow(root, "interest flow", data.interestFlow || "Steady");
  setMetricRow(root, "registration status", data.registrationStatus || "Open");

  setConclusion(root, "capacity conclusion", data.capacityConclusion);
  setConclusion(root, "crowd insight", data.crowdInsight);
  setConclusion(root, "attendance insight", data.attendanceInsight);
  setConclusion(root, "security insight", data.securityInsight);
  setConclusion(root, "event summary", data.eventSummary);
  setConclusion(root, "performance summary", data.performanceSummary);
  setConclusion(root, "recommendations for future", data.futureRecommendations);

  const reco = root.querySelector(".ai-reco-box, [data-mini-body].ai-reco-box");
  if (reco && data.recommendations.length) {
    reco.textContent = data.recommendations.map((item) => `• ${item}`).join("\n");
  }
}

function unavailableInsights(): EventInsights {
  return {
    expectedAttendees: 0,
    expectedAttendanceRate: 0,
    predictionConfidence: 0,
    capacityRisk: "Pending",
    overbookingRisk: "Pending",
    underutilizationRisk: "Pending",
    capacityConclusion: "AI insights are unavailable. Live event data is still stored in the database.",
    crowdInsight: "Connect Gemini with GEMINI_API_KEY in .env.local to generate crowd analysis from this event.",
    attendanceInsight: "Attendance numbers will appear here after Gemini can read the live records.",
    securityInsight: "RFID tap records stay in MongoDB even when AI is offline.",
    eventSummary: "This event is loaded from the database. AI summary could not be generated.",
    performanceSummary: "Performance analysis needs Gemini to be configured.",
    futureRecommendations: "Add GEMINI_API_KEY and reload this page to refresh recommendations.",
    peakPeriod: "—",
    lowestPeriod: "—",
    avgDurationLabel: "—",
    comparedToPrediction: 0,
    recommendations: ["AI is offline until GEMINI_API_KEY is set."],
  };
}

function markEventAiLoading(root: ParentNode) {
  root.querySelectorAll(".ai-conclusion-box").forEach((box) => {
    box.textContent = "Generating Gemini insights…";
  });
  const reco = root.querySelector(".ai-reco-box, [data-mini-body].ai-reco-box");
  if (reco) reco.textContent = "Generating Gemini recommendations…";
}

async function hydrateEventPage(root: ParentNode, eventId: string) {
  markEventAiLoading(root);
  const res = await fetch("/api/ai/event-insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ eventId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    applyEventInsights(root, unavailableInsights());
    return;
  }
  applyEventInsights(root, payload as EventInsights);
}

async function hydrateUserInsights(userId: string) {
  const res = await fetch("/api/ai/user-insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ userId }),
  });
  const payload = await res.json().catch(() => ({}));
  const card = document.getElementById("participant-ai-insights");
  if (!card) return;
  const rings = card.querySelectorAll(".ring span");
  if (!res.ok) {
    if (rings[0]) rings[0].textContent = "—";
    if (rings[1]) rings[1].textContent = "—";
    if (rings[2]) rings[2].textContent = "—";
    const message = card.querySelector(".insight-box p");
    if (message) message.textContent = "AI insights unavailable. Add GEMINI_API_KEY to enable Gemini.";
    return;
  }
  if (rings[0]) rings[0].textContent = `${Math.round(Number(payload.attendanceReliability || 0))}%`;
  if (rings[1]) rings[1].textContent = `${Math.round(Number(payload.participationScore || 0))}/100`;
  if (rings[2]) rings[2].textContent = String(payload.rfidAlerts || "None");
  const message = card.querySelector(".insight-box p");
  if (message && payload.recommendedReview) message.textContent = String(payload.recommendedReview);
}

async function hydrateHomeInsights(root: ParentNode) {
  const nodes = Array.from(root.querySelectorAll(".notif-item")).filter((node) =>
    /AI |Smart Recommendation|Unusual Attendance|Attendance Verification/i.test(node.textContent || ""),
  );
  nodes.forEach((node) => {
    const body = node.querySelector("p");
    if (body) body.textContent = "Generating Gemini insight…";
  });
  const res = await fetch("/api/ai/home-insights", { cache: "no-store", credentials: "include" });
  const payload = await res.json().catch(() => ({}));
  const items = Array.isArray(payload.items)
    ? (payload.items as Array<{ title: string; body: string; tone: string }>)
    : [];
  const fallback = {
    title: "AI insights unavailable",
    body: res.ok
      ? "No campus insights yet. New events and attendance will appear here from Gemini."
      : "Gemini is not configured or failed. Live stats still come from the database.",
    tone: "yellow",
  };
  nodes.forEach((node, index) => {
    const item = items[index] || fallback;
    const title = node.querySelector("strong");
    const body = node.querySelector("p");
    const dot = node.querySelector(".dot");
    if (title) title.textContent = item.title;
    if (body) body.textContent = item.body;
    if (dot) {
      dot.classList.remove("yellow", "red");
      if (item.tone === "yellow") dot.classList.add("yellow");
      if (item.tone === "red") dot.classList.add("red");
    }
  });
}

function htmlFromText(value?: string) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br>");
}

function ensureReportEditors() {
  const extra: Array<{ id: string; title: string; label: string }> = [
    { id: "editor-highlights", title: "Key Highlights", label: "Key Highlights" },
    { id: "editor-recommendations", title: "Recommendations", label: "Recommendations" },
    { id: "editor-conclusion", title: "Conclusion", label: "Conclusion" },
  ];
  extra.forEach((item, index) => {
    if (document.getElementById(item.id)) return;
    const blocks = document.querySelectorAll(".rg-edit-block");
    const template = blocks[Math.min(index, blocks.length - 1)] as HTMLElement | undefined;
    if (!template?.parentElement) return;
    const clone = template.cloneNode(true) as HTMLElement;
    const heading = clone.querySelector("h3");
    if (heading) heading.textContent = item.title;
    const editor = clone.querySelector(".rg-editor-body");
    if (editor) {
      editor.id = item.id;
      editor.setAttribute("aria-label", item.label);
      editor.textContent = "";
    }
    const editBtn = clone.querySelector<HTMLElement>(".rg-edit-btn");
    if (editBtn) editBtn.setAttribute("data-target", item.id);
    template.parentElement.appendChild(clone);
  });
}

function fillReportEditors(report: SmartReport) {
  ensureReportEditors();
  const setEditor = (id: string, value?: string) => {
    const el = document.getElementById(id);
    if (el && value) el.innerHTML = htmlFromText(value);
  };
  setEditor("editor-summary", report.executiveSummary);
  setEditor("editor-rationale", report.rationale);
  setEditor("editor-objectives", report.objectives);
  setEditor("editor-highlights", report.highlights);
  setEditor("editor-recommendations", report.recommendations);
  setEditor("editor-conclusion", report.conclusion);
}

function fillReportPreview(report: SmartReport) {
  const doc = document.querySelector(".rg-preview-doc");
  if (!doc) return;
  const map: Array<{ title: string; value?: string }> = [
    { title: "Executive Summary", value: report.executiveSummary },
    { title: "Event Rationale", value: report.rationale },
    { title: "Event Objectives", value: report.objectives },
    { title: "Key Highlights", value: report.highlights },
    { title: "Recommendations", value: report.recommendations },
    { title: "Conclusion", value: report.conclusion },
  ];
  const headings = Array.from(doc.querySelectorAll("h3"));
  map.forEach((section, index) => {
    if (!section.value) return;
    let heading = headings[index];
    if (!heading) {
      heading = document.createElement("h3");
      const paragraph = document.createElement("p");
      doc.appendChild(heading);
      doc.appendChild(paragraph);
    }
    heading.textContent = section.title;
    const paragraph = heading.nextElementSibling;
    if (paragraph && paragraph.tagName === "P") {
      paragraph.textContent = section.value;
    }
  });
}

function formatStamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function persistReportType() {
  const selected = document.querySelector<HTMLInputElement>('input[name="report-type"]:checked');
  if (selected?.value) writeJson(REPORT_STORAGE.reportType, selected.value);
  document.querySelectorAll<HTMLInputElement>('input[name="report-type"]').forEach((input) => {
    if (input.dataset.dcAiWired === "1") return;
    input.dataset.dcAiWired = "1";
    input.addEventListener("change", () => {
      if (input.checked) writeJson(REPORT_STORAGE.reportType, input.value);
    });
  });
}

function persistReportSections() {
  const save = () => {
    const values = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="section"]:checked'),
    ).map((input) => input.value);
    writeJson(REPORT_STORAGE.sections, values);
  };
  save();
  document.querySelectorAll<HTMLInputElement>('input[name="section"]').forEach((input) => {
    if (input.dataset.dcAiWired === "1") return;
    input.dataset.dcAiWired = "1";
    input.addEventListener("change", save);
  });
}

async function hydrateReportEvents(root: ParentNode) {
  const list = root.querySelector(".rg-list");
  if (!list) return;
  const res = await fetch("/api/events?limit=80", { cache: "no-store" });
  if (!res.ok) return;
  const payload = (await res.json()) as {
    events?: Array<{
      id: string;
      title: string;
      status: string;
      location?: string;
      startsAt?: string;
      endsAt?: string;
    }>;
  };
  const events = (payload.events || []).filter((event) =>
    ["completed", "live", "approved"].includes(event.status),
  );
  const preferred = events.filter((event) => event.status === "completed");
  const rows = (preferred.length ? preferred : events).slice(0, 12);
  const selectedIds = readJson<string[]>(REPORT_STORAGE.eventIds, []);

  patchChildren(list, ".rg-event", rows, (el, event, index) => {
    el.dataset.eventId = event.id;
    const selected = selectedIds.includes(event.id) || (!selectedIds.length && index === 0);
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-pressed", selected ? "true" : "false");
    const title = el.querySelector("h3");
    const lines = el.querySelectorAll("p");
    if (title) title.textContent = event.title;
    if (lines[0]) lines[0].textContent = formatStamp(event.startsAt);
    if (lines[1]) lines[1].textContent = event.location || "—";
    if (el.dataset.dcAiWired !== "1") {
      el.dataset.dcAiWired = "1";
      el.addEventListener("click", () => {
        list.querySelectorAll(".rg-event").forEach((node) => {
          node.classList.remove("selected");
          node.setAttribute("aria-pressed", "false");
        });
        el.classList.add("selected");
        el.setAttribute("aria-pressed", "true");
        writeJson(REPORT_STORAGE.eventIds, [event.id]);
      });
    }
  });

  if (!selectedIds.length && rows[0]) writeJson(REPORT_STORAGE.eventIds, [rows[0].id]);
}

async function hydrateRetrievedEvent(root: ParentNode) {
  const ids = readJson<string[]>(REPORT_STORAGE.eventIds, []);
  const eventId = ids[0];
  if (!eventId) return;
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`, { cache: "no-store" });
  if (!res.ok) return;
  const payload = (await res.json()) as {
    event?: {
      title?: string;
      location?: string;
      status?: string;
      category?: string;
      startsAt?: string;
      endsAt?: string;
      organizerName?: string;
    };
  };
  const event = payload.event;
  if (!event) return;
  const cardTitle = root.querySelector(".rg-card h3");
  if (cardTitle) cardTitle.textContent = event.title || "Event";
  root.querySelectorAll(".rg-meta").forEach((meta) => {
    const label = (meta.querySelector(".label")?.textContent || "").trim().toUpperCase();
    const value = meta.querySelector(".value");
    if (!value) return;
    if (label === "START DATE") value.textContent = formatDate(event.startsAt);
    if (label === "END DATE") value.textContent = formatDate(event.endsAt || event.startsAt);
    if (label === "START TIME") value.textContent = formatTime(event.startsAt);
    if (label === "END TIME") value.textContent = formatTime(event.endsAt);
    if (label === "VENUE") value.textContent = event.location || "—";
    if (label === "EVENT STATUS") value.textContent = (event.status || "—").toUpperCase();
    if (label === "EVENT TYPE") value.textContent = event.category || "—";
    if (label === "ORGANIZATION/COMMITTEE") value.textContent = event.organizerName || "—";
  });
}

function wireSmartReport() {
  persistReportType();
  persistReportSections();

  const button = document.getElementById("rg-gen-btn");
  if (button && button.dataset.dcAiWired !== "1") {
    button.dataset.dcAiWired = "1";
    button.addEventListener("click", async () => {
      const ready = document.getElementById("state-ready");
      const processing = document.getElementById("state-processing");
      const done = document.getElementById("state-done");
      ready?.setAttribute("hidden", "");
      processing?.removeAttribute("hidden");
      done?.setAttribute("hidden", "");
      try {
        const res = await fetch("/api/ai/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            eventIds: readJson<string[]>(REPORT_STORAGE.eventIds, []),
            reportType: readJson<string>(REPORT_STORAGE.reportType, "event-summary"),
            sections: readJson<string[]>(REPORT_STORAGE.sections, []),
            refresh: true,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || payload.details || "Failed to generate AI report.");
        }
        writeJson(REPORT_STORAGE.draft, payload);
        processing?.setAttribute("hidden", "");
        done?.removeAttribute("hidden");
      } catch (error) {
        processing?.setAttribute("hidden", "");
        ready?.removeAttribute("hidden");
        window.alert(error instanceof Error ? error.message : "Failed to generate AI report.");
      }
    });
  }

  const report = readJson<SmartReport | null>(REPORT_STORAGE.draft, null);
  if (report) {
    fillReportEditors(report);
    fillReportPreview(report);
  }
}

/** Fills existing admin AI panels from Gemini without changing legacy layout. */
export function AdminAiBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const pageId = pageIdFromPath(pathname);
    const root =
      document.querySelector(".admin-legacy-root") ||
      document.querySelector("[data-admin-page]") ||
      document.body;
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      try {
        const eventId = await resolveAdminEventId(
          searchParams.get("id") || "",
          searchParams.get("status") || "",
        );
        if (EVENT_DETAIL_PAGES.has(pageId) && eventId) {
          await hydrateEventPage(root, eventId);
        } else if (EVENT_DETAIL_PAGES.has(pageId)) {
          applyEventInsights(root, unavailableInsights());
        }
        if (pageId === "info30") {
          const userId = searchParams.get("id") || "";
          if (userId) {
            try {
              await hydrateUserInsights(userId);
            } catch {
              const card = document.getElementById("participant-ai-insights");
              const message = card?.querySelector(".insight-box p");
              if (message) message.textContent = "AI insights unavailable.";
            }
          }
        }
        if (pageId === "home12") await hydrateHomeInsights(root);
        if (pageId === "reportgen53") await hydrateReportEvents(root);
        if (pageId === "report4.56") await hydrateRetrievedEvent(root);
        if (
          pageId === "report2.54" ||
          pageId === "report3.55" ||
          pageId === "report5.57" ||
          pageId === "report6.58" ||
          pageId === "report7.59"
        ) {
          wireSmartReport();
        }
      } catch {
        /* live data still hydrates elsewhere */
      }
    };

    const timer = window.setTimeout(() => void run(), 50);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, searchParams]);

  return null;
}
