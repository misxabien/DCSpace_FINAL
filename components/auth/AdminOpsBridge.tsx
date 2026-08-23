"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { hideLegacyDemoContent, patchChildren, patchTableRows } from "@/lib/legacy-dom-patch";

function pageIdFromPath(pathname: string) {
  if (!pathname.startsWith("/admin")) return "";
  if (pathname === "/admin") return "selection01";
  return pathname.replace(/^\/admin\/?/, "").split("/")[0] || "";
}

function rolePillClass(role: string) {
  const r = role.toLowerCase();
  if (r.includes("super")) return "super-admin";
  if (r.includes("admin")) return "admin";
  if (r.includes("organizer") || r.includes("faculty")) return "organizer";
  return "student";
}

function setInput(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (el) el.value = value;
}

function formatWhen(value?: string) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just Now";
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type AdminUser = {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  role: string;
  course?: string;
  school?: string;
  organizationPart?: string;
  organizationRole?: string;
  studentNumber?: string;
  rfidNumber?: string;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function wireAddUser() {
  const form = document.getElementById("add-user-form") as HTMLFormElement | null;
  if (!form || form.dataset.dcWired === "1") return;
  form.dataset.dcWired = "1";
  const overlay = document.getElementById("confirm-overlay");
  const confirmBtn = document.getElementById("confirm-create");
  const backBtn = document.getElementById("confirm-back");

  const collect = () => {
    const data = new FormData(form);
    const orgRole = String(data.get("orgRole") || "").trim();
    const orgPosition = String(data.get("orgPosition") || "").trim();
    return {
      firstName: String(data.get("firstName") || "").trim(),
      lastName: String(data.get("lastName") || "").trim(),
      studentNumber: String(data.get("idNumber") || "").trim(),
      course: String(data.get("course") || "").trim(),
      school: String(data.get("school") || "").trim(),
      organization: String(data.get("organization") || "").trim(),
      orgRole: orgPosition ? `${orgRole}:${orgPosition}` : orgRole,
      rfid: String(data.get("rfid") || "").trim(),
      email: String(data.get("email") || "").trim().toLowerCase(),
      password: String(data.get("password") || ""),
      password2: String(data.get("password2") || ""),
    };
  };

  const submitUser = async () => {
    const payload = collect();
    if (!payload.firstName || !payload.lastName || !payload.email || !payload.studentNumber) {
      window.alert("Required account fields are missing.");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: payload.firstName,
        lastName: payload.lastName,
        studentNumber: payload.studentNumber,
        course: payload.course,
        school: payload.school,
        organization: payload.organization,
        orgRole: payload.orgRole,
        rfid: payload.rfid,
        email: payload.email,
        password: payload.password,
        password2: payload.password2,
        role: "faculty",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to create user.");
    window.alert(data.message || "User created.");
    window.location.assign("/admin/user27");
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = collect();
    if (payload.password !== payload.password2) {
      window.alert("Passwords do not match.");
      return;
    }
    if (overlay) {
      overlay.removeAttribute("hidden");
      overlay.classList.add("is-open");
    } else {
      void submitUser().catch((err) => window.alert(err instanceof Error ? err.message : "Failed."));
    }
  });

  confirmBtn?.addEventListener("click", () => {
    void submitUser().catch((err) => window.alert(err instanceof Error ? err.message : "Failed."));
  });
  backBtn?.addEventListener("click", () => {
    overlay?.setAttribute("hidden", "");
    overlay?.classList.remove("is-open");
  });
}

async function hydrateSchoolDirectory(root: Element) {
  const params = new URLSearchParams(window.location.search);
  const school = params.get("school") || "";
  const role = params.get("role") || "";
  const query = new URLSearchParams();
  if (school) query.set("school", school);
  if (role) query.set("role", role);
  query.set("limit", "200");
  const data = await fetchJson<{ users: AdminUser[] }>(`/api/admin/users?${query.toString()}`);
  if (!data?.users) return;

  const schoolName = document.getElementById("school-name");
  if (schoolName && school) {
    schoolName.textContent = school.toUpperCase();
  }
  const count = document.getElementById("school-count");
  if (count) count.textContent = String(data.users.length);

  const table = root.querySelector("table");
  patchTableRows(table, data.users, (tr, user) => {
    const cells = tr.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = user.fullName;
    if (cells[2]) cells[2].textContent = user.studentNumber || "—";
    if (cells[3]) cells[3].textContent = user.course || "—";
    if (cells[4]) cells[4].textContent = user.organizationPart || "—";
    const pill = cells[5]?.querySelector(".role-pill");
    if (pill) {
      pill.textContent = (user.role || "student").toUpperCase();
      pill.className = `role-pill ${rolePillClass(user.role)}`;
    }
    const link = tr.querySelector<HTMLAnchorElement>("a.view-btn");
    if (link) link.href = `/admin/info30?id=${encodeURIComponent(user.id)}`;
  });
}

async function hydrateUserInfo() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;
  const data = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`);
  if (!data?.user) return;
  const user = data.user;
  const nameEl = document.getElementById("user-name");
  const emailEl = document.getElementById("user-email");
  if (nameEl) nameEl.textContent = user.fullName;
  if (emailEl) emailEl.textContent = user.email;
  setInput("field-name", user.fullName);
  setInput("field-number", user.studentNumber || "");
  setInput("field-email", user.email);
  setInput("field-course", user.course || "");
  setInput("field-school", user.school || "");
  setInput("field-org", user.organizationPart || "");
  const orgRole = String(user.organizationRole || "");
  const [rolePart, posPart] = orgRole.includes(":") ? orgRole.split(":") : [orgRole, ""];
  setInput("field-org-role", rolePart);
  setInput("field-org-pos", posPart);

  const makeAdmin = document.querySelector<HTMLButtonElement>(
    '#participant-actions button[aria-label="Make Admin"]',
  );
  const saRow = document.querySelector<HTMLElement>(".sa-only-row");
  const me = await fetchJson<{ user: { role?: string } | null }>("/api/auth/me");
  const viewerIsSuper = me?.user?.role === "super-admin";
  if (saRow) {
    saRow.hidden = !viewerIsSuper;
    if (viewerIsSuper) saRow.removeAttribute("hidden");
  }
  if (makeAdmin) {
    const isAdminAccount = user.role === "admin";
    const isSuperTarget = user.role === "super-admin";
    makeAdmin.disabled = isSuperTarget || !viewerIsSuper;
    makeAdmin.setAttribute("aria-pressed", isAdminAccount || isSuperTarget ? "true" : "false");
    makeAdmin.classList.toggle("is-on", isAdminAccount || isSuperTarget);
    const label = makeAdmin.closest(".action-row")?.querySelector("span");
    if (label) {
      label.textContent = isSuperTarget
        ? "Super Admin"
        : isAdminAccount
          ? "Remove Admin"
          : "Make Admin";
    }
    if (makeAdmin.dataset.dcWired !== "1") {
      makeAdmin.dataset.dcWired = "1";
      makeAdmin.addEventListener("click", async () => {
        if (!viewerIsSuper) {
          window.alert("Only a Super Admin can change administrator roles.");
          return;
        }
        if (user.role === "super-admin") {
          window.alert("Super Admin accounts cannot be changed from this toggle.");
          return;
        }
        const nextRole = user.role === "admin" ? "faculty" : "admin";
        const confirmMsg =
          nextRole === "admin"
            ? `Grant Admin access to ${user.fullName}?`
            : `Remove Admin access from ${user.fullName}?`;
        if (!window.confirm(confirmMsg)) return;
        const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          window.alert(payload.error || "Unable to update role.");
          return;
        }
        window.alert(
          nextRole === "admin"
            ? `${user.fullName} is now an Admin.`
            : `${user.fullName} is no longer an Admin.`,
        );
        window.location.reload();
      });
    }
  }

  const editBtn = document.getElementById("edit-personal-info");
  const saveBtn = document.getElementById("save-personal-info");
  const cancelBtn = document.getElementById("cancel-personal-info");
  if (editBtn?.dataset.dcWired === "1") return;
  if (editBtn) editBtn.dataset.dcWired = "1";
  const fields = [
    "field-name",
    "field-number",
    "field-email",
    "field-course",
    "field-school",
    "field-org",
    "field-org-role",
    "field-org-pos",
  ];
  const setReadonly = (readonly: boolean) => {
    fields.forEach((fieldId) => {
      const el = document.getElementById(fieldId) as HTMLInputElement | null;
      if (el) el.readOnly = readonly;
    });
    saveBtn?.toggleAttribute("hidden", readonly);
    cancelBtn?.toggleAttribute("hidden", readonly);
  };
  editBtn?.addEventListener("click", () => setReadonly(false));
  cancelBtn?.addEventListener("click", () => {
    setReadonly(true);
    window.location.reload();
  });
  saveBtn?.addEventListener("click", async () => {
    const fullName = (document.getElementById("field-name") as HTMLInputElement | null)?.value || "";
    const parts = fullName.trim().split(/\s+/);
    const orgRoleValue = (document.getElementById("field-org-role") as HTMLInputElement | null)?.value || "";
    const orgPos = (document.getElementById("field-org-pos") as HTMLInputElement | null)?.value || "";
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: parts[0] || user.firstName,
        lastName: parts.slice(1).join(" ") || user.lastName,
        studentNumber: (document.getElementById("field-number") as HTMLInputElement | null)?.value,
        email: (document.getElementById("field-email") as HTMLInputElement | null)?.value,
        course: (document.getElementById("field-course") as HTMLInputElement | null)?.value,
        school: (document.getElementById("field-school") as HTMLInputElement | null)?.value,
        organizationPart: (document.getElementById("field-org") as HTMLInputElement | null)?.value,
        organizationRole: orgPos ? `${orgRoleValue}:${orgPos}` : orgRoleValue,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(payload.error || "Failed to save.");
      return;
    }
    window.alert("Personal information saved.");
    window.location.reload();
  });
}

async function hydrateAdminProfile() {
  const data = await fetchJson<{ profile: AdminUser }>(`/api/user/profile`);
  if (!data?.profile) return;
  const profile = data.profile;
  const identity = document.querySelector(".profile-identity");
  const title = identity?.querySelector("h1");
  const studentNo = identity?.querySelector(".student-no");
  const email = identity?.querySelector(".email");
  if (title) title.textContent = profile.fullName;
  if (studentNo) studentNo.textContent = `STUDENT NUMBER: ${profile.studentNumber || "—"}`;
  if (email) email.textContent = profile.email;
  const role = document.getElementById("profile-account-role");
  if (role) role.textContent = (profile.role || "admin").replace(/-/g, " ");

  const dash = await fetchJson<{
    activities: Array<{ dateLabel: string; type: string; targetTitle: string; actorEmail: string }>;
  }>("/api/admin/dashboard");
  const mine = (dash?.activities || []).filter(
    (row) => !row.actorEmail || row.actorEmail === profile.email,
  );
  patchTableRows(document.querySelector(".activity-table"), mine.slice(0, 8), (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[0]) cells[0].textContent = row.dateLabel || "—";
    if (cells[1]) cells[1].textContent = row.targetTitle || row.type.replace(/_/g, " ");
  });
}

async function hydrateAdminNotifications() {
  const data = await fetchJson<{
    notifications: Array<{ id: string; title: string; body: string; createdAt: string; read: boolean }>;
  }>("/api/user/notifications");
  if (!data?.notifications) return;
  patchChildren(
    document.getElementById("notif-list"),
    "article.notif-item",
    data.notifications.slice(0, 20),
    (el, item) => {
      el.classList.toggle("unread", !item.read);
      const title = el.querySelector(".title");
      const body = el.querySelector(".body");
      const when = el.querySelector("time.when");
      if (title) title.textContent = item.title;
      if (body) body.textContent = item.body;
      if (when) when.textContent = formatWhen(item.createdAt);
    },
  );
}

async function hydrateRfid() {
  const eventId = new URLSearchParams(window.location.search).get("id") || "";
  const url = eventId
    ? `/api/user/attendance?eventId=${encodeURIComponent(eventId)}`
    : "/api/user/attendance";
  const data = await fetchJson<{
    attendance: Array<{
      participantName: string;
      email: string;
      action: string;
      scannedAt: string;
      eventTitle: string;
    }>;
  }>(url);
  const latest = data?.attendance?.[0];
  if (!latest) {
    const profileName = document.querySelector(".profile-name");
    if (profileName) profileName.textContent = "Waiting for tap…";
    const tapIn = document.getElementById("tap-in");
    const tapOut = document.getElementById("tap-out");
    if (tapIn) tapIn.textContent = "00:00";
    if (tapOut) tapOut.textContent = "00:00";
    return;
  }
  const name = document.querySelector(".event-name");
  if (name && latest.eventTitle) name.textContent = latest.eventTitle;
  const profileName = document.querySelector(".profile-name");
  if (profileName) profileName.textContent = latest.participantName || "Participant";
  const meta = document.querySelector(".profile-meta");
  if (meta) {
    const spans = meta.querySelectorAll("span");
    if (spans[1]) spans[1].textContent = latest.email;
  }
  const tapIn = document.getElementById("tap-in");
  const tapOut = document.getElementById("tap-out");
  const timeLabel = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "00:00";
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };
  if (latest.action === "out") {
    if (tapOut) tapOut.textContent = timeLabel(latest.scannedAt);
  } else if (tapIn) {
    tapIn.textContent = timeLabel(latest.scannedAt);
  }
}

async function hydrateCertificateDetails() {
  const eventId = new URLSearchParams(window.location.search).get("id") || "";
  const certs = await fetchJson<{
    certificates: Array<{
      id: string;
      userName: string;
      email: string;
      eventName: string;
      status: string;
      eventId: string;
      downloadUrl: string;
      studentNumber?: string;
      course?: string;
      school?: string;
    }>;
  }>(eventId ? `/api/user/certificates?eventId=${encodeURIComponent(eventId)}` : "/api/user/certificates");
  const events = await fetchJson<{ events: Array<{ id: string; title: string; status: string }> }>(
    "/api/events?limit=200",
  );
  const attention = document.getElementById("attention");
  if (attention && events?.events) {
    const pending = events.events.filter((event) => event.status === "completed" || event.status === "live");
    patchChildren(attention, "a, article, .cd-card, .event-item", pending.slice(0, 8), (el, event) => {
      const title = el.querySelector("h3, h4, .title");
      if (title) title.textContent = event.title;
      if (el instanceof HTMLAnchorElement) {
        el.href = `/admin/fulld46?id=${encodeURIComponent(event.id)}`;
      }
    });
  }

  const table = document.querySelector(".fd-table");
  if (table && certs?.certificates) {
    patchTableRows(table, certs.certificates, (tr, cert) => {
      const cells = tr.querySelectorAll("td");
      if (cells[1]) cells[1].textContent = cert.userName || cert.email;
      if (cells[2]) cells[2].textContent = cert.studentNumber || "—";
      if (cells[3]) cells[3].textContent = cert.course || "—";
      if (cells[4]) cells[4].textContent = cert.school || "—";
      if (cells[5]) cells[5].textContent = "Eligible";
      if (cells[6]) cells[6].textContent = cert.status.toUpperCase();
      const preview = tr.querySelector<HTMLElement>("[data-action-toggle], button, a");
      if (preview && cert.downloadUrl && preview.dataset.dcWired !== "1") {
        preview.dataset.dcWired = "1";
        preview.addEventListener("click", (event) => {
          event.preventDefault();
          window.open(cert.downloadUrl, "_blank", "noopener,noreferrer");
        });
      }
    });
  }
}

function wireReportsDownload() {
  const link = document.querySelector<HTMLAnchorElement>(".rp-generate");
  if (!link || link.dataset.dcWired === "1") return;
  link.dataset.dcWired = "1";
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    window.location.assign("/api/admin/reports?format=csv");
  });
}

function wireLiveSearch(root: Element) {
  const input = root.querySelector<HTMLInputElement>(
    'input[type="search"], .search-bar input, #notif-search, #audit-search-input',
  );
  if (!input || input.dataset.dcWired === "1") return;
  input.dataset.dcWired = "1";
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    root.querySelectorAll("tbody tr, a.event-item, article.notif-item").forEach((row) => {
      const text = (row.textContent || "").toLowerCase();
      (row as HTMLElement).style.display = !q || text.includes(q) ? "" : "none";
    });
  });
}

function wireUser27Views(root: Element) {
  root.querySelectorAll(".users-table-panel .view-btn, .panel-box .view-btn").forEach((btn) => {
    if (!(btn instanceof HTMLElement) || btn.dataset.dcWired === "1") return;
    btn.dataset.dcWired = "1";
    btn.addEventListener("click", (event) => {
      const id = btn.getAttribute("data-user-id") || btn.closest("tr")?.getAttribute("data-user-id");
      if (!id) return;
      event.preventDefault();
      window.location.assign(`/admin/info30?id=${encodeURIComponent(id)}`);
    });
  });
}

// ─── helpers shared by sub-detail pages ────────────────────────────────────

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setKV(root: ParentNode, key: string, value: string) {
  root.querySelectorAll(".rv-meta").forEach((cell) => {
    const k = cell.querySelector(".k");
    if (k && (k.textContent || "").trim().toUpperCase() === key.toUpperCase()) {
      const v = cell.querySelector(".v");
      if (v) v.textContent = value;
    }
  });
}

// ─── /admin/new41 — participant summary view (same user as info30) ───────────

async function hydrateNew41() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) return;
  const data = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`);
  if (!data?.user) return;
  const user = data.user;
  setText("user-name", user.fullName);
  setText("user-email", user.email);
  const initials = document.getElementById("user-initials");
  if (initials) {
    const parts = user.fullName.trim().split(/\s+/);
    initials.textContent = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
  }
  setInput("field-name", user.fullName);
  setInput("field-number", user.studentNumber || "");
  setInput("field-email", user.email);
  setInput("field-course", user.course || "");
  setInput("field-school", user.school || "");
  setInput("field-org", user.organizationPart || "");
  const orgRole = String(user.organizationRole || "");
  const [rolePart, posPart] = orgRole.includes(":") ? orgRole.split(":") : [orgRole, ""];
  setInput("field-org-role", rolePart);
  setInput("field-org-pos", posPart);

  // wire stat tile links to pass the user id
  const links: Record<string, string> = {
    "events-registered-link": `/admin/ereg32?id=${encodeURIComponent(id)}`,
    "events-attended-link": `/admin/eattend33?id=${encodeURIComponent(id)}`,
    "events-organized-link": `/admin/eorga35?id=${encodeURIComponent(id)}`,
    "events-saved-link": `/admin/esaved37?id=${encodeURIComponent(id)}`,
    "certificates-earned-link": `/admin/cert38?id=${encodeURIComponent(id)}`,
    "feedback-submitted-link": `/admin/fbdeets01?userId=${encodeURIComponent(id)}`,
  };
  Object.entries(links).forEach(([linkId, href]) => {
    const el = document.getElementById(linkId) as HTMLAnchorElement | null;
    if (el) el.href = href;
  });
}

