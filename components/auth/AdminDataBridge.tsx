"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  hideLegacyDemoContent,
  patchChildren,
  setCardRowEmptyState,
  setEventsEmptyState,
  ensureEventsFooterAtBottom,
  patchTableRows,
  setStatByLabel,
} from "@/lib/legacy-dom-patch";

type DashboardPayload = {
  stats: {
    totalEvents: number;
    ongoingEvents: number;
    totalUsers: number;
    certificatesGenerated: number;
    attendanceRate: number;
    feedbackReceived: number;
    pendingEvents: number;
    approvedEvents?: number;
    completedEvents?: number;
    facultyUsers: number;
    newUsers: number;
    activeUsers: number;
  };
  attention: Array<{
    title: string;
    reason: string;
    status: string;
    id: string;
    dateLabel?: string;
    location?: string;
    organizerName?: string;
  }>;
  todayEvents?: Array<{
    id: string;
    title: string;
    status: string;
    dateLabel?: string;
    location?: string;
    startsAt?: string;
    endsAt?: string;
    timeRemaining?: string;
  }>;
  events: {
    pending: Array<{
      id: string;
      title: string;
      organizerName: string;
      organizerEmail: string;
      dateLabel: string;
      status: string;
      location: string;
      startsAt: string;
    }>;
    approved: Array<{
      id: string;
      title: string;
      organizerName: string;
      reviewedByEmail: string;
      dateLabel: string;
      status: string;
      location: string;
      startsAt: string;
    }>;
  };
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    course: string;
    organizationPart: string;
    studentNumber: string;
  }>;
  activities: Array<{
    type: string;
    actorName: string;
    actorEmail: string;
    actorRole: string;
    targetTitle: string;
    organization: string;
    dateLabel: string;
  }>;
  attendance: Array<{
    participantName: string;
    eventName: string;
    time: string;
    action: string;
    status: string;
  }>;
  feedback: Array<{
    type: string;
    eventName: string;
    submittedBy: string;
    dateLabel: string;
    comment: string;
    rating?: string | number;
  }>;
};

function pageIdFromPath(pathname: string) {
  if (!pathname.startsWith("/admin")) return "";
  if (pathname === "/admin") return "selection01";
  const part = pathname.replace(/^\/admin\/?/, "").split("/")[0] || "";
  return part;
}

function activityLabel(type: string) {
  switch (type) {
    case "user_registered":
      return "Registered account";
    case "user_login":
      return "Signed in";
    case "event_submitted":
      return "Submitted event";
    case "event_approved":
      return "Event approved";
    case "event_rejected":
      return "Event rejected";
    case "attendance_recorded":
      return "Attendance recorded";
    case "feedback_submitted":
      return "Submitted feedback";
    case "certificate_generated":
      return "Certificate generated";
    default:
      return type.replace(/_/g, " ");
  }
}

function rolePillClass(role: string) {
  const r = role.toLowerCase();
  if (r.includes("super")) return "super-admin";
  if (r.includes("admin")) return "admin";
  if (r.includes("organizer") || r.includes("faculty")) return "organizer";
  return "student";
}

function hydrateHome(root: Element, data: DashboardPayload) {
  setStatByLabel(root, "Total Events", data.stats.totalEvents);
  setStatByLabel(root, "Ongoing Events", data.stats.ongoingEvents);
  setStatByLabel(root, "Total Users", data.stats.totalUsers);
  setStatByLabel(root, "Certificates Generated", data.stats.certificatesGenerated);
  setStatByLabel(root, "Attendance Rate", `${data.stats.attendanceRate}%`);
  setStatByLabel(root, "Feedback Received", data.stats.feedbackReceived);

  const cardRows = Array.from(root.querySelectorAll(".card-row"));
  const attentionRow = cardRows[0] || null;
  const todayRow = cardRows[1] || null;

  const openEvent = (id: string, status: string) => {
    window.location.href = `/admin/edetails14?id=${encodeURIComponent(id)}&status=${encodeURIComponent(
      status === "pending" ? "validated" : status,
    )}`;
  };

  patchChildren(attentionRow, "article.event-card", data.attention.slice(0, 3), (card, item) => {
    const title = card.querySelector("h4");
    const label = card.querySelector(".meta-label");
    const value = card.querySelector(".meta-value");
    if (title) title.textContent = item.title;
    if (label) label.textContent = "Reason";
    if (value) value.textContent = item.reason;
    card.setAttribute("data-event-id", item.id);
    card.style.cursor = "pointer";
    card.onclick = () => openEvent(item.id, item.status);
  });
  setCardRowEmptyState(attentionRow, data.attention.length === 0, {
    title: "No events requiring attention.",
    text: "Pending, postponed, or rejected events will appear here when they need review.",
  });

  const todayEvents = data.todayEvents || [];
  patchChildren(todayRow, "article.event-card", todayEvents.slice(0, 3), (card, item) => {
    const title = card.querySelector("h4");
    const label = card.querySelector(".meta-label");
    const value = card.querySelector(".meta-value");
    if (title) title.textContent = item.title;
    if (label) label.textContent = "Time Remaining";
    if (value) value.textContent = item.timeRemaining || "Schedule TBA";
    card.setAttribute("data-event-id", item.id);
    card.style.cursor = "pointer";
    card.onclick = () => openEvent(item.id, item.status);
  });
  setCardRowEmptyState(todayRow, todayEvents.length === 0, {
    title: "No events scheduled for today.",
    text: "Approved and live events happening today will appear here.",
  });

  const patchEventTable = (
    panel: string,
    rows: Array<{
      id: string;
      title: string;
      organizerName: string;
      organizerEmail?: string;
      reviewedByEmail?: string;
      dateLabel: string;
      status: string;
    }>,
    mode: "submitted" | "approved",
  ) => {
    const table = root.querySelector(`[data-panel="${panel}"] table`);
    patchTableRows(table, rows, (tr, row) => {
      const cells = tr.querySelectorAll("td");
      const who =
        mode === "submitted"
          ? row.organizerName || row.organizerEmail || "—"
          : ("reviewedByEmail" in row && row.reviewedByEmail) || "Admin";
      if (cells[1]) cells[1].textContent = row.title;
      if (cells[2]) cells[2].textContent = row.organizerName || "—";
      if (cells[3]) cells[3].textContent = who;
      if (cells[4]) cells[4].textContent = row.dateLabel;
      if (cells[5]) cells[5].textContent = row.status.toUpperCase();
      const link = tr.querySelector<HTMLAnchorElement>("a.view-btn");
      if (link && row.id) {
        link.href = `/admin/edetails14?id=${encodeURIComponent(row.id)}&status=${encodeURIComponent(
          row.status === "pending" ? "validated" : row.status,
        )}`;
      }
    });
  };

  patchEventTable("submitted", data.events.pending, "submitted");
  patchEventTable("approved", data.events.approved, "approved");

  const submittedPanel = root.querySelector('[data-panel="submitted"]');
  const approvedPanel = root.querySelector('[data-panel="approved"]');
  setCardRowEmptyState(
    submittedPanel?.querySelector(".table-wrap") || submittedPanel,
    data.events.pending.length === 0,
    {
      title: "No newly submitted events.",
      text: "Organizer submissions will appear in this table.",
    },
  );
  setCardRowEmptyState(
    approvedPanel?.querySelector(".table-wrap") || approvedPanel,
    data.events.approved.length === 0,
    {
      title: "No newly approved events.",
      text: "Recently approved events will appear in this table.",
    },
  );

  patchTableRows(root.querySelector('[data-panel="attendance"] table'), data.attendance, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = row.participantName;
    if (cells[2]) cells[2].textContent = row.eventName;
    if (cells[3]) cells[3].textContent = row.time;
    if (cells[4]) cells[4].textContent = row.action;
    if (cells[5]) cells[5].textContent = row.status;
  });

  patchTableRows(root.querySelector("#feedback-table"), data.feedback, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = row.type;
    if (cells[2]) cells[2].textContent = row.eventName;
    if (cells[3]) cells[3].textContent = row.submittedBy;
    if (cells[4]) cells[4].textContent = row.dateLabel;
  });
}

