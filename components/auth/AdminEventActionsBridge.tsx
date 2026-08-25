"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveAdminEventId } from "@/lib/events/resolve-admin-event-id";

type LiveEvent = {
  id: string;
  title: string;
  description: string;
  status: string;
  location: string;
  startsAt: string;
  endsAt: string;
  organizerName: string;
  organizerEmail: string;
  reviewNote: string;
  reviewedByEmail?: string;
  createdAt: string;
  requiredFiles?: string[];
  speakers?: string[];
  allowedCourses?: string[];
  collaboratingDepartments?: string[];
  audienceSchools?: string[];
  programActivities?: string[];
  announcements?: string;
  department?: string;
  venueType?: string;
  category?: string;
  attendanceRequired?: string;
  conceptPaperName?: string;
  certificateTemplateName?: string;
  programFileName?: string;
  hasConceptPaper?: boolean;
  hasCertificateTemplate?: boolean;
  hasProgramFile?: boolean;
  hasPoster?: boolean;
  posterImage?: string;
  reservationId?: string;
  reservationStatus?: string;
  reservationRoomId?: string;
  reservationRoomName?: string;
  reservationCapacity?: number | null;
  attachments?: {
    conceptPaper?: string;
    certificateTemplate?: string;
    programFile?: string;
    poster?: string;
  };
};

const DETAIL_PAGES = new Set([
  "/admin/edetails14",
  "/admin/aed15",
  "/admin/live16",
  "/admin/cc19",
  "/admin/pop26",
  "/admin/postponed22",
  "/admin/rejected21",
  "/admin/c23",
  "/admin/deets43",
  "/admin/rr24",
  "/admin/reject25",
]);

const EVENT_DETAIL_CACHE_MS = 30_000;
const eventDetailCache = new Map<string, { event: LiveEvent; fetchedAt: number }>();
const eventDetailInflight = new Map<string, Promise<LiveEvent | null>>();