// ─── /admin/perinfo31 — participant personal info edit ───────────────────────

async function hydratePerinfo31() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) return;
  const data = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`);
  if (!data?.user) return;
  const user = data.user;
  setText("user-name", user.fullName);
  setText("user-email", user.email);
  const initials = document.getElementById("user-initials");
  if (initials) {
    const parts = user.fullName.trim().split(/\s+/);
    initials.textContent = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
  }
  setInput("field-name", user.fullName);
  setInput("field-number", user.studentNumber || "");
  setInput("field-email", user.email);
  setInput("field-course", user.course || "");
  setInput("field-school", user.school || "");
  setInput("field-org", user.organizationPart || "");
  const orgRole = String(user.organizationRole || "");
  const [rolePart, posPart] = orgRole.includes(":") ? orgRole.split(":") : [orgRole, ""];
  setInput("field-org-role", rolePart);
  setInput("field-org-pos", posPart);

  const form = document.getElementById("update-info-form") as HTMLFormElement | null;
  if (form && form.dataset.dcWired !== "1") {
    form.dataset.dcWired = "1";
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fullName = (document.getElementById("field-name") as HTMLInputElement | null)?.value || "";
      const parts = fullName.trim().split(/\s+/);
      const orgRoleVal = (document.getElementById("field-org-role") as HTMLInputElement | null)?.value || "";
      const orgPos = (document.getElementById("field-org-pos") as HTMLInputElement | null)?.value || "";
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: parts[0] || "",
          lastName: parts.slice(1).join(" ") || "",
          studentNumber: (document.getElementById("field-number") as HTMLInputElement | null)?.value,
          email: (document.getElementById("field-email") as HTMLInputElement | null)?.value,
          course: (document.getElementById("field-course") as HTMLInputElement | null)?.value,
          school: (document.getElementById("field-school") as HTMLInputElement | null)?.value,
          organizationPart: (document.getElementById("field-org") as HTMLInputElement | null)?.value,
          organizationRole: orgPos ? `${orgRoleVal}:${orgPos}` : orgRoleVal,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert(payload.error || "Failed to save."); return; }
      window.alert("Information updated.");
      window.location.assign(`/admin/info30?id=${encodeURIComponent(id)}`);
    });
  }
}

// ─── /admin/fbdeets01 — feedback detail view ────────────────────────────────

async function hydrateFbDeets01() {
  const params = new URLSearchParams(window.location.search);
  const feedbackId = params.get("id");
  const userId = params.get("userId");

  // fill user section if userId given
  if (userId) {
    const userData = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(userId)}`);
    if (userData?.user) {
      setText("user-name", userData.user.fullName);
      setText("user-email", userData.user.email);
      const initials = document.getElementById("user-initials");
      if (initials) {
        const parts = userData.user.fullName.trim().split(/\s+/);
        initials.textContent = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
      }
    }
  }

  if (!feedbackId) return;
  const fbData = await fetchJson<{
    feedback: Array<{
      id: string; title: string; type: string; rating: number; comment: string;
      eventId: string; eventName: string; email: string; userName: string; createdAt: string;
    }>;
  }>(`/api/user/feedback?mine=0`);
  const item = fbData?.feedback?.find((f) => f.id === feedbackId) ?? fbData?.feedback?.[0];
  if (!item) return;

  setText("fb-title", item.title || "Feedback");
  setText("fb-type", item.type || "General Feedback");
  setText("event-name", item.eventName || "—");
  setText("user-name", item.userName || item.email);
  setText("user-email", item.email);

  const initials = document.getElementById("user-initials");
  if (initials) {
    const parts = (item.userName || item.email).trim().split(/\s+/);
    initials.textContent = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
  }

  const createdAt = item.createdAt ? new Date(item.createdAt) : null;
  const dateStr = createdAt && !Number.isNaN(createdAt.getTime())
    ? createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "—";
  setText("ev-date", dateStr);
  setText("ev-status", "SUBMITTED");
  setText("ev-org", "—");

  const commentEl = document.getElementById("comment");
  if (commentEl) commentEl.textContent = item.comment || "No comment provided.";

  // update star rating display
  const starsEl = document.querySelector(".fb-stars");
  if (starsEl) {
    const rating = Math.min(5, Math.max(0, Math.round(Number(item.rating || 0))));
    starsEl.setAttribute("aria-label", `${rating} out of 5 stars`);
    const svgs = starsEl.querySelectorAll("svg");
    svgs.forEach((svg, i) => {
      svg.setAttribute("fill", i < rating ? "currentColor" : "none");
      svg.setAttribute("stroke", "currentColor");
    });
  }
}