function hydrateUsers(root: Element, data: DashboardPayload) {
  setStatByLabel(root, "Total Users", data.stats.totalUsers);
  setStatByLabel(root, "Active Users", data.stats.activeUsers);
  setStatByLabel(root, "New Users", data.stats.newUsers);
  setStatByLabel(root, "Total Faculty Users", data.stats.facultyUsers);

  const activityByEmail = new Map(
    data.activities.map((row) => [row.actorEmail.toLowerCase(), row]),
  );
  const rows =
    data.users.length > 0
      ? data.users.map((user) => {
          const activity = activityByEmail.get(user.email.toLowerCase());
          return {
            id: user.id,
            actorName: user.fullName,
            actorEmail: user.email,
            actorRole: user.role,
            type: activity?.type || "user_registered",
            dateLabel: activity?.dateLabel || "—",
          };
        })
      : data.activities.map((row) => ({
          id: "",
          actorName: row.actorName,
          actorEmail: row.actorEmail,
          actorRole: row.actorRole,
          type: row.type,
          dateLabel: row.dateLabel,
        }));

  const table = root.querySelector(".users-table-panel table, .panel-box table");
  patchTableRows(table, rows.slice(0, 40), (tr, row) => {
    if (row.id) tr.setAttribute("data-user-id", row.id);
    const cells = tr.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = row.actorName || row.actorEmail;
    if (cells[2]) cells[2].textContent = activityLabel(row.type);
    const roleCell = cells[3];
    if (roleCell) {
      const pill = roleCell.querySelector(".role-pill");
      const label = (row.actorRole || "student").toUpperCase();
      if (pill) {
        pill.textContent = label;
        pill.className = `role-pill ${rolePillClass(row.actorRole || "student")}`;
      } else {
        roleCell.textContent = label;
      }
    }
    if (cells[4]) cells[4].textContent = row.dateLabel;
    const view = tr.querySelector<HTMLElement>(".view-btn");
    if (view && row.id) {
      view.setAttribute("data-user-id", row.id);
      if (view instanceof HTMLAnchorElement) {
        view.href = `/admin/info30?id=${encodeURIComponent(row.id)}`;
      }
    }
  });
}