async function fetchEventDetails(eventId: string) {
  const id = eventId.trim();
  if (!id) return null;

  const cached = eventDetailCache.get(id);
  if (cached && Date.now() - cached.fetchedAt < EVENT_DETAIL_CACHE_MS) {
    return cached.event;
  }

  const inflight = eventDetailInflight.get(id);
  if (inflight) return inflight;

  const promise = (async () => {
    const res = await fetch(`/api/events/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return cached?.event || null;
    const data = (await res.json()) as { event?: LiveEvent };
    if (!data.event) return cached?.event || null;
    eventDetailCache.set(id, { event: data.event, fetchedAt: Date.now() });
    return data.event;
  })();

  eventDetailInflight.set(id, promise);
  try {
    return await promise;
  } finally {
    eventDetailInflight.delete(id);
  }
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

async function patchEvent(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/events/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to update event.");
  }
  return data.event as LiveEvent;
}

function redirectForStatus(id: string, status: string) {
  const qs = `?id=${encodeURIComponent(id)}&status=${encodeURIComponent(status)}`;
  if (status === "approved") return `/admin/aed15${qs}`;
  if (status === "live") return `/admin/live16${qs}`;
  if (status === "completed") return `/admin/cc19${qs}`;
  if (status === "postponed") return `/admin/postponed22${qs}`;
  if (status === "rejected") return `/admin/rejected21${qs}`;
  if (status === "cancelled") return `/admin/c23${qs}`;
  // Pending review uses validated view so Approve/Reject/Revisions buttons are visible.
  return `/admin/edetails14?id=${encodeURIComponent(id)}&status=validated`;
}

/** After Approve / Reject / Request Revisions, land on the matching admin page. */
function redirectForReviewAction(
  id: string,
  action: "approve" | "reject" | "revisions",
  status: string,
) {
  const qs = `?id=${encodeURIComponent(id)}&status=${encodeURIComponent(status)}`;
  if (action === "approve") {
    // Approved Events detail
    return `/admin/aed15${qs}`;
  }
  if (action === "revisions") {
    // Request Revision page (event stays pending)
    return `/admin/rr24${qs}`;
  }
  if (action === "reject") {
    // Inactive / rejected event detail
    return `/admin/rejected21${qs}`;
  }
  return redirectForStatus(id, status);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FILE_CARD_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm0 2.5L17.5 8H14V4.5zM8 12h8v1.5H8V12zm0 3.5h8V17H8v-1.5zM8 8.5h4V10H8V8.5z"/></svg>';

function filesRowAfterTitle(root: ParentNode, title: string) {
  const headings = Array.from(root.querySelectorAll("p.block-title"));
  const heading = headings.find(
    (el) => (el.textContent || "").trim().toLowerCase() === title.toLowerCase(),
  );
  const row = heading?.nextElementSibling;
  if (row && row.classList.contains("files-row")) return row;
  return null;
}

function wireFileLink(link: HTMLAnchorElement | null, fileName: string, url: string) {
  if (!link) return;
  if (url) {
    link.href = url;
    link.textContent = fileName || "Download";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.removeAttribute("onclick");
    return;
  }
  link.href = "#";
  link.textContent = "No file uploaded";
  link.removeAttribute("target");
  link.onclick = (event) => event.preventDefault();
}

function fillEventFiles(root: ParentNode, event: LiveEvent) {
  const requiredRow = filesRowAfterTitle(root, "Files Required");
  if (requiredRow) {
    const names = Array.isArray(event.requiredFiles) ? event.requiredFiles.filter(Boolean) : [];
    const icon = requiredRow.querySelector(".file-card svg")?.outerHTML || FILE_CARD_ICON;
    requiredRow.innerHTML = (names.length ? names : ["None"]).map(
      (name) =>
        `<div class="file-card">${icon}<strong>${escapeHtml(name)}</strong></div>`,
    ).join("");
  }

  const attachmentsRow = filesRowAfterTitle(root, "Attachments");
  if (!attachmentsRow) return;

  const cards = Array.from(attachmentsRow.querySelectorAll(".file-card"));
  cards.forEach((card) => {
    const label = (card.querySelector("strong")?.textContent || "").trim().toLowerCase();
    const link = card.querySelector<HTMLAnchorElement>("a.file-link");
    if (label.includes("concept")) {
      wireFileLink(
        link,
        event.conceptPaperName || "concept-paper.pdf",
        event.hasConceptPaper ? event.attachments?.conceptPaper || "" : "",
      );
    } else if (label.includes("certificate") || label.includes("e-cert")) {
      wireFileLink(
        link,
        event.certificateTemplateName || "e-certificate.pdf",
        event.hasCertificateTemplate ? event.attachments?.certificateTemplate || "" : "",
      );
    }
  });

  if (event.hasProgramFile && event.attachments?.programFile) {
    const already = Array.from(attachmentsRow.querySelectorAll(".file-card strong")).some(
      (el) => (el.textContent || "").toLowerCase().includes("program"),
    );
    if (!already) {
      const card = document.createElement("div");
      card.className = "file-card";
      card.innerHTML = `${FILE_CARD_ICON}<strong>Program Flow</strong><a class="file-link" href="#"></a>`;
      wireFileLink(
        card.querySelector("a.file-link"),
        event.programFileName || "program-flow.pdf",
        event.attachments.programFile,
      );
      attachmentsRow.appendChild(card);
    }
  }
}

function joinList(values?: string[]) {
  return Array.isArray(values) && values.length ? values.join(", ") : "—";
}

function fillProgramFlow(root: ParentNode, event: LiveEvent) {
  const fileCard = root.querySelector(".program-file-card");
  if (fileCard) {
    const link = fileCard.querySelector<HTMLAnchorElement>("a.file-link");
    wireFileLink(
      link,
      event.programFileName || "program-flow.pdf",
      event.hasProgramFile ? event.attachments?.programFile || "" : "",
    );
  }

  const announce = root.querySelector(".announce-card .meta-value");
  if (announce) {
    announce.textContent = String(event.announcements || "").trim() || "No announcements.";
  }

  const host = root.querySelector(".program-cards");
  if (!host) return;

  let list = host.querySelector<HTMLElement>(".program-activities");
  if (!list) {
    list = document.createElement("article");
    list.className = "event-card program-flow-wide program-activities";
    host.appendChild(list);
  }

  const items = Array.isArray(event.programActivities)
    ? event.programActivities.map((item) => String(item).trim()).filter(Boolean)
    : [];
  list.innerHTML = items.length
    ? `<p class="meta-label">PROGRAM FLOW</p><ol class="program-activity-list">${items
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("")}</ol>`
    : `<p class="meta-label">PROGRAM FLOW</p><p class="meta-value">No activities saved yet. Organizers can generate a list with Gemini on Create Event.</p>`;
}

function fillEventPoster(root: ParentNode, event: LiveEvent) {
  const posters = root.querySelectorAll<HTMLElement>(
    ".poster, .detail-top-meta .poster, .submit-meta .poster, .detail-top-aside .poster",
  );
  if (!posters.length) return;

  let posterUrl = (event.attachments?.poster || "").trim();
  if (!posterUrl && event.posterImage) {
    posterUrl = event.posterImage.startsWith("data:")
      ? event.posterImage
      : `data:image/jpeg;base64,${event.posterImage}`;
  }
  if (!posterUrl && event.hasPoster && event.id) {
    posterUrl = `/api/events/${encodeURIComponent(event.id)}/attachments/poster`;
  }

  posters.forEach((el) => {
    if (!posterUrl) {
      el.hidden = true;
      el.style.display = "none";
      el.classList.remove("has-image");
      el.style.removeProperty("background");
      el.style.removeProperty("background-image");
      el.style.removeProperty("background-size");
      el.style.removeProperty("background-position");
      el.style.removeProperty("background-repeat");
      return;
    }

    el.hidden = false;
    el.style.display = "";
    el.classList.add("has-image");
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", `${event.title || "Event"} poster`);
    el.style.setProperty(
      "background",
      `center / cover no-repeat url("${posterUrl}")`,
      "important",
    );
  });
}

function fillEventDetails(root: ParentNode, event: LiveEvent) {
  const host =
    root instanceof HTMLElement ? root : (root.querySelector(".admin-legacy-root") as HTMLElement | null);
  const previousId = host?.dataset.dcEventId || "";
  const isSameEvent = previousId === event.id;

  // Only wipe placeholders on first load or when switching events.
  if (!isSameEvent) {
    root.querySelectorAll(".field-box .value").forEach((el) => {
      el.textContent = "—";
    });
    root.querySelectorAll(".announce-card .meta-value, .program-cards .meta-value").forEach((el) => {
      if (!(el.textContent || "").includes("No activities")) {
        el.textContent = "—";
      }
    });
  }

  if (host) {
    host.dataset.dcEventId = event.id;
    host.classList.add("dc-details-loaded");
    host.classList.remove("is-loading-details");
  }

  const title = root.querySelector("#event-info-card h3, .figma-detail-top h3, .detail-top-main h3");
  if (title) title.textContent = event.title || "Event";

  const desc = root.querySelector("#event-info-card .desc, .detail-top-main .desc");
  if (desc) desc.textContent = event.description || "No description provided.";

  fillEventPoster(root, event);

  const setField = (label: string, value: string, scope?: ParentNode) => {
    const searchRoot = scope || root;
    searchRoot.querySelectorAll(".field-box").forEach((box) => {
      const lab = box.querySelector(".label");
      if (!lab) return;
      if ((lab.textContent || "").trim().toLowerCase() !== label.toLowerCase()) return;
      const val = box.querySelector(".value");
      if (val) val.textContent = value;
    });
  };

  setField("START DATE", formatDate(event.startsAt));
  setField("END DATE", formatDate(event.endsAt));
  setField("START TIME", formatTime(event.startsAt));
  setField("END TIME", formatTime(event.endsAt));
  setField("VENUE", event.location || "—");
  setField("ORGANIZER", event.organizerName || event.organizerEmail || "—");
  setField("STATUS", (event.status || "—").toUpperCase());
  setField("EVENT STATUS", (event.status || "—").toUpperCase());
  setField("EVENT SPEAKERS", joinList(event.speakers));
  setField("EVENT AUDIENCE", joinList(event.audienceSchools?.length ? event.audienceSchools : event.allowedCourses));
  setField("COURSES INVITED", joinList(event.allowedCourses));
  setField("COLLABORATING DEPARTMENT", joinList(event.collaboratingDepartments));
  setField("VENUE TYPE", event.venueType || "—");
  setField("EVENT TYPE", event.category || "—");
  setField("ORGANIZATION", event.department || event.organizerName || "—");
  setField("DURATION", event.attendanceRequired || "—");
  setField("MINIMUM ATTENDANCE", event.attendanceRequired || "—");
  setField("GRACE PERIOD", "—");
  setField("ANNOUNCEMENTS", event.announcements || "—");

  const submittedBy =
    root.querySelector(".submitted-by-card, [aria-label='Submitted by']")?.closest("section") ||
    root.querySelector(".detail-card.submitted-by-card") ||
    null;
  if (submittedBy) {
    setField("Name", event.organizerName || "—", submittedBy);
    setField("Email", event.organizerEmail || "—", submittedBy);
    setField("Course", "—", submittedBy);
    setField("School", "—", submittedBy);
    setField("Organization", event.department || "—", submittedBy);
    setField("Organization Role", "—", submittedBy);
    setField("Organization Position", "—", submittedBy);
  } else {
    setField("Name", event.organizerName || "—");
    setField("Email", event.organizerEmail || "—");
  }

  const approvedByLink = root.querySelector<HTMLElement>(".approved-by-link, .approved-by");
  if (approvedByLink) {
    approvedByLink.textContent = event.reviewedByEmail
      ? `Approved by: ${event.reviewedByEmail}`
      : "Approved by: —";
  }

  const adminNote = root.querySelector(".admin-note, .notes-panel .note-body, [data-admin-note]");
  if (adminNote && event.reviewNote) {
    adminNote.textContent = event.reviewNote;
  }

  // Clear static Interest Metrics / demo copy that isn't live-hydrated here.
  root.querySelectorAll(".interest-metrics .metric-value, .approved-extras .metric-value").forEach((el) => {
    el.textContent = "—";
  });

  // Validation card: live eRoomReserve reservation sync for pending approval.
  const reservationStatus = (event.reservationStatus || "").toLowerCase();
  const roomValidated =
    reservationStatus === "approved" || reservationStatus === "completed";
  const valStatus = document.getElementById("val-status");
  const valVenue = document.getElementById("val-venue");
  const valCapacity = document.getElementById("val-capacity");
  const valConflicts = document.getElementById("val-conflicts");
  if (valStatus) {
    if (reservationStatus === "approved" || reservationStatus === "completed") {
      valStatus.textContent = "Validated";
    } else if (reservationStatus === "rejected") {
      valStatus.textContent = "Rejected";
    } else if (reservationStatus === "cancelled") {
      valStatus.textContent = "Cancelled";
    } else if (reservationStatus) {
      valStatus.textContent = reservationStatus.replace(/^\w/, (c) => c.toUpperCase());
    } else {
      valStatus.textContent = "Pending eRoomReserve";
    }
  }
  if (valVenue) {
    valVenue.textContent =
      event.reservationRoomName || event.location || "—";
  }
  if (valCapacity) {
    valCapacity.textContent =
      event.reservationCapacity != null ? String(event.reservationCapacity) : "—";
  }
  if (valConflicts) {
    valConflicts.textContent = roomValidated
      ? "None"
      : reservationStatus === "rejected" || reservationStatus === "cancelled"
        ? "Room not available"
        : "Awaiting eRoomReserve";
  }

  fillEventFiles(root, event);
  fillProgramFlow(root, event);

  const rfidLink = root.querySelector<HTMLAnchorElement>("#live-attendance-link, a[href='/admin/rfid17']");
  if (rfidLink) {
    rfidLink.href = `/admin/rfid17?id=${encodeURIComponent(event.id)}`;
  }
  try {
    if (event.id) sessionStorage.setItem("dc-rfid-event-id", event.id);
  } catch {
    /* ignore */
  }

  const actions = root.querySelector("#detail-actions");
  if (actions) {
    actions.setAttribute(
      "data-reservation-status",
      roomValidated ? "Validated" : reservationStatus ? reservationStatus : "Pending",
    );
    actions.setAttribute("data-event-id", event.id);
    if (event.reservationId) {
      actions.setAttribute("data-reservation-id", event.reservationId);
    }
    ensureStatusButtons(actions, event.status);
    showPendingReviewActions(event.status, roomValidated, reservationStatus);
    showApprovedActionGroup(event.status);
  }
}

/** Make Approve/Reject/Revisions visible once eRoomReserve has validated the room. */
function showPendingReviewActions(
  status: string,
  roomValidated = false,
  reservationStatus = "",
) {
  if (status !== "pending") return;

  document.body.classList.remove("is-pending-view", "is-approved-view", "is-validated-view");
  document.body.classList.add(roomValidated ? "is-validated-view" : "is-pending-view");

  const group = document.querySelector(
    "#detail-actions .action-group",
  ) as HTMLElement | null;
  if (group) {
    group.style.display = "flex";
    group.querySelectorAll<HTMLButtonElement>(".action-btn.approve").forEach((btn) => {
      btn.disabled = !roomValidated;
      btn.title = roomValidated
        ? "Approve event"
        : "Waiting for eRoomReserve to approve the room reservation";
      btn.style.opacity = roomValidated ? "" : "0.45";
      btn.style.pointerEvents = roomValidated ? "" : "none";
    });
  }

  const subtitle = document.getElementById("page-subtitle");
  if (subtitle) {
    subtitle.hidden = false;
    subtitle.textContent = roomValidated
      ? "eRoomReserve Validated — Ready for DC Space approval"
      : reservationStatus === "rejected"
        ? "eRoomReserve rejected this room"
        : "Waiting for eRoomReserve validation";
  }

  // Keep URL in sync with the view mode that matches reservation state.
  try {
    const url = new URL(window.location.href);
    if (url.pathname.includes("/admin/edetails14")) {
      const nextStatus = roomValidated ? "validated" : "pending";
      if (url.searchParams.get("status") !== nextStatus) {
        url.searchParams.set("status", nextStatus);
        window.history.replaceState({}, "", url.toString());
      }
    }
  } catch {
    /* ignore */
  }
}

/** Show Set Live / Postpone / Cancel on approved (and similar) detail pages. */
function showApprovedActionGroup(status: string) {
  if (!["approved", "live", "postponed"].includes(status)) return;
  const group = document.querySelector(
    "#detail-actions .action-group",
  ) as HTMLElement | null;
  if (group) {
    group.style.display = "flex";
  }
}

function ensureStatusButtons(actions: Element, status: string) {
  let group = actions.querySelector(".action-group");
  if (!group) {
    group = document.createElement("div");
    group.className = "action-group dc-status-actions";
    actions.appendChild(group);
  }

  const wanted: Array<{ cls: string; label: string; status: string }> = [];
  if (status === "approved") {
    wanted.push(
      { cls: "live", label: "Set Live", status: "live" },
      { cls: "postpone", label: "Postpone", status: "postponed" },
      { cls: "cancel", label: "Cancel", status: "cancelled" },
    );
  } else if (status === "live") {
    wanted.push(
      { cls: "complete", label: "Mark Complete", status: "completed" },
      { cls: "postpone", label: "Postpone", status: "postponed" },
      { cls: "cancel", label: "Cancel", status: "cancelled" },
    );
  } else if (status === "postponed") {
    wanted.push(
      { cls: "approve", label: "Resume / Approve", status: "approved" },
      { cls: "cancel", label: "Cancel", status: "cancelled" },
    );
  }

  wanted.forEach((item) => {
    if (group!.querySelector(`[data-next-status="${item.status}"]`)) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `action-btn ${item.cls}`;
    btn.textContent = item.label;
    btn.dataset.nextStatus = item.status;
    group!.appendChild(btn);
  });
}

/**
 * Wires admin event detail Approve/Reject/Live/Postpone/Complete to Mongo.
 * Also fills detail fields when ?id= is present.
 */
export function AdminEventActionsBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryId = searchParams.get("id") || "";
  const statusParam = searchParams.get("status") || "";

  useEffect(() => {
    if (!DETAIL_PAGES.has(pathname)) return;

    let cancelled = false;

    const root = () =>
      document.querySelector(".admin-legacy-root") ||
      document.querySelector("[data-admin-page]") ||
      document.body;

    const load = async () => {
      const rootEl = root();
      if (rootEl instanceof HTMLElement) {
        rootEl.classList.add("is-loading-details");
      }

      const eventId = queryId || (await resolveAdminEventId(queryId, statusParam));
      if (!eventId || cancelled) return;
      if (!queryId) {
        const next = new URL(window.location.href);
        if (next.searchParams.get("id") !== eventId) {
          next.searchParams.set("id", eventId);
          window.history.replaceState({}, "", next.toString());
        }
      }
      try {
        const cached = eventDetailCache.get(eventId);
        if (cached && !cancelled) {
          fillEventDetails(rootEl, cached.event);
          showPendingReviewActions(
            cached.event.status,
            cached.event.reservationStatus === "approved" ||
              cached.event.reservationStatus === "completed",
            cached.event.reservationStatus || "",
          );
        }

        const event = await fetchEventDetails(eventId);
        if (event && !cancelled) {
          window.requestAnimationFrame(() => {
            if (cancelled) return;
            fillEventDetails(rootEl, event);
            showPendingReviewActions(
              event.status,
              event.reservationStatus === "approved" ||
                event.reservationStatus === "completed",
              event.reservationStatus || "",
            );
          });
        }
      } catch {
        /* keep static */
      }
    };

    void load();
    const poll = window.setInterval(() => void load(), 8000);

    const onClick = async (event: MouseEvent) => {
      const target = event.target as Element | null;
      const btn = target?.closest<HTMLButtonElement>(
        ".action-btn.approve, .action-btn.reject, .action-btn.revisions, .action-btn[data-next-status]",
      );
      if (!btn) return;

      const id =
        queryId ||
        root().querySelector("#detail-actions")?.getAttribute("data-event-id") ||
        "";
      if (!id) {
        window.alert("Open an event from the Events list so it has a database id.");
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const nextFromDataset = btn.dataset.nextStatus || "";
      const isApprove = btn.classList.contains("approve") && !nextFromDataset;
      const isReject = btn.classList.contains("reject");
      const isRevisions = btn.classList.contains("revisions");
      const status =
        nextFromDataset ||
        (isApprove ? "approved" : isReject ? "rejected" : "pending");
      let reviewNote = "";
      if (isReject || isRevisions || status === "cancelled") {
        reviewNote =
          window.prompt(
            isReject
              ? "Rejection reason (optional):"
              : status === "cancelled"
                ? "Cancellation note (optional):"
                : "Revision notes (optional):",
            "",
          ) || "";
      }

      const original = btn.textContent || "";
      btn.disabled = true;
      btn.textContent = "Saving…";
      try {
        const updated = await patchEvent(id, { status, reviewNote });
        eventDetailCache.set(id, { event: updated, fetchedAt: Date.now() });
        fillEventDetails(root(), updated);
        const reviewAction = isApprove
          ? "approve"
          : isReject
            ? "reject"
            : isRevisions
              ? "revisions"
              : null;
        const nextUrl = reviewAction
          ? redirectForReviewAction(id, reviewAction, updated.status)
          : redirectForStatus(id, updated.status);
        window.alert(
          isRevisions
            ? "Revision requested. Event remains pending."
            : `Event is now ${updated.status}.`,
        );
        window.location.assign(nextUrl);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Update failed.");
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    };

    document.addEventListener("click", onClick, true);
    const t1 = window.setTimeout(() => void load(), 80);
    const t2 = window.setTimeout(() => void load(), 350);

    return () => {
      cancelled = true;
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(poll);
    };
  }, [pathname, queryId]);

  return null;
}