function blankEventMeta() {
  const name = document.getElementById("event-name");
  const desc = document.getElementById("event-desc");
  if (name && /event name/i.test(name.textContent || "")) name.textContent = "—";
  if (desc && /event description/i.test(desc.textContent || "")) desc.textContent = "—";
  document.querySelectorAll(".rv-meta .v").forEach((el) => {
    el.textContent = "—";
  });
}

// ─── /admin/vorg36 — view event submission from organizer's profile ──────────

async function hydrateVorg36() {
  blankEventMeta();
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId") || params.get("id");
  const eventId = params.get("eventId");

  if (userId) {
    const userData = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(userId)}`);
    if (userData?.user) {
      setText("user-name", userData.user.fullName);
      setText("user-email", userData.user.email);
      const initials = document.getElementById("user-initials");
      if (initials) {
        const parts = userData.user.fullName.trim().split(/\s+/);
        initials.textContent = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
      }
    }
  }

  if (!eventId) return;
  const eventData = await fetchJson<{
    event: {
      id: string; title: string; description?: string; status: string;
      startsAt?: string; location?: string; organizerName?: string;
      eventSpeakers?: string; organization?: string; audience?: string;
      venueType?: string; eventType?: string; duration?: string;
      minimumAttendance?: string; announcements?: string;
    };
  }>(`/api/events/${encodeURIComponent(eventId)}`);
  if (!eventData?.event) return;
  const ev = eventData.event;

  setText("event-name", ev.title || "—");
  setText("event-desc", ev.description || "—");
  setText("ev-status", (ev.status || "").toUpperCase());
  setText("ev-org", ev.organizerName || ev.organization || "—");

  const dateEl = document.getElementById("ev-date");
  if (dateEl && ev.startsAt) {
    const d = new Date(ev.startsAt);
    dateEl.textContent = Number.isNaN(d.getTime())
      ? ev.startsAt
      : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  const root = document.body;
  setKV(root, "VENUE", ev.location || "—");
  setKV(root, "EVENT STATUS", (ev.status || "").toUpperCase());
  setKV(root, "VENUE TYPE", ev.venueType || "—");
  setKV(root, "EVENT TYPE", ev.eventType || "—");
  setKV(root, "ORGANIZATION", ev.organization || "—");
  setKV(root, "DURATION", ev.duration || "—");
  setKV(root, "MINIMUM ATTENDANCE", ev.minimumAttendance || "—");
  setKV(root, "ANNOUNCEMENTS", ev.announcements || "—");
  setKV(root, "EVENT SPEAKERS", ev.eventSpeakers || "—");
  setKV(root, "EVENT AUDIENCE", ev.audience || "—");

  // approval status label
  const approvalEl = document.getElementById("approval-status");
  if (approvalEl) {
    const statusLabel: Record<string, string> = {
      approved: "APPROVED EVENT", pending: "PENDING REVIEW", rejected: "REJECTED",
      live: "ONGOING EVENT", completed: "COMPLETED EVENT", postponed: "POSTPONED",
    };
    approvalEl.textContent = statusLabel[ev.status] || (ev.status || "").toUpperCase();
  }

  // "View Event" link
  const viewLink = document.getElementById("vorg-view-event") as HTMLAnchorElement | null;
  if (viewLink) {
    viewLink.href = `/admin/edetails14?id=${encodeURIComponent(ev.id)}&status=${encodeURIComponent(
      ev.status === "pending" ? "validated" : ev.status,
    )}`;
  }
}

// ─── /admin/vsaved1 — view saved event from a user's profile ────────────────

async function hydrateVsaved1() {
  blankEventMeta();
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId") || params.get("id");
  const eventId = params.get("eventId");

  if (userId) {
    const userData = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(userId)}`);
    if (userData?.user) {
      setText("user-name", userData.user.fullName);
      setText("user-email", userData.user.email);
      const initials = document.getElementById("user-initials");
      if (initials) {
        const parts = userData.user.fullName.trim().split(/\s+/);
        initials.textContent = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
      }
    }
  }

  if (!eventId) return;
  const eventData = await fetchJson<{
    event: {
      id: string; title: string; description?: string; status: string;
      startsAt?: string; location?: string; organizerName?: string;
      organization?: string; eventType?: string; venueType?: string;
      duration?: string; minimumAttendance?: string;
    };
  }>(`/api/events/${encodeURIComponent(eventId)}`);
  if (!eventData?.event) return;
  const ev = eventData.event;

  setText("event-name", ev.title || "—");
  setText("event-desc", ev.description || "—");
  setText("ev-status", (ev.status || "").toUpperCase());
  setText("ev-type", ev.eventType || "—");
  setText("ev-org", ev.organizerName || ev.organization || "—");

  const dateEl = document.getElementById("ev-date");
  if (dateEl && ev.startsAt) {
    const d = new Date(ev.startsAt);
    dateEl.textContent = Number.isNaN(d.getTime())
      ? ev.startsAt
      : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  const root = document.body;
  setKV(root, "VENUE", ev.location || "—");
  setKV(root, "EVENT STATUS", (ev.status || "").toUpperCase());
  setKV(root, "EVENT TYPE", ev.eventType || "—");
  setKV(root, "VENUE TYPE", ev.venueType || "—");
  setKV(root, "ORGANIZATION", ev.organization || "—");
  setKV(root, "DURATION", ev.duration || "—");
  setKV(root, "MINIMUM ATTENDANCE", ev.minimumAttendance || "—");

  setText("reg-status", "SAVED");
}