function hydrateEvents(
  root: Element,
  data: DashboardPayload,
  pageId: string,
  /** null = /api/events fetch failed; array (incl. empty) = live Mongo list */
  liveEvents: Array<{
    id: string;
    title: string;
    status: string;
    location?: string;
    dateLabel?: string;
    startsAt?: string;
  }> | null = null,
) {
  type ListEvent = {
    id: string;
    title: string;
    organizerName?: string;
    dateLabel: string;
    status: string;
    location: string;
    startsAt?: string;
  };

  const emptyByTab = {
    pending: {
      title: "No events pending approval.",
      text: "When organizers submit events for review, they will appear here for validation.",
    },
    approved: {
      title: "No approved events yet.",
      text: "Events you approve will show up in this list for scheduling and follow-up.",
    },
    approvedByYou: {
      title: "You haven't approved any events yet.",
      text: "Events you personally approve will appear in this section.",
    },
    ongoing: {
      title: "No ongoing events right now.",
      text: "Live events currently in progress will appear here.",
    },
    completed: {
      title: "No completed events yet.",
      text: "Finished events will appear here once they are marked complete.",
    },
    rejected: {
      title: "No rejected events.",
      text: "Events that are rejected during review will appear in this list.",
    },
    postponed: {
      title: "No postponed events.",
      text: "Events that have been postponed will appear in this list.",
    },
    cancelled: {
      title: "No cancelled events.",
      text: "Events that have been cancelled will appear in this list.",
    },
  };

  const fillList = (
    listId: string,
    events: ListEvent[],
    hrefFor: (event: ListEvent) => string,
    copy: { title: string; text: string },
  ) => {
    const list = root.querySelector(`#${listId}`);
    if (!list) return;
    patchChildren(list, "a.event-item", events, (el, event) => {
      const link = el as HTMLAnchorElement;
      link.href = hrefFor(event);
      const title = el.querySelector("h3");
      const paragraphs = el.querySelectorAll("p");
      if (title) title.textContent = event.title;
      if (paragraphs[0]) {
        paragraphs[0].textContent = event.dateLabel || event.startsAt || "Date TBA";
      }
      if (paragraphs[1]) paragraphs[1].textContent = event.location || "Venue TBA";
    });
    setEventsEmptyState(list, events.length === 0, copy);
    ensureEventsFooterAtBottom(list);
  };

  const fillPanel = (
    panel: Element | null,
    events: ListEvent[],
    detailPath: string,
    copy: { title: string; text: string },
  ) => {
    if (!panel) return;
    patchChildren(panel, "a.event-item", events, (el, event) => {
      const link = el as HTMLAnchorElement;
      link.href = `${detailPath}?id=${encodeURIComponent(event.id)}&status=${encodeURIComponent(event.status)}`;
      const title = el.querySelector("h3");
      const paragraphs = el.querySelectorAll("p");
      if (title) title.textContent = event.title;
      if (paragraphs[0]) paragraphs[0].textContent = event.dateLabel || "Date TBA";
      if (paragraphs[1]) paragraphs[1].textContent = event.location || "Venue TBA";
    });
    setEventsEmptyState(panel, events.length === 0, copy);
    ensureEventsFooterAtBottom(panel);
  };

  const mapped =
    liveEvents?.map((event) => ({
      id: event.id,
      title: event.title,
      dateLabel: event.dateLabel || event.startsAt || "Date TBA",
      status: event.status,
      location: event.location || "Venue TBA",
      startsAt: event.startsAt,
    })) || [];

  // When /api/events succeeded, use that list even if a status bucket is empty
  // (do not fall back to dashboard demo rows). Dashboard only used if fetch failed.
  const pendingEvents =
    liveEvents !== null
      ? mapped.filter((event) => event.status === "pending")
      : data.events.pending;
  const APPROVED_STATUSES = ["approved", "live", "completed"];
  const approvedEvents =
    liveEvents !== null
      ? mapped.filter((event) => APPROVED_STATUSES.includes(event.status))
      : data.events.approved.filter((event) => APPROVED_STATUSES.includes(event.status));

  fillList(
    "pending-list",
    pendingEvents,
    (event) => `/admin/edetails14?id=${encodeURIComponent(event.id)}&status=validated`,
    emptyByTab.pending,
  );
  fillList(
    "approved-list",
    approvedEvents,
    (event) =>
      `/admin/aed15?id=${encodeURIComponent(event.id)}&status=${encodeURIComponent(event.status)}`,
    emptyByTab.approved,
  );

  // Differentiate empty copy under "Approved Events" vs "Approved Events By You".
  const approvedList = root.querySelector("#approved-list");
  if (approvedList) {
    approvedList.querySelectorAll<HTMLElement>(".events-panel").forEach((panel) => {
      const heading =
        panel
          .closest(".events-block")
          ?.previousElementSibling?.querySelector(".heading-text")
          ?.textContent?.trim()
          .toLowerCase() || "";
      const copy = heading.includes("by you") ? emptyByTab.approvedByYou : emptyByTab.approved;
      setEventsEmptyState(panel, approvedEvents.length === 0, copy);
    });
  }

  // Pending / Approved list toggle is only for event13 — never overwrite
  // Ongoing / Completed / Inactive tab selection on other category pages.
  if (pageId === "event13") {
    try {
      const tab = new URLSearchParams(window.location.search).get("tab");
      const approvedHost = root.querySelector<HTMLElement>("#approved-list");
      const pendingHost = root.querySelector<HTMLElement>("#pending-list");
      const showApproved = tab === "approved";
      if (approvedHost) approvedHost.hidden = !showApproved;
      if (pendingHost) pendingHost.hidden = showApproved;

      root
        .querySelectorAll<HTMLElement>(".event-tabs [data-status], [data-events-tab]")
        .forEach((btn) => {
          const key =
            btn.getAttribute("data-status") ||
            btn.getAttribute("data-events-tab") ||
            "";
          const active = showApproved ? key === "approved" : key === "pending";
          btn.classList.toggle("active", active);
          btn.classList.toggle("is-active", active);
          btn.setAttribute("aria-selected", active ? "true" : "false");
        });

      const subtitle = document.getElementById("page-subtitle");
      if (subtitle) {
        subtitle.hidden = false;
        subtitle.textContent = showApproved ? "Approved Events" : "Pending Approval";
      }
    } catch {
      /* ignore */
    }
  }

  const panels = Array.from(root.querySelectorAll(".events-panel"));

  if (pageId === "complete18") {
    fillPanel(
      panels[0] || null,
      mapped.filter((event) => event.status === "completed"),
      "/admin/cc19",
      emptyByTab.completed,
    );
  }
  if (pageId === "ongoing16") {
    fillPanel(
      panels[0] || null,
      mapped.filter((event) => event.status === "live"),
      "/admin/live16",
      emptyByTab.ongoing,
    );
  }
  if (pageId === "inactive20") {
    fillPanel(
      panels[0] || null,
      mapped.filter((event) => event.status === "rejected"),
      "/admin/rejected21",
      emptyByTab.rejected,
    );
    fillPanel(
      panels[1] || null,
      mapped.filter((event) => event.status === "postponed"),
      "/admin/postponed22",
      emptyByTab.postponed,
    );
    fillPanel(
      panels[2] || null,
      mapped.filter((event) => event.status === "cancelled"),
      "/admin/c23",
      emptyByTab.cancelled,
    );
  }
}

function setFbStat(root: ParentNode, label: string, value: string | number) {
  root.querySelectorAll(".fb-stat").forEach((card) => {
    const head = card.querySelector(".fb-stat-head span, .fb-stat-head");
    if (!head) return;
    if (!(head.textContent || "").toLowerCase().includes(label.toLowerCase())) return;
    const valueEl = card.querySelector(".fb-stat-body .value, .value");
    if (valueEl) valueEl.textContent = String(value);
  });
}

function hydrateAttendance(root: Element, data: DashboardPayload) {
  type AttEvent = {
    id: string;
    title: string;
    status: string;
    dateLabel?: string;
    location?: string;
    organizerName?: string;
  };

  const liveEvents: AttEvent[] = [
    ...data.events.approved.filter((e) => e.status === "live" || e.status === "approved"),
    ...data.attention,
  ];
  const cards: AttEvent[] = liveEvents.length ? liveEvents : data.events.pending;
  root.querySelectorAll(".att-event-list").forEach((list) => {
    patchChildren(list, "a.att-event-card", cards.slice(0, 8), (el, event) => {
      const link = el as HTMLAnchorElement;
      link.href = `/admin/deets43?id=${encodeURIComponent(event.id)}&status=${encodeURIComponent(event.status)}`;
      const title = el.querySelector("h3");
      const pill = el.querySelector(".att-org-pill");
      const metas = el.querySelectorAll(".att-event-meta span");
      const status = el.querySelector(".att-status");
      if (title) title.textContent = event.title;
      if (pill) {
        pill.textContent =
          ("organizerName" in event && event.organizerName) || "Organization";
      }
      if (metas[0]) {
        metas[0].textContent =
          ("dateLabel" in event && event.dateLabel) || "Schedule TBA";
      }
      if (metas[1]) {
        metas[1].textContent =
          ("location" in event && event.location) || "Venue TBA";
      }
      if (status) status.textContent = event.status;
    });
  });
}

