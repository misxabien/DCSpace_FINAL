"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  hideLegacyDemoContent,
  patchChildren,
  setEventsEmptyState,
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

  patchChildren(root.querySelector(".card-row"), "article.event-card", data.attention.slice(0, 3), (card, item) => {
    const title = card.querySelector("h4");
    const reason = card.querySelector(".meta-value");
    if (title) title.textContent = item.title;
    if (reason) reason.textContent = item.reason;
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

  const emptyCopy = {
    title: "No events scheduled for today.",
    text: "You currently have no events happening today. Check back later or join a new event to get started.",
  };

  const fillList = (listId: string, events: ListEvent[], hrefFor: (event: ListEvent) => string) => {
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
    setEventsEmptyState(list, events.length === 0, emptyCopy);
  };

  const fillPanel = (
    panel: Element | null,
    events: ListEvent[],
    detailPath: string,
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
    setEventsEmptyState(panel, events.length === 0, emptyCopy);
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
  const approvedEvents =
    liveEvents !== null
      ? mapped.filter((event) =>
          ["approved", "live", "completed"].includes(event.status),
        )
      : data.events.approved;

  fillList("pending-list", pendingEvents, (event) =>
    `/admin/edetails14?id=${encodeURIComponent(event.id)}&status=validated`,
  );
  fillList("approved-list", approvedEvents, (event) =>
    `/admin/aed15?id=${encodeURIComponent(event.id)}&status=${encodeURIComponent(event.status)}`,
  );

  // If URL asks for approved tab, unhide the approved list (legacy HTML ships it hidden).
  try {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "approved") {
      const approvedList = root.querySelector<HTMLElement>("#approved-list");
      const pendingList = root.querySelector<HTMLElement>("#pending-list");
      if (approvedList) approvedList.hidden = false;
      if (pendingList) pendingList.hidden = true;
      root.querySelectorAll<HTMLElement>("[data-events-tab]").forEach((btn) => {
        const active = btn.getAttribute("data-events-tab") === "approved";
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
    }
  } catch {
    /* ignore */
  }

  const panels = Array.from(root.querySelectorAll(".events-panel"));

  if (pageId === "complete18") {
    fillPanel(
      panels[0] || null,
      mapped.filter((event) => event.status === "completed"),
      "/admin/cc19",
    );
  }
  if (pageId === "ongoing16") {
    fillPanel(
      panels[0] || null,
      mapped.filter((event) => event.status === "live"),
      "/admin/live16",
    );
  }
  if (pageId === "inactive20") {
    fillPanel(
      panels[0] || null,
      mapped.filter((event) => event.status === "rejected"),
      "/admin/rejected21",
    );
    fillPanel(
      panels[1] || null,
      mapped.filter((event) => event.status === "postponed"),
      "/admin/postponed22",
    );
    fillPanel(
      panels[2] || null,
      mapped.filter((event) => event.status === "cancelled"),
      "/admin/c23",
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

function hydrateFeedbackAdmin(root: Element, data: DashboardPayload) {
  setFbStat(root, "Total Feedback", data.stats.feedbackReceived);
  setFbStat(root, "Feedback Responses", data.stats.feedbackReceived);
  const avg =
    data.feedback.length > 0
      ? (
          data.feedback.reduce((sum, row) => {
            const n = Number(row.rating || 0);
            return sum + (Number.isFinite(n) ? n : 0);
          }, 0) / Math.max(data.feedback.length, 1)
        ).toFixed(1)
      : "0";
  setFbStat(root, "Satisfaction", avg);
  setFbStat(
    root,
    "Response Rate",
    data.stats.totalUsers > 0
      ? `${Math.min(100, Math.round((data.stats.feedbackReceived / data.stats.totalUsers) * 100))}%`
      : "0%",
  );

  const table = root.querySelector(".fd-table, .fb-table, table");
  patchTableRows(table, data.feedback, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[0]) cells[0].textContent = row.submittedBy;
    if (cells[1]) cells[1].textContent = row.type;
    if (cells[2]) cells[2].textContent = row.dateLabel;
    if (cells[3]) cells[3].textContent = row.eventName || "—";
    if (cells[4]) cells[4].textContent = row.comment || "—";
  });
}

function hydrateCertificatesAdmin(root: Element, data: DashboardPayload) {
  setStatByLabel(root, "Generated Certificates", data.stats.certificatesGenerated);
  setStatByLabel(
    root,
    "Events with Certificates",
    data.stats.completedEvents ?? data.stats.approvedEvents ?? 0,
  );

  const rows: Array<{
    id: string;
    title: string;
    status: string;
    organizerName?: string;
    organizerEmail?: string;
    reviewedByEmail?: string;
    dateLabel?: string;
    location?: string;
    startsAt?: string;
  }> = data.events.approved.length ? data.events.approved : data.events.pending;
  patchTableRows(root.querySelector(".cert-table"), rows.slice(0, 20), (tr, event) => {
    const cells = tr.querySelectorAll("td");
    if (cells[0]) cells[0].textContent = event.title;
    if (cells[1]) {
      cells[1].textContent = event.status === "completed" ? "VALIDATED" : "PENDING";
    }
    if (cells[2]) {
      cells[2].textContent =
        data.stats.certificatesGenerated > 0 ? "GENERATED" : "PENDING";
    }
    const action = tr.querySelector<HTMLElement>(".cert-view, .cert-generate-btn, a, button");
    if (action) {
      action.setAttribute("data-event-id", event.id);
      if (action.classList.contains("cert-view")) {
        action.textContent = "View";
      }
    }
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
      name: string;
      type: string;
      generatedBy: string;
      date: string;
      format: string;
      value?: number;
    }>;
  },
) {
  setStatByLabel(root, "Total Reports Generated", reportsPayload.stats.totalReportsGenerated);
  setStatByLabel(root, "This Month", reportsPayload.stats.thisMonth);
  setStatByLabel(root, "Last Generated", reportsPayload.stats.lastGenerated);
  setStatByLabel(root, "Most Downloaded", reportsPayload.stats.mostDownloaded);

  patchTableRows(root.querySelector(".rp-table"), reportsPayload.reports, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[0]) {
      cells[0].textContent = `${row.name}${row.value != null ? ` (${row.value})` : ""}`;
    }
    if (cells[1]) cells[1].textContent = row.type;
    if (cells[2]) cells[2].textContent = row.generatedBy;
    if (cells[3]) cells[3].textContent = row.date;
    if (cells[4]) cells[4].textContent = row.format;
  });
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
      const btn = target?.closest<HTMLElement>(".cert-view, .cert-generate-btn");
      if (!btn) return;
      const eventId = btn.getAttribute("data-event-id");
      if (!eventId) return;
      event.preventDefault();
      btn.setAttribute("aria-busy", "true");
      void fetch("/api/user/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed");
          window.alert(`Generated ${data.certificates?.length || 0} certificate(s).`);
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
            const eventsRes = await fetch("/api/events?limit=200", { cache: "no-store" });
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
          hydrateFeedbackAdmin(root, data);
        }
        if (pageId === "cert45" || pageId === "certdeets46" || pageId === "fulld46" || pageId === "cert38") {
          hydrateCertificatesAdmin(root, data);
        }
        if (pageId === "report51" || pageId === "reportlist52" || pageId === "reportgen53") {
          const reportsRes = await fetch("/api/admin/reports", { cache: "no-store" });
          if (reportsRes.ok) {
            const reportsData = await reportsRes.json();
            hydrateReportsAdmin(root, reportsData);
          }
        }
      } catch {
        /* keep original static markup */
      }
    };

    const t1 = window.setTimeout(() => void run(), 50);
    const t2 = window.setTimeout(() => void run(), 300);
    const poll = window.setInterval(() => void run(), 12000);

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