// ─── /admin/administration — admin activity log ──────────────────────────────

async function hydrateAdministration(root: Element) {
  const [dash, usersPayload] = await Promise.all([
    fetchJson<{
      stats: { feedbackReceived: number };
      activities: Array<{
        actorName: string;
        actorRole: string;
        type: string;
        dateLabel: string;
        actorEmail: string;
      }>;
    }>("/api/admin/dashboard"),
    fetchJson<{ users: Array<{ id: string; fullName: string; role: string; email: string }> }>(
      "/api/admin/users?limit=200",
    ),
  ]);
  if (!dash) return;

  const admins = (usersPayload?.users || []).filter(
    (user) => user.role === "admin" || user.role === "super-admin",
  );
  const kpiValues = [
    admins.length,
    admins.length,
    dash.stats.feedbackReceived,
    dash.stats.feedbackReceived,
  ];
  const kpis = Array.from(root.querySelectorAll(".adm-kpi"));
  kpis.forEach((kpi, i) => {
    const val = kpi.querySelector(".adm-kpi-value");
    if (val && kpiValues[i] != null) val.textContent = String(kpiValues[i]);
  });

  const table = root.querySelector(".adm-activity-table");
  const adminRows =
    admins.length > 0
      ? admins.map((user) => {
          const activity = (dash.activities || []).find(
            (row) => row.actorEmail?.toLowerCase() === user.email.toLowerCase(),
          );
          return {
            actorName: user.fullName,
            actorEmail: user.email,
            actorRole: user.role,
            type: activity?.type || "administrator",
            dateLabel: activity?.dateLabel || "—",
          };
        })
      : [];
  patchTableRows(table, adminRows, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    const nameEl = cells[0]?.querySelector(".adm-name");
    if (nameEl) nameEl.textContent = row.actorName || row.actorEmail;
    const roleEl = cells[1]?.querySelector(".adm-role");
    if (roleEl) roleEl.textContent = (row.actorRole || "admin").replace(/-/g, " ").toUpperCase();
    const actionEl = cells[2]?.querySelector(".adm-action");
    if (actionEl) actionEl.textContent = row.type.replace(/_/g, " ");
    const dateEl = cells[3]?.querySelector(".adm-date");
    if (dateEl) dateEl.textContent = row.dateLabel || "—";
    const statusEl = cells[4]?.querySelector(".adm-status");
    if (statusEl) {
      statusEl.textContent = "Active";
      statusEl.className = "adm-status active";
    }
  });
}