function renderStarRating(root: ParentNode, rating: number) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  root.querySelectorAll(".stars svg").forEach((svg, index) => {
    svg.setAttribute("fill", index < filled ? "#FFC107" : "none");
    svg.setAttribute("stroke", index < filled ? "#FFC107" : "currentColor");
  });
  const score = root.querySelector(".score");
  if (score) score.textContent = `${rating > 0 ? rating.toFixed(1) : "0"}/5`;
}

function renderFeedbackProgress(root: ParentNode, progress: number) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const pctEl = root.querySelector(".pct");
  if (pctEl) pctEl.textContent = `${pct}%`;
  const bars = root.querySelector(".fb-bars");
  if (!bars) return;
  const filled = Math.max(0, Math.min(10, Math.round((pct / 100) * 10)));
  bars.querySelectorAll("span").forEach((span, index) => {
    span.classList.toggle("dim", index >= filled);
  });
}

function applyFeedbackEventCard(card: Element, event: {
  eventId: string;
  title: string;
  responses: number;
  target: number;
  avgRating: number;
  progress: number;
  collectionStatus: "collecting" | "analysis_done" | "pending";
}) {
  const link = card as HTMLAnchorElement;
  link.href = `/admin/fcollection48?eventId=${encodeURIComponent(event.eventId)}`;

  const badge = card.querySelector(".fb-badge");
  if (badge) {
    const isDone = event.collectionStatus === "analysis_done";
    badge.innerHTML = isDone
      ? '<span class="dot done"></span>Analysis Done'
      : event.collectionStatus === "collecting"
        ? '<span class="dot collecting"></span>Collecting Feedback'
        : '<span class="dot collecting"></span>Pending Feedback';
    card.classList.toggle("gold", isDone);
  }

  const title = card.querySelector("h3");
  if (title) title.textContent = event.title;

  const responses = card.querySelector(".v");
  if (responses) {
    responses.textContent =
      event.target > 0 ? `${event.responses}/${event.target}` : String(event.responses);
  }

  const starsWrap = card.querySelector(".fb-stars");
  if (starsWrap) renderStarRating(starsWrap, event.avgRating);
  renderFeedbackProgress(card, event.progress);
}

function hydrateFeedbackCategoryRatings(
  root: Element,
  categories: Array<{ label: string; subtitle: string; avgRating: number }>,
) {
  const rows = Array.from(root.querySelectorAll(".fb-rate-row"));
  rows.forEach((row, index) => {
    const category = categories[index];
    if (!category) {
      (row as HTMLElement).style.display = "none";
      return;
    }
    (row as HTMLElement).style.display = "";
    const label = row.querySelector("h4");
    const subtitle = row.querySelector("p");
    if (label) label.textContent = category.label;
    if (subtitle) subtitle.textContent = category.subtitle;
    const right = row.querySelector(".right");
    if (right) renderStarRating(right, category.avgRating);
  });
}

function hydrateFeedbackEventCards(
  root: Element,
  events: Array<{
    eventId: string;
    title: string;
    responses: number;
    target: number;
    avgRating: number;
    progress: number;
    collectionStatus: "collecting" | "analysis_done" | "pending";
  }>,
) {
  root.querySelectorAll(".fb-status-grid").forEach((grid) => {
    const template = grid.querySelector(".fb-card");
    if (!template) return;
    grid.querySelectorAll(".fb-card").forEach((card) => card.remove());

    if (!events.length) {
      const empty = template.cloneNode(true) as HTMLElement;
      empty.removeAttribute("href");
      const title = empty.querySelector("h3");
      if (title) title.textContent = "No feedback collected yet";
      const responses = empty.querySelector(".v");
      if (responses) responses.textContent = "0";
      const badge = empty.querySelector(".fb-badge");
      if (badge) badge.innerHTML = '<span class="dot collecting"></span>Waiting for responses';
      renderStarRating(empty, 0);
      renderFeedbackProgress(empty, 0);
      grid.appendChild(empty);
      return;
    }

    for (const event of events.slice(0, 6)) {
      const card = template.cloneNode(true) as HTMLElement;
      applyFeedbackEventCard(card, event);
      grid.appendChild(card);
    }
  });
}

type FeedbackAnalyticsPayload = {
  totalResponses: number;
  avgRating: number;
  responseRate: number;
  categories: Array<{ label: string; subtitle: string; avgRating: number; count: number }>;
  events: Array<{
    eventId: string;
    title: string;
    status: string;
    responses: number;
    target: number;
    avgRating: number;
    progress: number;
    collectionStatus: "collecting" | "analysis_done" | "pending";
  }>;
  recent: Array<{
    id: string;
    type: string;
    eventId: string;
    eventName: string;
    submittedBy: string;
    dateLabel: string;
    rating: number;
    comment: string;
  }>;
};

function hydrateFeedbackAdmin(root: Element, analytics: FeedbackAnalyticsPayload) {
  setFbStat(root, "Total Feedback", analytics.totalResponses);
  setFbStat(root, "Feedback Responses", analytics.totalResponses);
  setFbStat(
    root,
    "Satisfaction",
    analytics.avgRating > 0 ? `${analytics.avgRating.toFixed(1)}/5` : "—",
  );
  setFbStat(root, "Response Rate", `${analytics.responseRate}%`);

  hydrateFeedbackCategoryRatings(root, analytics.categories);
  hydrateFeedbackEventCards(root, analytics.events);

  const table = root.querySelector(".fd-table, .fb-table, table");
  patchTableRows(table, analytics.recent, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[0]) cells[0].textContent = row.submittedBy;
    if (cells[1]) cells[1].textContent = row.type;
    if (cells[2]) cells[2].textContent = row.dateLabel;
    if (cells[3]) cells[3].textContent = row.eventName || "—";
    if (cells[4]) cells[4].textContent = row.comment || "—";
    tr.setAttribute("data-feedback-id", row.id);
  });
}

