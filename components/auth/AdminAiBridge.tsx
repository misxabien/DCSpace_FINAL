"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { patchChildren, setEventsEmptyState, setLegacyHidden } from "@/lib/legacy-dom-patch";
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
  uniqueTapIns?: number;
  venueCapacity?: number;
  occupancyPercent?: number;
  eventLocation?: string;
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
  entryRate?: string;
  exitRate?: string;
  securityRisk?: string;
  duplicateScans?: number;
  duplicateWarnings?: number;
  rapidConsecutiveScans?: number;
  concurrentEventTaps?: number;
  invalidScans?: number;
  manualOverrideCount?: number;
  securityEvents?: Array<{
    id: string;
    kind: string;
    code: string;
    message: string;
    participantName: string;
    rfidNumber: string;
    requestedAction: string;
    createdAt: string;
  }>;
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

const EVENT_INSIGHTS_CACHE_MS = 90_000;

function readCachedEventInsights(eventId: string): EventInsights | null {
  try {
    const raw = window.sessionStorage.getItem(`dc-event-insights:${eventId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; data?: EventInsights };
    if (!parsed.data || !parsed.at || Date.now() - parsed.at > EVENT_INSIGHTS_CACHE_MS) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCachedEventInsights(eventId: string, data: EventInsights) {
  try {
    window.sessionStorage.setItem(
      `dc-event-insights:${eventId}`,
      JSON.stringify({ at: Date.now(), data }),
    );
  } catch {
    /* ignore */
  }
}

function pageIdFromPath(pathname: string) {
  if (!pathname.startsWith("/admin")) return "";
  return pathname.replace(/^\/admin\/?/, "").split("/")[0] || "";
}

function riskClass(value: string) {
  const text = value.toLowerCase();
  if (text.includes("critical") || text.includes("high") || text.includes("alert")) return "bad";
  if (text.includes("moderate") || text.includes("medium") || text.includes("watch")) return "warn";
  if (text.includes("building")) return "warn";
  if (text.includes("clearing")) return "warn";
  return "good";
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

    const fill = row.querySelector<HTMLElement>(".progress-fill");
    const valueEl = row.querySelector(".metric-value, .flow-pill, .stat-value");

    if (fill) {
      fill.textContent = value;
      if (pct != null) {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        fill.style.width = `${clamped}%`;
      }
    } else if (valueEl) {
      valueEl.textContent = value;
      if (valueEl.classList.contains("flow-pill")) {
        valueEl.classList.remove("bad", "warn", "good");
        valueEl.classList.add(riskClass(value));
      }
    }
  });
}

function barPct(value: number, base: number) {
  if (base <= 0) return value > 0 ? Math.min(100, value * 10) : 0;
  return Math.max(0, Math.min(100, Math.round((value / base) * 100)));
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
  const registrations = Math.max(0, Number(data.registrations ?? 0));
  const venueCapacity = Math.max(0, Number(data.venueCapacity ?? 0));
  const currentlyInside = Math.max(0, Number(data.currentlyInside ?? 0));
  const uniqueTapIns = Math.max(0, Number(data.uniqueTapIns ?? data.tappedIn ?? 0));
  const expectedAttendees = Math.max(0, Number(data.expectedAttendees ?? 0));
  const occupancyPercent = Math.max(
    0,
    Number(data.occupancyPercent ?? barPct(currentlyInside, venueCapacity || registrations || 1)),
  );
  const actualAttendanceRate = Math.max(
    0,
    Number(data.attendanceRate ?? data.comparedToPrediction ?? 0),
  );
  const predictedAttendance = Math.max(0, Number(data.comparedToPrediction ?? actualAttendanceRate));
  const capacityBase = venueCapacity || Math.max(registrations, expectedAttendees, 1);

  setMetricRow(
    root,
    "registered participants",
    `${registrations} User${registrations === 1 ? "" : "s"}`,
    barPct(registrations, capacityBase),
  );
  setMetricRow(
    root,
    "venue capacity",
    venueCapacity > 0 ? `${venueCapacity} People` : "—",
  );
  setMetricRow(root, "capacity utilization", `${occupancyPercent}%`, occupancyPercent);
  setMetricRow(root, "capacity risk", data.capacityRisk || "Low Risk");
  setMetricRow(
    root,
    "predictive expected attendee",
    `${expectedAttendees} Attendee${expectedAttendees === 1 ? "" : "s"}`,
    barPct(expectedAttendees, capacityBase),
  );
  setMetricRow(
    root,
    "predicted attendance",
    registrations > 0 || uniqueTapIns > 0 ? `${predictedAttendance}%` : "—",
    predictedAttendance,
  );
  setMetricRow(
    root,
    "prediction confidence",
    `${data.predictionConfidence ?? 0}%`,
    data.predictionConfidence ?? 0,
  );
  setMetricRow(root, "expected attendance rate", `${data.expectedAttendanceRate}%`, data.expectedAttendanceRate);
  setMetricRow(root, "overbooking risk", data.overbookingRisk);
  setMetricRow(root, "underutilization risk", data.underutilizationRisk);
  setMetricRow(root, "attendance rate compared", `${data.comparedToPrediction}%`, data.comparedToPrediction);
  setMetricRow(root, "peak attendance", data.peakPeriod);
  setMetricRow(root, "lowest attendance", data.lowestPeriod);
  setMetricRow(root, "average attendance duration", data.avgDurationLabel);
  setMetricRow(root, "saved the event", String(data.savedInterest ?? 0));
  setMetricRow(root, "tapped in", String(uniqueTapIns));
  setMetricRow(root, "tapped out", String(data.tappedOut ?? 0));
  setMetricRow(root, "current inside", String(currentlyInside));
  setMetricRow(root, "current occupancy", String(currentlyInside));
  setMetricRow(root, "attendance rate", `${actualAttendanceRate}%`, actualAttendanceRate);
  setMetricRow(root, "crowd density", data.crowdDensity || "Low");
  setMetricRow(root, "congestion risk", data.congestionRisk || "Low");
  setMetricRow(root, "predicted peak time", data.predictedPeakTime || data.peakPeriod || "TBA");
  setMetricRow(
    root,
    "predicted peak occupancy",
    `${Math.max(0, Number(data.predictedPeakOccupancy ?? currentlyInside))} People`,
  );
  setMetricRow(root, "crowd flow", data.crowdFlow || "Stable");
  setMetricRow(root, "peak arrival", data.peakPeriod || data.predictedPeakTime || "TBA");
  setMetricRow(root, "entry rate", data.entryRate || "—");
  setMetricRow(root, "exit rate", data.exitRate || "—");
  setMetricRow(root, "flow status", data.flowStatus || "Normal Flow");
  setMetricRow(root, "duplicate scans", String(data.duplicateScans ?? 0));
  setMetricRow(root, "rapid consecutive", String(data.rapidConsecutiveScans ?? 0));
  setMetricRow(root, "invalid scans", String(data.invalidScans ?? 0));
  setMetricRow(root, "manual override", String(data.manualOverrideCount ?? 0));
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

  applySecurityEventList(root, data.securityEvents || []);

  const reco = root.querySelector(".ai-reco-box, [data-mini-body].ai-reco-box");
  if (reco && data.recommendations.length) {
    reco.textContent = data.recommendations.map((item) => `• ${item}`).join("\n");
  }
}

function formatSecurityTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function securityKindLabel(kind: string) {
  switch (String(kind || "").toLowerCase()) {
    case "duplicate_warning":
    case "duplicate_entry":
      return "Duplicate entry";
    case "rapid_consecutive":
      return "Multiple taps";
    case "concurrent_event":
      return "Attending two events";
    case "manual_override":
      return "Manual override";
    default:
      return "Invalid scan";
  }
}

function applySecurityEventList(
  root: ParentNode,
  events: NonNullable<EventInsights["securityEvents"]>,
) {
  const section =
    root.querySelector('[data-section="security"] .metric-rows') ||
    root.querySelector('[data-section="security"] .analytics-body') ||
    root.querySelector('[data-section="security"]');
  if (!section) return;

  let list = section.querySelector<HTMLElement>("#dc-security-event-list");
  if (!list) {
    list = document.createElement("div");
    list.id = "dc-security-event-list";
    list.className = "dc-security-event-list";
    list.setAttribute("aria-label", "Attendance security alerts");
    const insight = section.querySelector(".ai-conclusion");
    if (insight?.parentElement) {
      insight.parentElement.insertBefore(list, insight);
    } else {
      section.appendChild(list);
    }
  }

  if (!events.length) {
    list.innerHTML =
      '<p class="dc-security-event-empty">No scan errors recorded yet.</p>';
    return;
  }

  list.innerHTML =
    '<p class="dc-security-event-heading">Recent alerts</p><ul>' +
    events
      .map((event) => {
        const when = formatSecurityTime(event.createdAt);
        const who = event.participantName || event.rfidNumber || "Unknown";
        const label = securityKindLabel(event.kind);
        const detail = event.message || label;
        return `<li><span class="dc-security-event-time">${when}</span><span class="dc-security-event-body"><strong>${label}</strong> — ${who}<br/><span class="dc-security-event-msg">${detail}</span></span></li>`;
      })
      .join("") +
    "</ul>";
}

function unavailableInsights(): EventInsights {
  return {
    expectedAttendees: 0,
    expectedAttendanceRate: 0,
    predictionConfidence: 0,
    capacityRisk: "Pending",
    overbookingRisk: "Pending",
    underutilizationRisk: "Pending",
    capacityConclusion: "Live attendance metrics could not be loaded for this event.",
    crowdInsight: "Crowd density and congestion will appear once RFID tap records are available.",
    attendanceInsight: "Attendance flow updates from live tap-in and tap-out records.",
    securityInsight: "RFID tap records stay in MongoDB even when insights are temporarily unavailable.",
    eventSummary: "This event is loaded from the database.",
    performanceSummary: "Performance metrics will appear after attendance data is available.",
    futureRecommendations: "Keep the RFID desk open so tap-in and tap-out records can update these panels.",
    peakPeriod: "—",
    lowestPeriod: "—",
    avgDurationLabel: "—",
    comparedToPrediction: 0,
    recommendations: ["Open the RFID attendance desk to start collecting live crowd data."],
    currentlyInside: 0,
    crowdDensity: "Low",
    congestionRisk: "Low",
    crowdFlow: "Stable",
    flowStatus: "Normal Flow",
    entryRate: "—",
    exitRate: "—",
  };
}

function markEventAiLoading(root: ParentNode) {
  root.querySelectorAll(".ai-conclusion-box").forEach((box) => {
    if (!(box.textContent || "").trim() || (box.textContent || "").includes("—")) {
      box.textContent = "Loading insights…";
    }
    box.classList.add("is-loading");
  });
  const reco = root.querySelector(".ai-reco-box, [data-mini-body].ai-reco-box");
  if (reco && !(reco.textContent || "").trim()) {
    reco.textContent = "Loading recommendations…";
  }
}

async function hydrateEventPage(root: ParentNode, eventId: string, live = false) {
  const cached = live ? null : readCachedEventInsights(eventId);
  if (cached) {
    applyEventInsights(root, cached);
  } else if (!live) {
    markEventAiLoading(root);
  }

  // Live pages refresh numbers every poll; Gemini narrative reuses cacheKey when taps unchanged.
  const res = await fetch("/api/ai/event-insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ eventId, refresh: false }),
  });
  const payload = await res.json().catch(() => ({}));
  root.querySelectorAll(".ai-conclusion-box").forEach((box) => {
    box.classList.remove("is-loading");
  });
  if (!res.ok) {
    if (!cached) applyEventInsights(root, unavailableInsights());
    return;
  }
  const insights = payload as EventInsights;
  applyEventInsights(root, insights);
  writeCachedEventInsights(eventId, insights);
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

  const summary = payload.attendanceSummary as
    | {
        attendanceCompleted?: number;
        lateRecords?: number;
        undertimeRecords?: number;
        absences?: number;
        attendanceRate?: number;
      }
    | undefined;
  if (summary) {
    const summaryCard = document.getElementById("participant-attendance-summary");
    if (summaryCard) {
      const values: Record<string, number> = {
        "attendance completed": Number(summary.attendanceCompleted || 0),
        "late records": Number(summary.lateRecords || 0),
        "undertime records": Number(summary.undertimeRecords || 0),
        absences: Number(summary.absences || 0),
      };
      summaryCard.querySelectorAll(".stat-tile").forEach((tile) => {
        const label = (tile.querySelector(".stat-label")?.textContent || "")
          .trim()
          .toLowerCase();
        const valueEl = tile.querySelector(".stat-value");
        if (!valueEl) return;
        for (const [key, value] of Object.entries(values)) {
          if (label.includes(key)) {
            valueEl.textContent = String(value);
            break;
          }
        }
      });
      const rate = Math.max(0, Math.min(100, Math.round(Number(summary.attendanceRate || 0))));
      const donut = summaryCard.querySelector(".donut");
      const donutLabel = donut?.querySelector("span") || donut;
      if (donutLabel) donutLabel.textContent = `${rate}%`;
      if (donut instanceof HTMLElement) {
        donut.setAttribute("aria-label", `Attendance rate ${rate} percent`);
        donut.style.backgroundImage = `conic-gradient(#448aff 0 ${rate}%, #e8eef7 ${rate}% 100%)`;
      }
    }
  }

  const rings = card.querySelectorAll(".ring span");
  if (!res.ok && !summary) {
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

  const res = await fetch("/api/events?limit=500", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return;
  const payload = (await res.json()) as {
    events?: Array<{
      id: string;
      title: string;
      status: string;
      location?: string;
      startsAt?: string;
      endsAt?: string;
      category?: string;
      department?: string;
      organizerName?: string;
    }>;
  };

  const liveEvents = (payload.events || []).filter((event) =>
    ["completed", "live", "approved"].includes(String(event.status || "")),
  );
  const completed = liveEvents.filter((event) => event.status === "completed");
  let rows = (completed.length ? completed : liveEvents)
    .slice()
    .sort((a, b) => String(b.startsAt || "").localeCompare(String(a.startsAt || "")));

  const searchInput = root.querySelector<HTMLInputElement>(
    '.rg-search input, input[type="search"], input[placeholder*="Search"]',
  );
  const query = (searchInput?.value || "").trim().toLowerCase();
  if (query) {
    rows = rows.filter((event) => {
      const hay = [
        event.title,
        event.location,
        event.category,
        event.department,
        event.organizerName,
        event.status,
      ]
        .map((part) => String(part || "").toLowerCase())
        .join(" ");
      return hay.includes(query);
    });
  }

  const selectedIds = readJson<string[]>(REPORT_STORAGE.eventIds, []).filter((id) =>
    rows.some((event) => event.id === id),
  );

  patchChildren(list, ".rg-event", rows.slice(0, 24), (el, event, index) => {
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

  // Strip any leftover Figma placeholders that weren't part of the template pool.
  list.querySelectorAll<HTMLElement>(".rg-event").forEach((el) => {
    const title = (el.querySelector("h3")?.textContent || "").trim();
    const hasId = Boolean(el.dataset.eventId);
    if (!hasId || title === "Event Name" || title === "Event name") {
      setLegacyHidden(el, true);
    }
  });

  setEventsEmptyState(list, rows.length === 0, {
    title: "No reportable events yet.",
    text: "Completed events from MongoDB will appear here for Smart Report generation.",
  });

  if (rows[0]) {
    const nextSelected = selectedIds[0] || rows[0].id;
    writeJson(REPORT_STORAGE.eventIds, [nextSelected]);
  } else {
    writeJson(REPORT_STORAGE.eventIds, []);
  }

  if (searchInput && searchInput.dataset.dcReportSearch !== "1") {
    searchInput.dataset.dcReportSearch = "1";
    searchInput.addEventListener("input", () => {
      void hydrateReportEvents(root);
    });
  }
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

function wireReportExport() {
  document.querySelectorAll<HTMLButtonElement>(".rg-format").forEach((button) => {
    if (button.dataset.dcExportWired === "1") return;
    button.dataset.dcExportWired = "1";
    button.addEventListener("click", async () => {
      const format = String(button.dataset.format || "").toLowerCase();
      if (!format) return;

      document.querySelectorAll(".rg-format").forEach((node) => {
        node.classList.remove("selected");
        node.setAttribute("aria-pressed", "false");
      });
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");

      const draft = readJson<SmartReport | null>(REPORT_STORAGE.draft, null);
      if (!draft || !Object.values(draft).some((value) => String(value || "").trim())) {
        window.alert("Generate the Smart Report first before exporting.");
        return;
      }

      const label = button.querySelector(".label");
      const original = label?.textContent || button.textContent || "Download";
      if (label) label.textContent = "Preparing…";
      button.disabled = true;

      try {
        const stored = readJson<(SmartReport & { eventTitles?: string[] }) | null>(
          REPORT_STORAGE.draft,
          null,
        );
        const res = await fetch("/api/admin/reports/smart-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            format,
            reportType: readJson<string>(REPORT_STORAGE.reportType, "event-summary"),
            eventTitles: stored?.eventTitles || [],
            draft,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || payload.details || "Export failed.");
        }
        if (payload.downloadPath) {
          const fileRes = await fetch(String(payload.downloadPath), {
            credentials: "include",
            cache: "no-store",
          });
          if (!fileRes.ok) {
            throw new Error("Exported file could not be downloaded.");
          }
          const blob = await fileRes.blob();
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = objectUrl;
          anchor.download = String(payload.fileName || `smart-report.${format}`);
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Export failed.");
      } finally {
        button.disabled = false;
        if (label) label.textContent = original;
      }
    });
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

type StoredEventReport = {
  id?: string;
  generatedAt?: string;
  trigger?: string;
  hasPdf?: boolean;
  fileName?: string;
};

function formatReportWhen(value?: string) {
  if (!value) return "Not generated yet";
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

function applyEventReportCard(report: StoredEventReport | null, eventId: string) {
  const statusEl = document.getElementById("event-report-status");
  const triggerEl = document.getElementById("event-report-trigger");
  const download = document.getElementById("event-report-download") as HTMLAnchorElement | null;
  if (statusEl) {
    statusEl.textContent = report?.hasPdf
      ? `Ready · ${formatReportWhen(report.generatedAt)}`
      : "Not generated yet";
  }
  if (triggerEl) {
    triggerEl.textContent = report?.trigger
      ? report.trigger === "status_completed"
        ? "Auto (event completed)"
        : "Manual regenerate"
      : "—";
  }
  if (download) {
    if (report?.hasPdf && eventId) {
      download.href = `/api/admin/events/${encodeURIComponent(eventId)}/report/download`;
      download.style.pointerEvents = "";
      download.style.opacity = "1";
      download.setAttribute("download", report.fileName || "event-report.pdf");
    } else {
      download.href = "#";
      download.style.pointerEvents = "none";
      download.style.opacity = ".45";
      download.removeAttribute("download");
    }
  }
}

/** Feature #8: wire Event Report card on live16 without touching AI metric panels. */
async function wireEventReportCard(eventId: string) {
  const card = document.getElementById("event-report-card");
  if (!card || !eventId) return;

  try {
    const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/report`, {
      cache: "no-store",
      credentials: "include",
    });
    if (res.ok) {
      const payload = (await res.json()) as { report?: StoredEventReport | null };
      applyEventReportCard(payload.report || null, eventId);
    }
  } catch {
    /* keep static labels */
  }

  const generateBtn = document.getElementById("event-report-generate") as HTMLButtonElement | null;
  if (generateBtn && generateBtn.dataset.dcReportWired !== "1") {
    generateBtn.dataset.dcReportWired = "1";
    generateBtn.addEventListener("click", async () => {
      const original = generateBtn.textContent || "Generate Report";
      generateBtn.disabled = true;
      generateBtn.textContent = "Generating…";
      try {
        const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/report`, {
          method: "POST",
          credentials: "include",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || payload.details || "Failed to generate report.");
        }
        applyEventReportCard((payload.report as StoredEventReport) || null, eventId);
        if (payload.report?.hasPdf) {
          const fileName = payload.report.fileName || "event-report.pdf";
          const fileRes = await fetch(
            `/api/admin/events/${encodeURIComponent(eventId)}/report/download`,
            { credentials: "include", cache: "no-store" },
          );
          if (!fileRes.ok) {
            throw new Error("Report PDF could not be downloaded.");
          }
          const blob = await fileRes.blob();
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = objectUrl;
          anchor.download = fileName;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        }
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Failed to generate report.");
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = original;
      }
    });
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
          const insightsPromise = hydrateEventPage(root, eventId, pageId === "live16");
          if (pageId === "live16") {
            await Promise.all([insightsPromise, wireEventReportCard(eventId)]);
          } else {
            await insightsPromise;
          }
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
          pageId === "report7.59" ||
          pageId === "report8.60"
        ) {
          wireSmartReport();
          if (pageId === "report8.60") wireReportExport();
        }
      } catch {
        /* live data still hydrates elsewhere */
      }
    };

    const timer = window.setTimeout(() => void run(), 50);
    const timer2 = window.setTimeout(() => void run(), 400);
    const pollMs =
      pageId === "live16"
        ? 2500
        : pageId === "reportgen53" || EVENT_DETAIL_PAGES.has(pageId)
          ? 4000
          : 0;
    const poll = pollMs ? window.setInterval(() => void run(), pollMs) : 0;
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(timer2);
      if (poll) window.clearInterval(poll);
    };
  }, [pathname, searchParams]);

  return null;
}