// ─── user header patch shared by sub-detail pages (ereg32, eorga35, etc.) ───

async function hydrateSubDetailUserHeader() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || params.get("userId");
  if (!id) return;
  const data = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`);
  if (!data?.user) return;
  const user = data.user;
  setText("user-name", user.fullName);
  setText("user-email", user.email);
  const initials = document.getElementById("user-initials");
  if (initials) {
    const parts = user.fullName.trim().split(/\s+/);
    initials.textContent = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
  }
  // fix back-links to carry the id
  document.querySelectorAll<HTMLAnchorElement>("a#info-back, a.info-back").forEach((a) => {
    if (a.href && !a.href.includes("?id=")) {
      a.href = `/admin/info30?id=${encodeURIComponent(id)}`;
    }
  });
}

type ListedEvent = {
  id: string;
  title: string;
  status?: string;
  location?: string;
  startsAt?: string;
  organizerName?: string;
  organizerEmail?: string;
  department?: string;
};

function formatEventDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function patchEregTable(
  rows: Array<{
    title: string;
    organization: string;
    date: string;
    eventStatus: string;
    extra: string;
    href: string;
  }>,
) {
  const table = document.querySelector(".ereg-table");
  patchTableRows(table, rows, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = row.title;
    if (cells[2]) cells[2].textContent = row.organization;
    if (cells[3]) cells[3].textContent = row.date;
    if (cells[4]) cells[4].textContent = row.eventStatus;
    if (cells[5]) cells[5].textContent = row.extra;
    const link = tr.querySelector<HTMLAnchorElement>("a.ereg-view, a");
    if (link) link.href = row.href;
  });
}

async function hydrateUserEventTables(pageId: string) {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("id") || params.get("userId") || "";
  if (!userId) return;

  const userData = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(userId)}`);
  const email = userData?.user?.email || "";
  if (!email) return;

  const eventsPayload = await fetchJson<{ events: ListedEvent[] }>("/api/events?limit=200");
  const events = eventsPayload?.events || [];
  const eventById = new Map(events.map((event) => [event.id, event]));

  if (pageId === "ereg32") {
    const data = await fetchJson<{
      registrations: Array<{ eventId: string; eventTitle: string; status: string; createdAt: string }>;
    }>(`/api/user/registrations?email=${encodeURIComponent(email)}`);
    patchEregTable(
      (data?.registrations || []).map((row) => {
        const event = eventById.get(row.eventId);
        return {
          title: row.eventTitle || event?.title || "—",
          organization: event?.department || event?.organizerName || "—",
          date: formatEventDate(event?.startsAt || row.createdAt),
          eventStatus: (event?.status || "—").toUpperCase(),
          extra: (row.status || "registered").toUpperCase(),
          href: `/admin/regview33?id=${encodeURIComponent(userId)}&eventId=${encodeURIComponent(row.eventId)}`,
        };
      }),
    );
  }

  if (pageId === "eorga35") {
    const mine = events.filter(
      (event) =>
        event.organizerEmail?.toLowerCase() === email.toLowerCase() ||
        event.organizerName === userData?.user?.fullName,
    );
    patchEregTable(
      mine.map((event) => ({
        title: event.title,
        organization: event.department || event.organizerName || "—",
        date: formatEventDate(event.startsAt),
        eventStatus: (event.status || "—").toUpperCase(),
        extra: "ORGANIZER",
        href: `/admin/vorg36?userId=${encodeURIComponent(userId)}&eventId=${encodeURIComponent(event.id)}`,
      })),
    );
  }

  if (pageId === "esaved37") {
    const saved = await fetchJson<{ eventIds: string[] }>(
      `/api/user/saved-events?email=${encodeURIComponent(email)}`,
    );
    const ids = saved?.eventIds || [];
    patchEregTable(
      ids.map((eventId) => {
        const event = eventById.get(eventId);
        return {
          title: event?.title || "Saved event",
          organization: event?.department || event?.organizerName || "—",
          date: formatEventDate(event?.startsAt),
          eventStatus: (event?.status || "—").toUpperCase(),
          extra: "SAVED",
          href: `/admin/vsaved1?userId=${encodeURIComponent(userId)}&eventId=${encodeURIComponent(eventId)}`,
        };
      }),
    );
  }

  if (pageId === "eattend33") {
    const att = await fetchJson<{
      attendance: Array<{ eventId: string; eventTitle: string }>;
    }>(`/api/user/attendance?email=${encodeURIComponent(email)}`);
    const seen = new Set<string>();
    const rows = (att?.attendance || []).filter((row) => {
      if (!row.eventId || seen.has(row.eventId)) return false;
      seen.add(row.eventId);
      return true;
    });
    patchEregTable(
      rows.map((row) => {
        const event = eventById.get(row.eventId);
        return {
          title: row.eventTitle || event?.title || "—",
          organization: event?.department || event?.organizerName || "—",
          date: formatEventDate(event?.startsAt),
          eventStatus: (event?.status || "—").toUpperCase(),
          extra: "ATTENDED",
          href: `/admin/vattend34?id=${encodeURIComponent(userId)}&eventId=${encodeURIComponent(row.eventId)}`,
        };
      }),
    );
  }

  if (pageId === "cert38") {
    const certs = await fetchJson<{
      certificates: Array<{ id: string; name: string; eventName: string; dateIssued: string; downloadUrl?: string }>;
    }>(`/api/user/certificates?email=${encodeURIComponent(email)}`);
    patchChildren(document.querySelector(".cert-grid"), ".cert-card", certs?.certificates || [], (el, cert) => {
      const name = el.querySelector(".name, p.name");
      const eventName = el.querySelector(".event, p.event");
      if (name) name.textContent = cert.name || "Certificate";
      if (eventName) eventName.textContent = cert.eventName || "—";
      const link = el.querySelector<HTMLAnchorElement>("a");
      if (link && cert.downloadUrl) link.href = cert.downloadUrl;
    });
  }

  if (pageId === "fb39") {
    const fb = await fetchJson<{
      feedback: Array<{ id: string; title: string; type: string; eventName: string; createdAt: string }>;
    }>(`/api/user/feedback?mine=0&email=${encodeURIComponent(email)}`);
    const mine = (fb?.feedback || []);
    patchTableRows(document.querySelector("table"), mine, (tr, row) => {
      const cells = tr.querySelectorAll("td");
      if (cells[1]) cells[1].textContent = row.title || row.type;
      if (cells[2]) cells[2].textContent = row.eventName || "—";
      if (cells[3]) cells[3].textContent = formatEventDate(row.createdAt);
      const link = tr.querySelector<HTMLAnchorElement>("a");
      if (link) {
        link.href = `/admin/fbdeets01?id=${encodeURIComponent(row.id)}&userId=${encodeURIComponent(userId)}`;
      }
    });
  }
}