async function fetchFeedbackAnalytics(filters?: {
  period?: string;
  date?: string;
  organization?: string;
  course?: string;
}) {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("eventId");
  const query = new URLSearchParams();
  if (eventId) query.set("eventId", eventId);
  if (filters?.period) query.set("period", filters.period);
  if (filters?.date) query.set("date", filters.date);
  if (filters?.organization) query.set("organization", filters.organization);
  if (filters?.course) query.set("course", filters.course);
  const qs = query.toString();
  const url = qs ? `/api/admin/feedback?${qs}` : "/api/admin/feedback";
  const res = await fetch(url, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return null;
  return (await res.json()) as FeedbackAnalyticsPayload;
}

const feedbackFilterState = {
  period: "all",
  date: "",
  organization: "",
  course: "",
};

function periodFromLabel(label: string) {
  const text = label.trim().toLowerCase();
  if (text === "today") return "today";
  if (text === "this week") return "week";
  if (text === "this month") return "month";
  if (text === "this year") return "year";
  return "all";
}

function wireFeedbackFilters(root: Element, reload: () => void) {
  root.querySelectorAll(".period-bar button").forEach((button) => {
    if (!(button instanceof HTMLButtonElement) || button.dataset.dcFbWired === "1") return;
    button.dataset.dcFbWired = "1";
    button.addEventListener("click", () => {
      root.querySelectorAll(".period-bar button").forEach((node) => {
        node.classList.remove("active");
      });
      button.classList.add("active");
      feedbackFilterState.period = periodFromLabel(button.textContent || "");
      feedbackFilterState.date = "";
      reload();
    });
  });

  const host = root instanceof HTMLElement ? root : null;
  if (host && host.dataset.dcFbFilterListener !== "1") {
    host.dataset.dcFbFilterListener = "1";
    window.addEventListener("dc-admin-filter-change", (event) => {
      const detail = (event as CustomEvent<{
        prefix?: string;
        organization?: string;
        course?: string;
        date?: string;
      }>).detail;
      if (detail?.prefix !== "fb47") return;
      feedbackFilterState.organization = detail.organization || "";
      feedbackFilterState.course = detail.course || "";
      feedbackFilterState.date = detail.date || "";
      if (detail.date) feedbackFilterState.period = "all";
      reload();
    });
  }
}

type CertBoardEvent = {
  id: string;
  title: string;
  status: string;
  tapIn: number;
  tapOut: number;
  uniqueIn: number;
  qualified: number;
  registrations: number;
  certCount: number;
};

function certWorkflow(event: CertBoardEvent) {
  const target = Math.max(event.qualified, event.uniqueIn, event.registrations, 1);
  const completion = Math.min(100, Math.round((event.certCount / target) * 100));
  const remaining = Math.max(0, target - event.certCount);
  const validated = event.tapOut > 0 || event.qualified > 0;
  const attendanceLabel = validated ? "VALIDATED" : event.tapIn > 0 ? "IN PROGRESS" : "PENDING";
  const generationLabel = event.certCount > 0 ? "GENERATED" : event.tapIn > 0 ? "QUEUED" : "PENDING";
  const distributionLabel = event.certCount > 0 ? "ISSUED" : "PENDING";
  return {
    completion,
    remaining,
    attendanceLabel,
    generationLabel,
    distributionLabel,
    progress: Math.min(100, Math.round(((event.tapIn > 0 ? 35 : 0) + (validated ? 30 : 0) + completion * 0.35))),
  };
}

async function hydrateCertificatesAdmin(root: Element, data: DashboardPayload) {
  let events: Array<{
    id: string;
    title: string;
    status: string;
    hasCertificateTemplate?: boolean;
    location?: string;
    dateLabel?: string;
    startsAt?: string;
    endsAt?: string;
    attendanceRequiredMinutes?: number;
    attachments?: { certificateTemplate?: string };
  }> = [];
  let certificates: Array<{ eventId?: string; eventName?: string; status?: string }> = [];
  let attendance: Array<{
    eventId?: string;
    eventTitle?: string;
    action?: string;
    email?: string;
    qualifiedForCertificate?: boolean;
  }> = [];

  try {
    const [eventsRes, certsRes, attendRes] = await Promise.all([
      fetch("/api/events?limit=500", { cache: "no-store", credentials: "include" }),
      fetch("/api/user/certificates", { cache: "no-store", credentials: "include" }),
      fetch("/api/user/attendance", { cache: "no-store", credentials: "include" }),
    ]);
    if (eventsRes.ok) {
      events = ((await eventsRes.json()) as { events?: typeof events }).events || [];
    }
    if (certsRes.ok) {
      certificates =
        ((await certsRes.json()) as { certificates?: typeof certificates }).certificates || [];
    }
    if (attendRes.ok) {
      attendance =
        ((await attendRes.json()) as { attendance?: typeof attendance }).attendance || [];
    }
  } catch {
    /* dashboard stats still apply */
  }

  const pipelineEvents = events.filter(
    (event) =>
      Boolean(event.hasCertificateTemplate) &&
      ["live", "completed", "approved"].includes(event.status),
  );

  const byEvent = new Map<string, CertBoardEvent>();
  const ensure = (id: string, title: string, status = "") => {
    const existing = byEvent.get(id);
    if (existing) return existing;
    const row: CertBoardEvent = {
      id,
      title: title || "Event",
      status,
      tapIn: 0,
      tapOut: 0,
      uniqueIn: 0,
      qualified: 0,
      registrations: 0,
      certCount: 0,
    };
    byEvent.set(id, row);
    return row;
  };

  pipelineEvents.forEach((event) => ensure(event.id, event.title, event.status));

  const uniqueIn = new Map<string, Set<string>>();
  for (const row of attendance) {
    const eventId = String(row.eventId || "");
    if (!eventId) continue;
    const bucket = ensure(eventId, String(row.eventTitle || ""), "");
    if (String(row.action || "in") === "in") {
      bucket.tapIn += 1;
      const emails = uniqueIn.get(eventId) || new Set<string>();
      const email = String(row.email || "").toLowerCase();
      if (email) emails.add(email);
      uniqueIn.set(eventId, emails);
    }
    if (String(row.action) === "out") bucket.tapOut += 1;
    if (row.qualifiedForCertificate) bucket.qualified += 1;
  }
  uniqueIn.forEach((emails, eventId) => {
    const bucket = byEvent.get(eventId);
    if (bucket) bucket.uniqueIn = emails.size;
  });

  for (const cert of certificates) {
    const eventId = String(cert.eventId || "");
    if (!eventId) continue;
    ensure(eventId, String(cert.eventName || "")).certCount += 1;
  }

  const all = [...byEvent.values()].filter((event) =>
    pipelineEvents.some((row) => row.id === event.id) || event.certCount > 0 || event.tapIn > 0,
  );

  const needingAttention = all.filter((event) => {
    const workflow = certWorkflow(event);
    return (
      (event.status === "live" || event.status === "completed" || event.tapIn > 0) &&
      (workflow.attendanceLabel !== "VALIDATED" || event.certCount === 0)
    );
  });
  const processing = all.filter((event) => event.tapIn > 0 && event.certCount === 0);
  const workflowRows = all.filter((event) => event.certCount > 0 || event.status === "completed" || event.tapIn > 0);

  const boards = Array.from(root.querySelectorAll(".cert-board"));
  const fillBoard = (
    board: Element | undefined,
    rows: CertBoardEvent[],
    kind: "attention" | "timeline" | "workflow",
    empty: { title: string; text: string },
  ) => {
    if (!board) return;
    const body = board.querySelector(".cert-board-body") || board;
    patchChildren(body, "a.cert-card", rows.slice(0, 8), (el, event) => {
      const link = el as HTMLAnchorElement;
      link.href = `/admin/certdeets46?id=${encodeURIComponent(event.id)}`;
      const title = el.querySelector("h3");
      if (title) title.textContent = event.title;
      const workflow = certWorkflow(event);

      if (kind === "attention") {
        const values = el.querySelectorAll(".v");
        if (values[0]) {
          values[0].textContent =
            workflow.attendanceLabel !== "VALIDATED"
              ? "Attendance validation incomplete"
              : event.certCount === 0
                ? "Certificates not generated yet"
                : "Needs review";
          values[0].classList.add("danger");
        }
        if (values[1]) {
          values[1].textContent =
            workflow.attendanceLabel !== "VALIDATED"
              ? "Review attendance records"
              : "Generate certificates";
        }
      }

      if (kind === "timeline") {
        const num = el.querySelector(".timeline-num");
        const top = el.querySelector(".tl-top");
        const bot = el.querySelector(".tl-bot");
        const pct = el.querySelector(".pct");
        if (num) num.textContent = event.certCount > 0 ? "3" : workflow.attendanceLabel === "VALIDATED" ? "2" : "1";
        if (top) {
          top.textContent =
            event.certCount > 0
              ? "Certificates"
              : workflow.attendanceLabel === "VALIDATED"
                ? "Certificate Generation"
                : "Attendance Records";
        }
        if (bot) {
          bot.textContent =
            event.certCount > 0 ? "Issued" : workflow.attendanceLabel === "VALIDATED" ? "Queued" : "Finalizing";
        }
        if (pct) pct.textContent = `${workflow.progress}%`;
        const bars = el.querySelectorAll(".bar-row span");
        const filled = Math.round((workflow.progress / 100) * bars.length);
        bars.forEach((bar, index) => {
          bar.classList.toggle("dim", index >= filled);
        });
      }

      if (kind === "workflow") {
        const values = el.querySelectorAll(".v");
        if (values[0]) values[0].textContent = `${workflow.completion}%`;
        if (values[1]) {
          values[1].textContent =
            workflow.remaining > 0
              ? `Issue ${workflow.remaining} remaining certificate${workflow.remaining === 1 ? "" : "s"}`
              : "All issued certificates are up to date";
          values[1].classList.toggle("warn", workflow.remaining > 0);
        }
      }
    });
    setEventsEmptyState(body, rows.length === 0, empty);
  };

  fillBoard(boards[0], needingAttention, "attention", {
    title: "No events needing certificate attention.",
    text: "Live and completed events with incomplete attendance or missing certificates will appear here.",
  });
  fillBoard(boards[1], processing.length ? processing : all.filter((event) => event.tapIn > 0), "timeline", {
    title: "No certificate processing in progress.",
    text: "Events with recorded taps will show generation progress here in real time.",
  });
  fillBoard(boards[2], workflowRows, "workflow", {
    title: "No certificate workflow yet.",
    text: "When attendance qualifies, completion progress will appear here from the database.",
  });

  const generated = certificates.length;
  const eventsWithCerts = new Set(certificates.map((row) => String(row.eventId || "")).filter(Boolean)).size;
  const queued = processing.length;
  const reviews = needingAttention.length;

  setStatByLabel(root, "Generated Certificates", generated || data.stats.certificatesGenerated);
  setStatByLabel(root, "Certificates Currently Generating", queued);
  setStatByLabel(root, "Events with Certificates", eventsWithCerts);
  setStatByLabel(root, "Manual Eligibility Reviews", reviews);

  const tableRows = (all.length ? all : pipelineEvents.map((event) => ensure(event.id, event.title, event.status))).slice(
    0,
    20,
  );
  patchTableRows(root.querySelector(".cert-table"), tableRows, (tr, event) => {
    const workflow = certWorkflow(event);
    const cells = tr.querySelectorAll("td");
    if (cells[0]) cells[0].textContent = event.title;
    if (cells[1]) cells[1].textContent = workflow.attendanceLabel;
    if (cells[2]) cells[2].textContent = workflow.generationLabel;
    if (cells[3]) cells[3].textContent = workflow.distributionLabel;
    const actionCell = cells[4] || tr.querySelector("td:last-child");
    if (actionCell) {
      actionCell.innerHTML = "";
      const view = document.createElement("a");
      view.className = "cert-view";
      view.href = `/admin/fulld46?id=${encodeURIComponent(event.id)}`;
      view.textContent = "View";
      actionCell.appendChild(view);

      if (event.certCount === 0 || workflow.generationLabel !== "DONE") {
        const gen = document.createElement("button");
        gen.type = "button";
        gen.className = "cert-generate-btn";
        gen.setAttribute("data-event-id", event.id);
        gen.textContent = "Generate";
        gen.style.marginLeft = "8px";
        actionCell.appendChild(gen);
      }
    }
  });

  const entries = root.querySelector(".cert-entries");
  if (entries) {
    entries.textContent = `${tableRows.length} out of ${all.length || tableRows.length} entries`;
  }
}

function initialsFromName(name: string) {
  const parts = String(name || "Admin")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "AD";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function formatReportDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function groupReportsByTime<T extends { generatedAt: string }>(reports: T[]) {
  const groups = new Map<string, T[]>();
  for (const report of reports) {
    const date = new Date(report.generatedAt);
    const label = Number.isNaN(date.getTime())
      ? "Recent"
      : date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
    const bucket = groups.get(label) || [];
    bucket.push(report);
    groups.set(label, bucket);
  }
  return [...groups.entries()];
}

function ensureUsersReportCategory(root: Element) {
  const cats = root.querySelector(".rp-cats");
  if (!cats || cats.querySelector('[href*="type=users"]')) return;

  const template = cats.querySelector(".rp-cat");
  if (!template) return;

  const card = template.cloneNode(true) as HTMLAnchorElement;
  card.href = "/admin/reportlist52?type=users";
  const label = card.querySelector("span");
  if (label) label.textContent = "User Directory";
  cats.appendChild(card);
}

function blankReportHubPlaceholders(root: Element) {
  root.querySelectorAll(".rp-stat").forEach((card) => {
    const valueEl = card.querySelector<HTMLElement>(".value, .name");
    if (valueEl) valueEl.textContent = "—";
  });
}

function hydrateReportsAdmin(
  root: Element,
  reportsPayload: {
    stats: {
      totalReportsGenerated: number;
      thisMonth: number;
      lastGenerated: string;
      mostDownloaded: string;
    };
    reports: Array<{
      id?: string;
      name: string;
      type: string;
      generatedBy: string;
      date: string;
      format: string;
      value?: number;
      downloadPath?: string;
    }>;
  },
) {
  const stats = reportsPayload.stats;
  setStatByLabel(root, "Total Reports Generated", stats?.totalReportsGenerated ?? 0);
  setStatByLabel(root, "Reports Generated This Month", stats?.thisMonth ?? 0);
  setStatByLabel(root, "Last Generated Report", stats?.lastGenerated || "—");
  setStatByLabel(root, "Most Downloaded Report", stats?.mostDownloaded || "—");

  // Direct patch for rp-stat cards (name/value variants in legacy markup)
  root.querySelectorAll(".rp-stat").forEach((card) => {
    const label = (card.querySelector(".label")?.textContent || "").trim().toLowerCase();
    const valueEl = card.querySelector<HTMLElement>(".value, .name");
    if (!valueEl) return;
    if (label.includes("total reports")) {
      valueEl.textContent = String(stats?.totalReportsGenerated ?? 0);
    } else if (label.includes("this month")) {
      valueEl.textContent = String(stats?.thisMonth ?? 0);
    } else if (label.includes("last generated")) {
      valueEl.textContent = stats?.lastGenerated || "—";
    } else if (label.includes("most downloaded")) {
      valueEl.textContent = stats?.mostDownloaded || "—";
    }
  });

  ensureUsersReportCategory(root);

  patchTableRows(root.querySelector(".rp-table"), reportsPayload.reports, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[0]) {
      cells[0].textContent = `${row.name}${row.value != null ? ` (${row.value})` : ""}`;
    }
    if (cells[1]) cells[1].textContent = row.type;
    if (cells[2]) cells[2].textContent = row.generatedBy;
    if (cells[3]) cells[3].textContent = row.date;
    if (cells[4]) cells[4].textContent = row.format;
    if (row.downloadPath) {
      tr.classList.add("is-clickable");
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        if (row.type === "Users" || row.name === "User Directory") {
          window.location.assign("/admin/reportlist52?type=users");
          return;
        }
        window.location.assign(row.downloadPath!);
      };
    }
  });
}

function hydrateReportCategoryList(
  root: Element,
  payload: {
    categoryLabel?: string;
    reports: Array<{
      id: string;
      name: string;
      fileName: string;
      format: string;
      generatedAt: string;
      generatedBy: string;
      downloadPath?: string;
      hasDownload?: boolean;
    }>;
  },
) {
  const params = new URLSearchParams(window.location.search);
  const type = (params.get("type") || "event").toLowerCase();
  const labels: Record<string, string> = {
    event: "Event Reports",
    attendance: "Attendance Reports",
    certificate: "Certificate Reports",
    feedback: "Feedback Reports",
    users: "User Directory Reports",
  };
  const title = root.querySelector("#rl-title");
  if (title) title.textContent = payload.categoryLabel || labels[type] || labels.event;

  const groups = groupReportsByTime(payload.reports);
  const templateGroup = root.querySelector(".rl-group");
  const host = templateGroup?.parentElement;
  if (!host || !templateGroup) return;

  host.querySelectorAll(".rl-group").forEach((node) => node.remove());

  if (!groups.length) {
    const empty = templateGroup.cloneNode(true) as HTMLElement;
    empty.querySelector(".rl-group-head h3")!.textContent = "No reports yet";
    const cards = empty.querySelector(".rl-cards");
    if (cards) {
      cards.innerHTML =
        '<p class="dc-report-empty">Generate a report from the Reports page or Smart Report Assistant to see it here.</p>';
    }
    const rows = empty.querySelector(".rl-list-rows");
    if (rows) rows.innerHTML = "";
    host.appendChild(empty);
    return;
  }

  for (const [timeLabel, reports] of groups) {
    const group = templateGroup.cloneNode(true) as HTMLElement;
    const heading = group.querySelector(".rl-group-head h3");
    if (heading) heading.textContent = timeLabel;

    const cards = group.querySelector(".rl-cards");
    const cardTemplate = cards?.querySelector(".rl-card");
    if (cards && cardTemplate) {
      cards.innerHTML = "";
      for (const report of reports) {
        const card = cardTemplate.cloneNode(true) as HTMLElement;
        card.dataset.reportId = report.id;
        const titleEl = card.querySelector("h4");
        if (titleEl) titleEl.textContent = report.name;
        const avatar = card.querySelector(".avatar");
        if (avatar) avatar.textContent = initialsFromName(report.generatedBy);
        const meta = card.querySelector(".rl-meta p");
        if (meta) meta.textContent = `${report.generatedBy} generated this report`;
        const downloadPath = report.downloadPath || `/api/admin/reports/${report.id}/download`;
        card.style.cursor = "pointer";
        card.addEventListener("click", () => {
          window.location.assign(downloadPath);
        });
        cards.appendChild(card);
      }
    }

    const listRows = group.querySelector(".rl-list-rows");
    const rowTemplate = listRows?.querySelector(".rl-list-row");
    if (listRows && rowTemplate) {
      listRows.innerHTML = "";
      for (const report of reports) {
        const row = rowTemplate.cloneNode(true) as HTMLElement;
        const cells = row.querySelectorAll("span");
        const ext = report.fileName.includes(".")
          ? `.${report.fileName.split(".").pop()}`
          : report.format.toLowerCase();
        if (cells[0]) cells[0].textContent = report.name;
        if (cells[1]) cells[1].textContent = formatReportDateTime(report.generatedAt);
        if (cells[2]) cells[2].textContent = report.generatedBy;
        if (cells[3]) cells[3].textContent = ext;
        const downloadPath = report.downloadPath || `/api/admin/reports/${report.id}/download`;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          window.location.assign(downloadPath);
        });
        listRows.appendChild(row);
      }
    }

    host.appendChild(group);
  }
}