async function hydrateListp44() {
  const eventId = new URLSearchParams(window.location.search).get("id") || "";
  if (!eventId) return;
  const data = await fetchJson<{
    registrations: Array<{
      userName: string;
      studentNumber: string;
      course: string;
      status: string;
      email: string;
    }>;
  }>(`/api/user/registrations?eventId=${encodeURIComponent(eventId)}`);
  const rows = data?.registrations || [];
  patchTableRows(document.querySelector(".listp-table"), rows, (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[0]) cells[0].textContent = row.userName || row.email;
    if (cells[1]) cells[1].textContent = row.studentNumber || "—";
    if (cells[2]) cells[2].textContent = row.course || "—";
    if (cells[3]) cells[3].textContent = (row.status || "—").toUpperCase();
  });
  const first = rows[0];
  if (first) {
    setText("d-name", first.userName || first.email);
    setText("d-number", first.studentNumber || "—");
    setText("d-email", first.email);
    setText("d-course", first.course || "—");
  } else {
    setText("d-name", "—");
    setText("d-number", "—");
    setText("d-email", "—");
    setText("d-course", "—");
  }
}

async function hydrateManageCounts(pageId: string) {
  const role =
    pageId === "manages28" ? "student" : pageId === "managef29" ? "faculty" : "";
  const query = role ? `role=${encodeURIComponent(role)}&limit=200` : "limit=200";
  const data = await fetchJson<{ users: AdminUser[]; total?: number }>(
    `/api/admin/users?${query}`,
  );
  const users = data?.users || [];
  const n =
    pageId === "manageadmin"
      ? String(users.filter((user) => user.role === "admin" || user.role === "super-admin").length)
      : String(data?.total ?? users.length);
  document.querySelectorAll(".ms-count, .school-count, .stat-value, .count, .adm-kpi-value").forEach((el) => {
    if ((el.textContent || "").trim() === "50") el.textContent = n;
  });
}