/**
 * Updates existing admin markup in place with live Mongo data.
 * Preserves original layout, classes, and structure from frontend-admin.
 */
export function AdminDataBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const pageId = pageIdFromPath(pathname);
    const watch = new Set([
      "home12",
      "user27",
      "event13",
      "aed15",
      "live16",
      "edetails14",
      "rr24",
      "rejected21",
      "postponed22",
      "complete18",
      "ongoing16",
      "inactive20",
      "attendance42",
      "deets43",
      "feedback47",
      "feeddeets49",
      "cert45",
      "certdeets46",
      "fulld46",
      "report51",
      "reportlist52",
      "reportgen53",
      "listp44",
      "ereg32",
      "eorga35",
      "eattend33",
      "vattend34",
      "regview33",
      "cert38",
      "fb39",
      "esaved37",
      "responses50",
      "scollection48",
      "fcollection48",
    ]);
    if (!watch.has(pageId)) return;

    let cancelled = false;

    const onCertAction = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const viewBtn = target?.closest<HTMLAnchorElement>(".cert-view");
      if (viewBtn) {
        // Let View navigate to certificate details — do not intercept.
        return;
      }
      const btn = target?.closest<HTMLElement>(".cert-generate-btn");
      if (!btn) return;
      const eventId = btn.getAttribute("data-event-id");
      if (!eventId) return;
      event.preventDefault();
      event.stopPropagation();
      btn.setAttribute("aria-busy", "true");
      void fetch("/api/user/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed");
          window.alert(
            data.message ||
              `Generated ${data.certificates?.length || 0} certificate(s).`,
          );
          window.location.reload();
        })
        .catch((err) => {
          window.alert(err instanceof Error ? err.message : "Failed to generate.");
        })
        .finally(() => {
          btn.removeAttribute("aria-busy");
        });
    };

    document.addEventListener("click", onCertAction, true);

    const run = async () => {
      try {
        const root =
          document.querySelector(".admin-legacy-root") ||
          document.querySelector("[data-admin-page]") ||
          document.body;
        if (root instanceof Element && root.getAttribute("data-dc-blanked") !== pageId) {
          hideLegacyDemoContent(root);
          root.setAttribute("data-dc-blanked", pageId);
        }

        const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as DashboardPayload;
        if (cancelled) return;

        if (pageId === "home12") hydrateHome(root, data);
        if (pageId === "user27") hydrateUsers(root, data);
        if (
          pageId === "event13" ||
          pageId === "aed15" ||
          pageId === "live16" ||
          pageId === "edetails14" ||
          pageId === "rr24" ||
          pageId === "rejected21" ||
          pageId === "postponed22" ||
          pageId === "complete18" ||
          pageId === "ongoing16" ||
          pageId === "inactive20"
        ) {
          let liveEvents: Array<{
            id: string;
            title: string;
            status: string;
            location?: string;
            startsAt?: string;
          }> | null = null;
          try {
            const eventsRes = await fetch("/api/events?limit=500", { cache: "no-store" });
            if (eventsRes.ok) {
              const payload = (await eventsRes.json()) as { events?: NonNullable<typeof liveEvents> };
              liveEvents = payload.events || [];
            }
          } catch {
            /* dashboard lists still apply when live fetch fails */
          }
          hydrateEvents(root, data, pageId, liveEvents);
        }
        if (pageId === "attendance42" || pageId === "deets43" || pageId === "eattend33" || pageId === "vattend34") {
          hydrateAttendance(root, data);
        }
        if (
          pageId === "feedback47" ||
          pageId === "feeddeets49" ||
          pageId === "fb39" ||
          pageId === "responses50" ||
          pageId === "scollection48" ||
          pageId === "fcollection48"
        ) {
          const reloadFeedback = async () => {
            const feedbackAnalytics = await fetchFeedbackAnalytics(feedbackFilterState);
            if (feedbackAnalytics) hydrateFeedbackAdmin(root, feedbackAnalytics);
          };
          if (pageId === "feedback47") wireFeedbackFilters(root, () => void reloadFeedback());
          await reloadFeedback();
        }
        if (pageId === "cert45" || pageId === "certdeets46" || pageId === "fulld46" || pageId === "cert38") {
          await hydrateCertificatesAdmin(root, data);
        }
        if (pageId === "report51" || pageId === "reportgen53") {
          blankReportHubPlaceholders(root);
          const reportsRes = await fetch("/api/admin/reports", { cache: "no-store", credentials: "include" });
          if (reportsRes.ok) {
            const reportsData = await reportsRes.json();
            hydrateReportsAdmin(root, reportsData);
          }
        }
        if (pageId === "reportlist52") {
          const params = new URLSearchParams(window.location.search);
          const category = params.get("type") || "event";
          const reportsRes = await fetch(`/api/admin/reports?category=${encodeURIComponent(category)}`, {
            cache: "no-store",
            credentials: "include",
          });
          if (reportsRes.ok) {
            const reportsData = await reportsRes.json();
            hydrateReportCategoryList(root, reportsData);
          }
        }
      } catch {
        /* keep original static markup */
      }
    };

    const t1 = window.setTimeout(() => void run(), 50);
    const t2 = window.setTimeout(() => void run(), 300);
    const pollMs =
      pageId === "cert45" ||
      pageId === "reportgen53" ||
      pageId === "report51" ||
      pageId === "reportlist52" ||
      pageId === "feedback47" ||
      pageId === "fcollection48" ||
      pageId === "scollection48"
        ? 4000
        : 12000;
    const poll = window.setInterval(() => void run(), pollMs);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(poll);
      document.removeEventListener("click", onCertAction, true);
    };
  }, [pathname]);

  return null;
}