/**
 * Wires remaining admin pages (users, profile, notifications, RFID, certs, reports)
 * to live Mongo APIs without restyling legacy markup.
 */
export function AdminOpsBridge() {
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
        if (root instanceof Element && root.getAttribute("data-dc-blanked") !== pageId) {
          hideLegacyDemoContent(root);
          root.setAttribute("data-dc-blanked", pageId);
        }
        if (pageId === "add40") wireAddUser();
        if (pageId === "school30") await hydrateSchoolDirectory(root);
        if (pageId === "manages28" || pageId === "managef29" || pageId === "manageadmin") {
          await hydrateManageCounts(pageId);
        }
        if (pageId === "info30") await hydrateUserInfo();
        if (pageId === "new41") await hydrateNew41();
        if (pageId === "perinfo31") await hydratePerinfo31();
        if (
          pageId === "vattend34" ||
          pageId === "regview33" ||
          pageId === "ereg32" ||
          pageId === "eorga35" ||
          pageId === "eattend33" ||
          pageId === "esaved37" ||
          pageId === "cert38" ||
          pageId === "fb39"
        ) {
          await hydrateSubDetailUserHeader();
          await hydrateUserEventTables(pageId);
        }
        if (pageId === "listp44") await hydrateListp44();
        if (pageId === "fbdeets01") await hydrateFbDeets01();
        if (pageId === "vorg36") await hydrateVorg36();
        if (pageId === "vsaved1" || pageId === "vattend34" || pageId === "regview33") {
          await hydrateVsaved1();
        }
        if (pageId === "administration") await hydrateAdministration(root);
        if (pageId === "profile") await hydrateAdminProfile();
        if (pageId === "notif1") await hydrateAdminNotifications();
        if (pageId === "rfid17") await hydrateRfid();
        if (pageId === "certdeets46" || pageId === "fulld46") await hydrateCertificateDetails();
        if (pageId === "report51" || pageId === "reportgen53") wireReportsDownload();
        if (pageId === "user27") wireUser27Views(root);
        wireLiveSearch(root);
      } catch {
        /* keep static markup */
      }
    };

    const t1 = window.setTimeout(() => void run(), 80);
    const t2 = window.setTimeout(() => void run(), 400);
    const poll = window.setInterval(() => void run(), 12000);
    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(poll);
    };
  }, [pathname, searchParams]);

  return null;
}
