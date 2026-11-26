"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  hideLegacyDemoContent,
  patchChildren,
  patchTableRows,
  ensureEventsFooterAtBottom,
  setNotifEmptyState,
  setLegacyHidden,
} from "@/lib/legacy-dom-patch";
import { startSmartPoll } from "@/lib/client/smart-poll";
import { attachTablePager } from "@/lib/client/table-pager";
import {
  courseCode,
  courseLabel,
  humanizeCode,
  organizationRoleCode,
  roleLabel,
  schoolCode,
  schoolLabel,
} from "@/lib/labels/academic";

function pageIdFromPath(pathname: string) {
  if (!pathname.startsWith("/admin")) return "";
  if (pathname === "/admin") return "login02";
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
  photoUrl?: string;
  createdAt?: string;
  lastLoginAt?: string;
};

/** Participant "Account Status" card: real created / last login / last active. */
function fillAccountStatus(user: AdminUser) {
  const card = Array.from(document.querySelectorAll<HTMLElement>(".status-list, section")).find((el) =>
    /account status/i.test(el.querySelector("h3")?.textContent || ""),
  );
  if (!card) return;
  const fmtDate = (iso?: string) => {
    const date = iso ? new Date(iso) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "—";
  };
  const fmtDateTime = (iso?: string) => {
    const date = iso ? new Date(iso) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : "—";
  };
  card.querySelectorAll<HTMLElement>(".info-field").forEach((field) => {
    const label = (field.querySelector(".label")?.textContent || "").trim().toLowerCase();
    const value = field.querySelector<HTMLElement>(".value");
    if (!value) return;
    if (label.includes("created")) value.textContent = fmtDate(user.createdAt);
    else if (label.includes("last login")) value.textContent = fmtDateTime(user.lastLoginAt);
    else if (label.includes("last active")) value.textContent = user.lastLoginAt ? formatWhen(user.lastLoginAt) : "—";
  });
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    /* offline, dev restart, aborted navigation — keep legacy markup */
    return null;
  }
}

function ensureMakeAdminOverlay(): HTMLElement | null {
  let overlay = document.getElementById("make-admin-overlay");
  if (overlay) return overlay;

  const template = document.getElementById("delete-account-overlay");
  if (!template) return null;

  overlay = template.cloneNode(true) as HTMLElement;
  overlay.id = "make-admin-overlay";
  overlay.setAttribute("aria-labelledby", "make-admin-title");
  overlay.hidden = true;
  overlay.setAttribute("hidden", "");
  overlay.innerHTML = overlay.innerHTML.replace(/delete_account/g, "make_admin");

  const idMap: Record<string, string> = {
    "delete-account-title": "make-admin-title",
    "delete-account-back": "make-admin-back",
    "delete-account-yes": "make-admin-yes",
  };
  Object.entries(idMap).forEach(([from, to]) => {
    overlay!.querySelector(`#${from}`)?.setAttribute("id", to);
  });
  const messageEl = overlay.querySelector(".delete-message");
  if (messageEl) messageEl.id = "make-admin-message";

  template.insertAdjacentElement("afterend", overlay);
  return overlay;
}

function openMakeAdminConfirmModal(options: {
  title: string;
  message: string;
  confirmLabel: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    ensureMakeAdminOverlay();
    const overlay = document.getElementById("make-admin-overlay");
    const titleEl = document.getElementById("make-admin-title");
    const messageEl = document.getElementById("make-admin-message");
    const yesBtn = document.getElementById("make-admin-yes");
    const backBtn = document.getElementById("make-admin-back");
    if (!overlay || !titleEl || !messageEl || !yesBtn || !backBtn) {
      resolve(window.confirm(`${options.title}\n\n${options.message}`));
      return;
    }

    titleEl.textContent = options.title;
    messageEl.textContent = options.message;
    yesBtn.textContent = options.confirmLabel;

    const cleanup = () => {
      overlay.hidden = true;
      overlay.setAttribute("hidden", "");
      document.body.classList.remove("delete-modal-open");
      yesBtn.removeEventListener("click", onYes);
      backBtn.removeEventListener("click", onBack);
      overlay.removeEventListener("click", onBackdrop);
    };

    const onYes = (event: Event) => {
      event.preventDefault();
      cleanup();
      resolve(true);
    };
    const onBack = (event: Event) => {
      event.preventDefault();
      cleanup();
      resolve(false);
    };
    const onBackdrop = (event: Event) => {
      if (event.target === overlay) onBack(event);
    };

    yesBtn.addEventListener("click", onYes);
    backBtn.addEventListener("click", onBack);
    overlay.addEventListener("click", onBackdrop);

    overlay.hidden = false;
    overlay.removeAttribute("hidden");
    document.body.classList.add("delete-modal-open");
    yesBtn.focus();
  });
}

function wireAddUser() {
  const form = document.getElementById("add-user-form") as HTMLFormElement | null;
  if (!form || form.dataset.dcWired === "1") return;
  form.dataset.dcWired = "1";
  const overlay = document.getElementById("confirm-overlay");
  const confirmBtn = document.getElementById("confirm-create");
  const backBtn = document.getElementById("confirm-back");
  const fromManageAdmin =
    new URLSearchParams(window.location.search).get("from") === "manageadmin";

  // Super Admin creating Admin / Super Admin accounts — inject role picker
  if (fromManageAdmin && !form.querySelector("#account-role")) {
    const field = document.createElement("div");
    field.className = "add-field";
    field.innerHTML = `
      <label for="account-role">Account Role</label>
      <select id="account-role" name="role" required>
        <option value="" selected disabled>Select account role</option>
        <option value="admin">Admin</option>
        <option value="super-admin">Super Admin</option>
      </select>
    `;
    const emailField = form.querySelector("#email")?.closest(".add-field, .field");
    if (emailField?.parentElement) {
      emailField.parentElement.insertBefore(field, emailField);
    } else {
      form.insertBefore(field, form.firstChild);
    }
    const idLabel = form.querySelector('label[for="id-number"]');
    if (idLabel) idLabel.textContent = "Employee Number";
    const title = document.querySelector("h1, .page-title, .stu-title");
    if (title && /add user/i.test(title.textContent || "")) {
      title.textContent = "Create Administrator Account";
    }
  }

  const collect = () => {
    const data = new FormData(form);
    const orgRole = String(data.get("orgRole") || "").trim();
    const orgPosition = String(data.get("orgPosition") || "").trim();
    const selectedRole = String(data.get("role") || "").trim().toLowerCase();
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
      role: fromManageAdmin
        ? selectedRole === "super-admin"
          ? "super-admin"
          : "admin"
        : "faculty",
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
        role: payload.role,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to create user.");
    window.alert(data.message || "User created.");
    window.location.assign(
      fromManageAdmin ? "/admin/manageadmin?from=administration" : "/admin/user27",
    );
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
  const fromManages28 = params.get("from") === "manages28";
  const fromManagef29 = params.get("from") === "managef29";
  const query = new URLSearchParams();
  if (school) query.set("school", school);
  if (role) query.set("role", role);
  query.set("limit", "200");
  const data = await fetchJson<{ users: AdminUser[]; total?: number }>(
    `/api/admin/users?${query.toString()}`,
  );
  if (!data?.users) return;

  const schoolLabels: Record<string, string> = {
    sase: "School of Accountancy, Science, and Education (SASE)",
    scemc: "School of Computing, Engineering, Multimedia, and Communication (SCEMC)",
    // legacy key kept so old ?school=scmcs links still resolve
    scmcs: "School of Computing, Engineering, Multimedia, and Communication (SCEMC)",
    snahs: "School of Nursing and Allied Health Studies (SNAHS)",
    smls: "School of Medical Laboratory Sciences (SMLS)",
    sihtm: "School of International Hospitality, Tourism, and Management (SIHTM)",
  };
  const schoolName = document.getElementById("school-name");
  if (schoolName && school) {
    schoolName.textContent = schoolLabels[school.toLowerCase()] || school.toUpperCase();
  }

  const countLabel = document.querySelector<HTMLElement>(".stu-count-label");
  if (countLabel && (role === "admin" || role === "admins")) {
    const icon = countLabel.querySelector("svg");
    countLabel.textContent = "Admins";
    if (icon) countLabel.appendChild(icon);
  } else if (countLabel && role === "faculty") {
    const icon = countLabel.querySelector("svg");
    countLabel.textContent = "Faculty";
    if (icon) countLabel.appendChild(icon);
  }

  const allUsers = data.users;
  const cacheKey = `${school}:${role}:${fromManages28 ? "m28" : fromManagef29 ? "f29" : "default"}`;
  (root as HTMLElement).dataset.dcSchoolUsersKey = cacheKey;

  const renderUsers = (users: AdminUser[]) => {
    const count = document.getElementById("school-count") || document.querySelector(".stu-count-num");
    if (count) count.textContent = String(users.length);

    const table = root.querySelector("table");
    patchTableRows(table, users, (tr, user) => {
      const cells = tr.querySelectorAll("td");
      if (cells[1]) cells[1].textContent = user.fullName;
      if (cells[2]) cells[2].textContent = user.studentNumber || "—";
      if (cells[3]) cells[3].textContent = courseLabel(user.course) || "—";
      if (cells[4]) cells[4].textContent = user.organizationPart || "—";
      const pill = cells[5]?.querySelector(".role-pill");
      if (pill) {
        pill.textContent = (user.role || "student").replace(/-/g, " ").toUpperCase();
        pill.className = `role-pill ${rolePillClass(user.role)}`;
      }
      const link = tr.querySelector<HTMLAnchorElement>("a.view-btn");
      if (link) link.href = `/admin/info30?id=${encodeURIComponent(user.id)}`;
    });
  };

  renderUsers(allUsers);

  if (fromManages28 || fromManagef29 || role === "student" || role === "faculty") {
    wireSchool30UserFilter(root, () => allUsers, renderUsers, role);
  }
}

const NEW_USER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function matchesSchoolUserFilter(user: AdminUser, filter: string, directoryRole = "") {
  const userRole = (user.role || "").toLowerCase();
  const orgRole = (user.organizationRole || "").toLowerCase();
  if (filter === "admins") {
    return userRole === "admin" || userRole === "super-admin";
  }
  if (filter === "officers") {
    if (directoryRole === "faculty") {
      return orgRole.includes("officer") || userRole === "organizer";
    }
    return (
      userRole === "faculty" ||
      userRole === "organizer" ||
      orgRole.includes("officer")
    );
  }
  if (filter === "newly") {
    if (!user.createdAt) return false;
    const created = new Date(user.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    return Date.now() - created.getTime() <= NEW_USER_WINDOW_MS;
  }
  return true;
}

function wireSchool30UserFilter(
  root: Element,
  getUsers: () => AdminUser[],
  renderUsers: (users: AdminUser[]) => void,
  directoryRole = "",
) {
  const wrap = root.querySelector(".stu-filter-wrap");
  if (!wrap || !(wrap instanceof HTMLElement) || wrap.dataset.dcWired === "1") return;
  wrap.dataset.dcWired = "1";

  const btn = wrap.querySelector(".filter-btn");
  const menu = wrap.querySelector(".stu-filter-menu");
  if (!(btn instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) return;

  let activeFilter = "";

  const closeMenu = () => {
    wrap.classList.remove("open");
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = !wrap.classList.contains("open");
    document.querySelectorAll(".stu-filter-wrap.open").forEach((other) => {
      if (other !== wrap) other.classList.remove("open");
    });
    wrap.classList.toggle("open", willOpen);
    menu.hidden = !willOpen;
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  menu.querySelectorAll<HTMLButtonElement>("[data-user-filter]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = item.getAttribute("data-user-filter") || "";
      activeFilter = activeFilter === next ? "" : next;
      menu.querySelectorAll("[data-user-filter]").forEach((node) => {
        node.classList.toggle("active", node === item && activeFilter === next);
      });
      const filtered = activeFilter
        ? getUsers().filter((user) =>
            matchesSchoolUserFilter(user, activeFilter, directoryRole),
          )
        : getUsers();
      renderUsers(filtered);
      closeMenu();
    });
  });

  document.addEventListener("click", (event) => {
    if (!wrap.contains(event.target as Node)) closeMenu();
  });
}

function applyParticipantAttendanceSummary(
  summary?: {
    attendanceCompleted?: number;
    lateRecords?: number;
    undertimeRecords?: number;
    absences?: number;
    attendanceRate?: number;
  } | null,
) {
  const card = document.getElementById("participant-attendance-summary");
  if (!card || !summary) return;

  const values: Record<string, number> = {
    "attendance completed": Number(summary.attendanceCompleted || 0),
    "late records": Number(summary.lateRecords || 0),
    "undertime records": Number(summary.undertimeRecords || 0),
    absences: Number(summary.absences || 0),
  };

  card.querySelectorAll(".stat-tile").forEach((tile) => {
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
  const donut = card.querySelector(".donut");
  const donutLabel = donut?.querySelector("span") || donut;
  if (donutLabel) donutLabel.textContent = `${rate}%`;
  if (donut instanceof HTMLElement) {
    donut.setAttribute("aria-label", `Attendance rate ${rate} percent`);
    // Support both conic-gradient donuts and CSS variable rings.
    const style = donut.getAttribute("style") || "";
    if (/conic-gradient|---|percent|rate/i.test(style) || donut.style.getPropertyValue("--value")) {
      donut.style.setProperty("--value", String(rate));
      donut.style.setProperty("--percent", String(rate));
    }
    if (/conic-gradient/i.test(getComputedStyle(donut).backgroundImage) || style.includes("conic")) {
      donut.style.backgroundImage = `conic-gradient(#448aff 0 ${rate}%, #e8eef7 ${rate}% 100%)`;
    }
  }
}

type AccountControls = {
  permissions?: Record<string, boolean>;
  suspended?: boolean;
  adminPermissions?: Record<string, boolean> | null;
};

/** "Admin Actions" toggle label → saved permission key. */
const USER_SWITCHES: Record<string, string> = {
  "Join Events": "joinEvents",
  "Events Organized Page": "eventsOrganizedPage",
  "Create Events": "createEvents",
  "Edit Events": "editEvents",
  "Invite someone": "inviteSomeone",
  "See who attended": "seeWhoAttended",
  "Review files submitted": "reviewFilesSubmitted",
  "Review attendance status": "reviewAttendanceStatus",
};

function setToggle(btn: HTMLElement, on: boolean) {
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
}

async function patchUser(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Unable to save changes.");
  return payload;
}

function permissionKeyFromLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Persist the user page "Admin Actions" (participant switches, Suspend,
 * Delete) and the Super Admin "System Permissions" checklist. Clicks are
 * intercepted in the capture phase so the legacy visual-only handlers
 * never flip a switch the server rejected.
 */
function wireAccountControls(id: string, user: AdminUser & AccountControls, viewerIsSuper: boolean) {
  const panel = document.getElementById("participant-actions");
  const targetIsAdmin = user.role === "admin" || user.role === "super-admin";
  const canEdit = !targetIsAdmin || viewerIsSuper;

  // Reflect saved state.
  panel?.querySelectorAll<HTMLElement>(".toggle[aria-label]").forEach((btn) => {
    const key = USER_SWITCHES[btn.getAttribute("aria-label") || ""];
    if (key) setToggle(btn, user.permissions?.[key] !== false);
  });
  document
    .querySelectorAll<HTMLElement>('.toggle[aria-label="Suspend Account"]')
    .forEach((btn) => setToggle(btn, user.suspended === true));
  const statusValue = document.getElementById("account-status-value");
  if (statusValue) statusValue.textContent = user.suspended ? "Suspended" : "Active";

  const permsSection = document.getElementById("admin-system-permissions");
  const showPerms = viewerIsSuper && user.role === "admin";
  if (permsSection) permsSection.hidden = !showPerms;
  if (showPerms) {
    document.querySelectorAll<HTMLInputElement>("#perms-list .perm-check").forEach((check) => {
      const label = check.closest(".perm-row")?.querySelector(".perm-label")?.textContent || "";
      const key = permissionKeyFromLabel(label);
      // No saved permissions yet = full access (matches the server default).
      check.checked = user.adminPermissions ? user.adminPermissions[key] !== false : true;
      const status = check.closest(".perm-row")?.querySelector(".perm-status");
      if (status) {
        status.textContent = check.checked ? "ALLOWED" : "NOT ALLOWED";
        status.classList.toggle("denied", !check.checked);
        status.classList.toggle("allowed", check.checked);
      }
    });
  }

  if (document.body.dataset.dcAccountControls === id) return;
  document.body.dataset.dcAccountControls = id;

  document.addEventListener(
    "click",
    async (event) => {
      const target = event.target as Element | null;
      const btn = target?.closest<HTMLElement>("#participant-actions .toggle[aria-label]");
      const delYes = target?.closest<HTMLElement>("#delete-account-yes");
      if (!btn && !delYes) return;

      if (delYes) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!canEdit) {
          window.alert("Only a Super Admin can delete administrator accounts.");
          return;
        }
        const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          window.alert(payload.error || "Unable to delete account.");
          return;
        }
        window.alert(`${user.fullName}'s account was deleted.`);
        window.location.assign("/admin/user27");
        return;
      }

      const label = btn!.getAttribute("aria-label") || "";
      if (label === "Make Admin") return; // handled by the Make Admin wiring
      const key = USER_SWITCHES[label];
      if (!key && label !== "Suspend Account") return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (!canEdit) {
        window.alert("Only a Super Admin can change administrator accounts.");
        return;
      }
      const next = !btn!.classList.contains("on");
      setToggle(btn!, next);
      try {
        if (label === "Suspend Account") {
          await patchUser(id, { suspended: next });
          if (statusValue) statusValue.textContent = next ? "Suspended" : "Active";
        } else {
          await patchUser(id, { permissions: { [key]: next } });
        }
      } catch (error) {
        setToggle(btn!, !next);
        window.alert(error instanceof Error ? error.message : "Unable to save changes.");
      }
    },
    true,
  );

  // System Permissions: save the whole checklist after any change (incl. Allow All).
  let permsTimer: number | undefined;
  const savePerms = () => {
    window.clearTimeout(permsTimer);
    permsTimer = window.setTimeout(async () => {
      const map: Record<string, boolean> = {};
      document.querySelectorAll<HTMLInputElement>("#perms-list .perm-check").forEach((check) => {
        const label = check.closest(".perm-row")?.querySelector(".perm-label")?.textContent || "";
        const key = permissionKeyFromLabel(label);
        if (key) map[key] = check.checked;
      });
      try {
        await patchUser(id, { adminPermissions: map });
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Unable to save permissions.");
      }
    }, 400);
  };
  if (showPerms) {
    document.getElementById("perms-list")?.addEventListener("change", savePerms);
    document.getElementById("perms-allow-all")?.addEventListener("click", savePerms);
  }
}

async function hydrateUserInfo() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;
  const data = await fetchJson<{
    user: AdminUser;
    attendanceSummary?: {
      attendanceCompleted: number;
      lateRecords: number;
      undertimeRecords: number;
      absences: number;
      attendanceRate: number;
    };
  }>(`/api/admin/users/${encodeURIComponent(id)}`);
  if (!data?.user) return;
  const user = data.user;
  const nameEl = document.getElementById("user-name");
  const emailEl = document.getElementById("user-email");
  if (nameEl) nameEl.textContent = user.fullName;
  if (emailEl) emailEl.textContent = user.email;
  setInput("field-name", user.fullName);
  setInput("field-number", user.studentNumber || "");
  setInput("field-email", user.email);
  setInput("field-course", courseLabel(user.course));
  setInput("field-school", schoolLabel(user.school));
  setInput("field-org", user.organizationPart || "");
  const orgRole = String(user.organizationRole || "");
  const [rolePart, posPart] = orgRole.includes(":") ? orgRole.split(":") : [orgRole, ""];
  setInput("field-org-role", roleLabel(rolePart));
  setInput("field-org-pos", humanizeCode(posPart));
  ensureRfidProfileField(user, false);
  fillAccountStatus(user);

  applyParticipantAttendanceSummary(data.attendanceSummary);

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
        const confirmed = await openMakeAdminConfirmModal(
          nextRole === "admin"
            ? {
                title: "Make Admin?",
                message: `Are you sure you want to grant Admin access to ${user.fullName}? They will be able to manage events, users, and campus operations.`,
                confirmLabel: "Yes, make admin",
              }
            : {
                title: "Remove Admin?",
                message: `Are you sure you want to remove Admin access from ${user.fullName}? They will lose administrator privileges.`,
                confirmLabel: "Yes, remove admin",
              },
        );
        if (!confirmed) return;
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

  wireAccountControls(id, user as AdminUser & AccountControls, viewerIsSuper);

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
    const orgRoleValue = organizationRoleCode((document.getElementById("field-org-role") as HTMLInputElement | null)?.value);
    const orgPos = (document.getElementById("field-org-pos") as HTMLInputElement | null)?.value || "";
    const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: parts[0] || user.firstName,
        lastName: parts.slice(1).join(" ") || user.lastName,
        studentNumber: (document.getElementById("field-number") as HTMLInputElement | null)?.value,
        email: (document.getElementById("field-email") as HTMLInputElement | null)?.value,
        course: courseCode((document.getElementById("field-course") as HTMLInputElement | null)?.value),
        school: schoolCode((document.getElementById("field-school") as HTMLInputElement | null)?.value),
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
  const fullName =
    profile.fullName?.trim() ||
    `${profile.firstName || ""} ${profile.lastName || ""}`.trim() ||
    profile.email;

  const identity = document.querySelector(".profile-identity");
  const title = identity?.querySelector("h1");
  const studentNo = identity?.querySelector(".student-no");
  const email = identity?.querySelector(".email");
  if (title) title.textContent = fullName;
  if (studentNo) studentNo.textContent = `STUDENT NUMBER: ${profile.studentNumber || "—"}`;
  if (email) email.textContent = profile.email;
  const role = document.getElementById("profile-account-role");
  if (role) role.textContent = roleLabel(profile.role || "admin");

  const metaItem = document.querySelector(".profile-meta-item");
  if (metaItem) {
    const paragraphs = metaItem.querySelectorAll("p");
    if (paragraphs[0]) paragraphs[0].textContent = courseLabel(profile.course) || "—";
    if (paragraphs[1]) paragraphs[1].textContent = schoolLabel(profile.school) || "—";
  }

  const approvedBy = document.getElementById("profile-approved-by-value");
  const approvedLabel = document.getElementById("profile-approved-by-label");
  if (profile.role === "super-admin") {
    if (approvedBy) approvedBy.textContent = "—";
    if (approvedLabel) approvedLabel.hidden = true;
    if (approvedBy) approvedBy.hidden = true;
  } else {
    if (approvedLabel) approvedLabel.hidden = false;
    if (approvedBy) {
      approvedBy.hidden = false;
      approvedBy.textContent = "Super Admin";
    }
  }

  document.querySelectorAll<HTMLElement>(".user-card, #user-menu-toggle").forEach((card) => {
    const strong = card.querySelector(".user-meta strong");
    const span = card.querySelector(".user-meta span");
    if (strong) strong.textContent = fullName;
    if (span) span.textContent = profile.email;
    const avatar = card.querySelector<HTMLElement>(".user-avatar");
    if (avatar && profile.photoUrl) {
      avatar.style.backgroundImage = `url("${profile.photoUrl}")`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
      avatar.classList.add("has-photo");
      avatar.textContent = "";
    }
  });

  // The admin profile page's circle is #profile-avatar-preview (older pages: #profile-avatar).
  const profileAvatar =
    document.getElementById("profile-avatar-preview") || document.getElementById("profile-avatar");
  if (profileAvatar instanceof HTMLElement) {
    if (profile.photoUrl) {
      profileAvatar.style.backgroundImage = `url("${profile.photoUrl}")`;
      profileAvatar.style.backgroundSize = "cover";
      profileAvatar.style.backgroundPosition = "center";
      profileAvatar.classList.add("is-photo");
      profileAvatar.textContent = "";
    } else {
      paintInitialsAvatar(profileAvatar, fullName, 26);
    }
  }

  const dash = await fetchJson<{
    activities: Array<{ dateLabel: string; type: string; targetTitle: string; actorEmail: string }>;
  }>("/api/admin/dashboard");
  const mine = (dash?.activities || []).filter(
    (row) => !row.actorEmail || row.actorEmail === profile.email,
  );
  patchTableRows(document.querySelector(".activity-table"), mine.slice(0, 8), (tr, row) => {
    const cells = tr.querySelectorAll("td");
    if (cells[0]) cells[0].textContent = row.dateLabel || "—";
    if (cells[1]) cells[1].textContent = row.targetTitle || humanizeActivityType(row.type);
  });

  // "Account Summary": this admin's real counts (the design shipped 20 / 3 / 0).
  const summary = await fetchJson<{
    eventsApproved: number;
    usersAdded: number;
    reportsExported: number;
    passwordChangedAt?: string;
  }>(
    "/api/admin/me/summary",
  );
  document.querySelectorAll(".summary-list li").forEach((li) => {
    const label = (li.querySelector("span")?.textContent || "").toLowerCase();
    const val = li.querySelector(".val");
    if (!val) return;
    if (!summary) val.textContent = "—";
    else if (label.includes("events approved")) val.textContent = String(summary.eventsApproved);
    else if (label.includes("users added")) val.textContent = String(summary.usersAdded);
    else if (label.includes("reports exported")) val.textContent = String(summary.reportsExported);
  });

  // "Last Password Change": the design shipped the word "Date" here.
  document.querySelectorAll(".security-row").forEach((row) => {
    if (!/last password change/i.test(row.textContent || "")) return;
    const sub = row.querySelector(".security-sub");
    if (!sub) return;
    const at = summary?.passwordChangedAt ? new Date(summary.passwordChangedAt) : null;
    sub.textContent =
      at && !Number.isNaN(at.getTime())
        ? at.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : summary
          ? "Not changed yet"
          : "—";
  });
}

/** "event_approved" → "Event approved". */
function humanizeActivityType(type: string) {
  const text = String(type || "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}

function ensureUnreadDot(host: HTMLElement) {
  let dot = host.querySelector<HTMLElement>(".notif-unread-dot");
  if (!dot) {
    dot = document.createElement("span");
    dot.className = "notif-unread-dot";
    dot.setAttribute("aria-hidden", "true");
    host.appendChild(dot);
  }
  return dot;
}

function notifBellTargets(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'a.icon-btn[href*="/admin/notif"], a.notif-bell[href*="/admin/notif"]',
    ),
  );
}

function setAdminNotifBadge(unreadCount: number) {
  const hasUnread = unreadCount > 0;
  for (const el of notifBellTargets()) {
    el.classList.toggle("has-unread", hasUnread);
    const dot = ensureUnreadDot(el);
    dot.hidden = !hasUnread;
    if (hasUnread) {
      el.setAttribute("data-unread-count", String(unreadCount));
      el.setAttribute(
        "aria-label",
        unreadCount === 1
          ? "Notifications, 1 unread"
          : `Notifications, ${unreadCount} unread`,
      );
    } else {
      el.removeAttribute("data-unread-count");
      el.setAttribute("aria-label", "Notifications");
    }
  }
}

async function updateAdminNotifBadge() {
  const data = await fetchJson<{
    notifications: Array<{ read: boolean }>;
  }>("/api/user/notifications");
  if (!data?.notifications) return;
  const unread = data.notifications.filter((n) => !n.read).length;
  setAdminNotifBadge(unread);
}

async function markAdminNotificationRead(id: string) {
  await fetch("/api/user/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id, read: true }),
  });
}

function wireAdminNotificationClicks() {
  const list = document.getElementById("notif-list");
  if (!list || list.dataset.dcNotifWired === "1") return;
  list.dataset.dcNotifWired = "1";
  list.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest('input[type="checkbox"]')) return;
    const item = target?.closest<HTMLElement>("article.notif-item");
    if (!item || !list.contains(item)) return;
    const id = item.dataset.notifId;
    if (!id || !item.classList.contains("unread")) return;
    item.classList.remove("unread");
    void markAdminNotificationRead(id).then(() => void updateAdminNotifBadge());
  });
}

let adminNotifTab: "general" | "archived" | "reminders" = "general";

async function markAllAdminNotificationsRead() {
  await fetch("/api/user/notifications", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ markAllRead: true }),
  });
}

function wireAdminNotificationTabs() {
  document.querySelectorAll<HTMLButtonElement>(".notif-tab").forEach((tab) => {
    if (tab.dataset.dcNotifTabWired === "1") return;
    tab.dataset.dcNotifTabWired = "1";
    tab.addEventListener("click", () => {
      const next = String(tab.dataset.tab || "general").toLowerCase();
      adminNotifTab =
        next === "archived" ? "archived" : next === "reminders" ? "reminders" : "general";
      document.querySelectorAll(".notif-tab").forEach((node) => {
        node.classList.toggle("active", node === tab);
      });
      void hydrateAdminNotifications();
    });
  });

  const panelHead = document.querySelector(".notif-panel-head");
  if (panelHead && !document.getElementById("dc-mark-all-read")) {
    const markAll = document.createElement("button");
    markAll.type = "button";
    markAll.id = "dc-mark-all-read";
    markAll.className = "notif-filter-btn";
    markAll.textContent = "Mark all read";
    markAll.style.marginLeft = "8px";
    markAll.addEventListener("click", () => {
      void markAllAdminNotificationsRead().then(() => void hydrateAdminNotifications());
    });
    panelHead.appendChild(markAll);
  }

  const markAllBtn = document.getElementById("dc-mark-all-read");
  if (markAllBtn && markAllBtn.dataset.dcMarkAllWired !== "1") {
    markAllBtn.dataset.dcMarkAllWired = "1";
  }
}

async function hydrateAdminNotifications() {
  wireAdminNotificationTabs();
  const list = document.getElementById("notif-list");
  if (!list) return;

  list.setAttribute("aria-busy", "true");
  try {
    const tabQuery = `/api/user/notifications?tab=${encodeURIComponent(adminNotifTab)}`;
    const [data, allRes] = await Promise.all([
      fetchJson<{
        notifications: Array<{ id: string; title: string; body: string; createdAt: string; read: boolean }>;
      }>(tabQuery),
      adminNotifTab === "general"
        ? Promise.resolve(null)
        : fetchJson<{ notifications: Array<{ read: boolean }> }>("/api/user/notifications?tab=general"),
    ]);
    if (!data || !Array.isArray(data.notifications)) return;

    const items = data.notifications.slice(0, 50);
    if (adminNotifTab === "general") {
      setAdminNotifBadge(items.filter((n) => !n.read).length);
    } else {
      const unreadGeneral = (allRes?.notifications || []).filter((n) => !n.read).length;
      setAdminNotifBadge(unreadGeneral);
    }

    patchChildren(list, "article.notif-item", items, (el, item) => {
      el.dataset.notifId = item.id;
      el.classList.toggle("unread", !item.read);
      el.style.cursor = "pointer";
      const title = el.querySelector(".title");
      const body = el.querySelector(".body");
      const when = el.querySelector("time.when");
      if (title) title.textContent = item.title;
      if (body) body.textContent = item.body;
      if (when) when.textContent = formatWhen(item.createdAt);
    });
    setNotifEmptyState(list, items.length === 0);
    wireAdminNotificationClicks();
  } finally {
    list.removeAttribute("aria-busy");
  }
}

const RFID_EVENT_STORAGE_KEY = "dc-rfid-event-id";
const RFID_EVENTS_CACHE_MS = 60_000;
let rfidScanEventId = "";
/** Desk mode for live RFID — explicit Tap In or Tap Out (no auto-toggle). */
let rfidScanMode: "in" | "out" = "in";
let rfidScannerWired = false;
let rfidEligibleCache: { events: RfidEventOption[]; fetchedAt: number } | null = null;
let rfidLiveInflight: Promise<void> | null = null;

type RfidEventOption = {
  id: string;
  title?: string;
  status: string;
  updatedAt?: string;
  startsAt?: string;
};

function rememberRfidEventId(eventId: string) {
  const id = eventId.trim();
  if (!id) return;
  rfidScanEventId = id;
  try {
    sessionStorage.setItem(RFID_EVENT_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(window.location.href);
    if (url.pathname.includes("/admin/rfid17") && url.searchParams.get("id") !== id) {
      url.searchParams.set("id", id);
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    /* ignore */
  }
}

async function listRfidEligibleEvents() {
  const now = Date.now();
  if (rfidEligibleCache && now - rfidEligibleCache.fetchedAt < RFID_EVENTS_CACHE_MS) {
    return rfidEligibleCache.events;
  }
  const catalog = await fetchJson<{ events?: RfidEventOption[] }>("/api/events?limit=200");
  const events = catalog?.events || [];
  const eligible = events.filter(
    (event) => event.status === "live" || event.status === "approved",
  );
  eligible.sort((a, b) => {
    const rank = (status: string) => (status === "live" ? 0 : 1);
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    return String(b.updatedAt || b.startsAt || "").localeCompare(
      String(a.updatedAt || a.startsAt || ""),
    );
  });
  rfidEligibleCache = { events: eligible, fetchedAt: now };
  return eligible;
}

async function resolveRfidEventId() {
  const query = new URLSearchParams(window.location.search);
  const fromQuery = (query.get("id") || query.get("eventId") || "").trim();
  const candidates = [fromQuery, rfidScanEventId];
  try {
    const stored = sessionStorage.getItem(RFID_EVENT_STORAGE_KEY) || "";
    if (stored) candidates.push(stored);
  } catch {
    /* ignore */
  }

  const eligible = await listRfidEligibleEvents();
  const eligibleIds = new Set(eligible.map((event) => event.id));

  // Prefer an explicit URL/session id only when it still exists in Mongo.
  for (const candidate of candidates) {
    const id = candidate.trim();
    if (!id) continue;
    if (eligibleIds.size === 0 || eligibleIds.has(id)) {
      rememberRfidEventId(id);
      return id;
    }
  }

  // Fall back to the newest live/approved event from Mongo (not a hardcoded id).
  if (eligible[0]?.id) {
    rememberRfidEventId(eligible[0].id);
    return eligible[0].id;
  }
  return "";
}

async function syncRfidEventPicker(_selectedId: string) {
  // Intentionally no visible picker — keep the original RFID layout clean.
  // Event resolution still happens via resolveRfidEventId() / URL / session.
  const existing = document.getElementById("dc-rfid-event-picker");
  if (existing) existing.remove();
}

function setRfidAlert(message: string, isError = false) {
  const alert = document.querySelector<HTMLElement>(".rfid-alert");
  if (!alert) return;
  alert.textContent = message;
  alert.style.color = isError ? "" : "";
  alert.hidden = !message;
}

function applyRfidModeUi() {
  const toggle = document.getElementById("dc-rfid-mode-toggle");
  if (!toggle) return;
  toggle.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
    const active = btn.dataset.mode === rfidScanMode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const tapPanel = document.querySelector(".tap-panel");
  if (tapPanel) {
    tapPanel.setAttribute("data-scan-mode", rfidScanMode);
  }
  const hint = document.getElementById("dc-rfid-mode-hint");
  if (hint) {
    hint.textContent =
      rfidScanMode === "in"
        ? "Mode: Tap In — scan to record entry"
        : "Mode: Tap Out — scan to record exit";
  }
}

function ensureRfidModeToggle() {
  let toggle = document.getElementById("dc-rfid-mode-toggle");
  if (!toggle) {
    toggle = document.createElement("div");
    toggle.id = "dc-rfid-mode-toggle";
    toggle.className = "dc-rfid-mode-toggle";
    toggle.setAttribute("role", "group");
    toggle.setAttribute("aria-label", "RFID scan mode");
    toggle.innerHTML =
      '<button type="button" class="dc-rfid-mode-btn" data-mode="in" aria-pressed="true">Tap In</button>' +
      '<button type="button" class="dc-rfid-mode-btn" data-mode="out" aria-pressed="false">Tap Out</button>' +
      '<p id="dc-rfid-mode-hint" class="dc-rfid-mode-hint"></p>';

    const tapPanel = document.querySelector(".tap-panel");
    const clock = document.querySelector(".clock-banner");
    if (tapPanel?.parentElement) {
      tapPanel.parentElement.insertBefore(toggle, tapPanel);
    } else if (clock?.parentElement) {
      clock.parentElement.insertBefore(toggle, clock.nextSibling);
    } else {
      const main =
        document.querySelector(".main-panel") ||
        document.querySelector(".rfid-main") ||
        document.body;
      main.appendChild(toggle);
    }
  }

  if (toggle.dataset.dcWired !== "1") {
    toggle.dataset.dcWired = "1";
    toggle.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
        "[data-mode]",
      );
      if (!btn) return;
      const mode = btn.dataset.mode === "out" ? "out" : "in";
      rfidScanMode = mode;
      applyRfidModeUi();
      setRfidAlert("");
      window.setTimeout(() => {
        document.getElementById("dc-rfid-scan-input")?.focus();
      }, 0);
    });
  }

  applyRfidModeUi();
}

function ensureRfidPopupStyles() {
  if (document.getElementById("dc-rfid-popup-style")) return;
  const style = document.createElement("style");
  style.id = "dc-rfid-popup-style";
  style.textContent = `
.dc-rfid-dup-overlay {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.dc-rfid-dup-overlay[hidden] { display: none !important; }
.dc-rfid-dup-dialog {
  width: min(420px, calc(100vw - 48px));
  background: #fff;
  border: 1px solid rgba(68, 138, 255, 0.16);
  border-radius: 16px;
  box-shadow: 0 12px 36px rgba(68, 138, 255, 0.16);
  padding: 36px 28px 28px;
  text-align: center;
}
.dc-rfid-dup-title {
  margin: 0 0 10px;
  color: #b1a483;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.35;
}
.dc-rfid-dup-text {
  margin: 0 0 24px;
  color: #b7aa89;
  font-size: 0.98rem;
  font-weight: 400;
  line-height: 1.55;
}
.dc-rfid-dup-ok {
  min-width: 120px;
  height: 42px;
  border: none;
  border-radius: 12px;
  background: #448aff;
  color: #fff;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}
.dc-rfid-dup-ok:hover { filter: brightness(1.04); }
`;
  document.head.appendChild(style);
}

function rfidPopupTitle(code?: string) {
  switch (String(code || "").toLowerCase()) {
    case "concurrent_event":
      return "Attending two events";
    case "rapid_consecutive":
      return "Multiple taps";
    case "duplicate_warning":
    case "duplicate_entry":
      return "Duplicate entry";
    case "unknown_rfid":
    case "ambiguous_rfid":
      return "Invalid RFID";
    default:
      return "Suspicious scan";
  }
}

/** Runs once when the RFID popup's OK is pressed (e.g. open Quick Register). */
let rfidPopupOnOk: (() => void) | null = null;

function showRfidDuplicatePopup(
  message = "Suspicious RFID activity was detected.",
  code?: string,
  options: { title?: string; okLabel?: string; onOk?: () => void } = {},
) {
  ensureRfidPopupStyles();
  rfidPopupOnOk = options.onOk ?? null;
  let overlay = document.getElementById("dc-rfid-dup-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "dc-rfid-dup-overlay";
    overlay.className = "dc-rfid-dup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "dc-rfid-dup-title");
    overlay.innerHTML =
      '<div class="dc-rfid-dup-dialog">' +
      '<p class="dc-rfid-dup-title" id="dc-rfid-dup-title">Suspicious scan</p>' +
      '<p class="dc-rfid-dup-text" id="dc-rfid-dup-text"></p>' +
      '<button type="button" class="dc-rfid-dup-ok" id="dc-rfid-dup-ok">OK</button>' +
      "</div>";
    document.body.appendChild(overlay);
    const close = () => {
      overlay?.setAttribute("hidden", "");
    };
    overlay.querySelector("#dc-rfid-dup-ok")?.addEventListener("click", () => {
      const next = rfidPopupOnOk;
      rfidPopupOnOk = null;
      close();
      next?.();
    });
    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;
      rfidPopupOnOk = null; // clicking outside just dismisses
      close();
    });
  }
  const title = overlay.querySelector("#dc-rfid-dup-title");
  if (title) title.textContent = options.title || rfidPopupTitle(code);
  const text = overlay.querySelector("#dc-rfid-dup-text");
  if (text) text.textContent = message;
  const okButton = overlay.querySelector("#dc-rfid-dup-ok");
  if (okButton) okButton.textContent = options.okLabel || "OK";
  overlay.removeAttribute("hidden");
  window.setTimeout(() => {
    overlay?.querySelector<HTMLButtonElement>("#dc-rfid-dup-ok")?.focus();
  }, 0);
}

function ensureQuickRegisterStyles() {
  ensureRfidPopupStyles();
  if (document.getElementById("dc-rfid-qr-style")) return;
  const style = document.createElement("style");
  style.id = "dc-rfid-qr-style";
  style.textContent = `
.dc-rfid-qr-dialog { text-align: left; padding: 28px 26px 24px; width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; }
.dc-rfid-qr-dialog .dc-rfid-dup-title { color: #1f3b73; text-align: center; }
.dc-rfid-qr-dialog .dc-rfid-dup-text { color: #5b6b86; text-align: center; margin-bottom: 18px; }
.dc-rfid-qr-card { font-weight: 700; color: #448aff; }
.dc-rfid-qr-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 420px) { .dc-rfid-qr-row { grid-template-columns: 1fr; } }
.dc-rfid-qr-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.dc-rfid-qr-field span { font-size: 12px; font-weight: 650; color: #1f3b73; }
.dc-rfid-qr-field input { height: 40px; border: 1px solid rgba(68,138,255,0.3); border-radius: 10px; padding: 0 12px; font: inherit; font-size: 14px; color: #1f2937; background: #fff; }
.dc-rfid-qr-field input:focus { outline: 2px solid rgba(68,138,255,0.35); border-color: #448aff; }
.dc-rfid-qr-consent { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; color: #374151; line-height: 1.45; margin: 4px 0 14px; cursor: pointer; }
.dc-rfid-qr-consent input { margin-top: 2px; width: 16px; height: 16px; flex-shrink: 0; }
.dc-rfid-qr-error { min-height: 18px; margin: 0 0 12px; color: #c62828; font-size: 13px; line-height: 1.4; }
.dc-rfid-qr-actions { display: flex; gap: 10px; justify-content: flex-end; }
.dc-rfid-qr-cancel { min-width: 100px; height: 42px; border-radius: 12px; border: 1px solid rgba(68,138,255,0.3); background: #fff; color: #448aff; font-size: 14px; font-weight: 650; cursor: pointer; }
.dc-rfid-qr-actions .dc-rfid-dup-ok[disabled] { opacity: 0.6; cursor: progress; }
`;
  document.head.appendChild(style);
}

/**
 * Quick Register on First Tap: an unknown card on Tap In opens this form.
 * Save creates the account (or links the card to an existing account),
 * registers the student for the event and records the tap-in in one step.
 */
function showRfidQuickRegister(rfidNumber: string) {
  ensureQuickRegisterStyles();
  document.getElementById("dc-rfid-qr-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "dc-rfid-qr-overlay";
  overlay.className = "dc-rfid-dup-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "dc-rfid-qr-title");
  overlay.innerHTML =
    '<form class="dc-rfid-dup-dialog dc-rfid-qr-dialog" id="dc-rfid-qr-form" novalidate>' +
    '<p class="dc-rfid-dup-title" id="dc-rfid-qr-title">Card not registered yet</p>' +
    '<p class="dc-rfid-dup-text">RFID <span class="dc-rfid-qr-card" id="dc-rfid-qr-card"></span> isn\'t linked to any student. ' +
    "Fill this in to create their account, link the card and tap them in.</p>" +
    '<div class="dc-rfid-qr-row">' +
    '<label class="dc-rfid-qr-field"><span>First name</span><input name="firstName" autocomplete="off" required /></label>' +
    '<label class="dc-rfid-qr-field"><span>Last name</span><input name="lastName" autocomplete="off" required /></label>' +
    "</div>" +
    '<label class="dc-rfid-qr-field"><span>Student number</span><input name="studentNumber" autocomplete="off" inputmode="numeric" required /></label>' +
    '<label class="dc-rfid-qr-field"><span>School email</span><input name="email" type="email" autocomplete="off" placeholder="name@sdca.edu.ph" required /></label>' +
    '<label class="dc-rfid-qr-consent"><input type="checkbox" name="privacyConsent" />' +
    "<span>The student agreed to the DC Space Data Privacy Notice (collection of their name, student number, email and attendance).</span></label>" +
    '<p class="dc-rfid-qr-error" id="dc-rfid-qr-error" role="alert"></p>' +
    '<div class="dc-rfid-qr-actions">' +
    '<button type="button" class="dc-rfid-qr-cancel" id="dc-rfid-qr-cancel">Cancel</button>' +
    '<button type="submit" class="dc-rfid-dup-ok" id="dc-rfid-qr-save">Save &amp; Tap In</button>' +
    "</div>" +
    "</form>";
  document.body.appendChild(overlay);

  const form = overlay.querySelector<HTMLFormElement>("#dc-rfid-qr-form")!;
  const errorEl = overlay.querySelector<HTMLElement>("#dc-rfid-qr-error")!;
  const saveBtn = overlay.querySelector<HTMLButtonElement>("#dc-rfid-qr-save")!;
  overlay.querySelector("#dc-rfid-qr-card")!.textContent = rfidNumber;

  const close = () => {
    overlay.remove();
    window.setTimeout(() => {
      (document.getElementById("dc-rfid-scan-input") as HTMLInputElement | null)?.focus();
    }, 0);
  };
  overlay.querySelector("#dc-rfid-qr-cancel")?.addEventListener("click", () => {
    close();
    setRfidAlert("Quick Register cancelled. Tap the card again to retry.", true);
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const field = (name: string) =>
      String((form.elements.namedItem(name) as HTMLInputElement | null)?.value || "").trim();
    const consent = Boolean(
      (form.elements.namedItem("privacyConsent") as HTMLInputElement | null)?.checked,
    );
    const payload = {
      eventId: rfidScanEventId,
      rfidNumber,
      firstName: field("firstName"),
      lastName: field("lastName"),
      studentNumber: field("studentNumber"),
      email: field("email").toLowerCase(),
      privacyConsent: consent,
    };
    if (!payload.firstName || !payload.lastName || !payload.studentNumber || !payload.email) {
      errorEl.textContent = "Fill in all fields.";
      return;
    }
    if (!consent) {
      errorEl.textContent = "Ask the student to agree to the Data Privacy Notice, then tick the box.";
      return;
    }
    errorEl.textContent = "";
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const res = await fetch("/api/admin/attendance/quick-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorEl.textContent = String(data.error || "Could not register this student.");
        return;
      }
      close();
      const user = data.user as Parameters<typeof applyRfidParticipantProfile>[0] | undefined;
      const scan = data.scan as { scannedAt?: string; participantName?: string; email?: string } | undefined;
      if (user?.name || user?.email) applyRfidParticipantProfile(user);
      setTapTimes(scan?.scannedAt || new Date().toISOString(), "");
      setRfidAlert(String(data.message || "Registered and tapped in."));
      const syncedEmail = String(user?.email || scan?.email || payload.email);
      window.requestAnimationFrame(() => {
        void refreshRfidUi({
          light: true,
          preserveProfileEmail: syncedEmail,
          applyLatestProfile: false,
        });
      });
    } catch {
      errorEl.textContent = "Network error. Check the connection and press Save again.";
    } finally {
      if (saveBtn.isConnected) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save & Tap In";
      }
    }
  });

  window.setTimeout(() => {
    form.querySelector<HTMLInputElement>('input[name="firstName"]')?.focus();
  }, 0);
}

function formatRfidClock(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // Match original tap-times design (00:00).
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function setTapTimes(tapInAt?: string, tapOutAt?: string) {
  const tapIn = document.getElementById("tap-in");
  const tapOut = document.getElementById("tap-out");
  // Placeholder dashes show the box is waiting for a tap time.
  if (tapIn) {
    const value = formatRfidClock(tapInAt);
    if (tapInAt === undefined && tapIn.dataset.lastIn && tapOutAt) {
      // Keep previous tap-in while updating tap-out only.
      tapIn.textContent = tapIn.dataset.lastIn;
      tapIn.classList.remove("is-blank");
    } else {
      tapIn.textContent = value || "--:--";
      tapIn.classList.toggle("is-blank", !value);
      if (value) tapIn.dataset.lastIn = value;
      else if (!tapOutAt) delete tapIn.dataset.lastIn;
    }
  }
  if (tapOut) {
    const value = formatRfidClock(tapOutAt);
    tapOut.textContent = value || "--:--";
    tapOut.classList.toggle("is-blank", !value);
  }
}

function applyRfidParticipantProfile(profile: {
  name?: string;
  email?: string;
  studentNumber?: string;
  course?: string;
  school?: string;
  organization?: string;
  organizationRole?: string;
  organizationPosition?: string;
  rfidNumber?: string;
  photoUrl?: string;
} | null) {
  const card =
    document.querySelector(".profile-card") ||
    document.querySelector("aside.profile-card");
  if (card instanceof HTMLElement) {
    card.classList.add("dc-profile-live");
    card.classList.remove("is-loading");
  }

  const profileName = document.querySelector(".profile-name");
  if (profileName) {
    profileName.textContent = profile?.name || "Waiting for RFID tap…";
  }

  const meta = document.querySelector(".profile-meta");
  if (meta) {
    const spans = meta.querySelectorAll("span");
    const values = [
      profile?.studentNumber || (profile?.rfidNumber ? `RFID ${profile.rfidNumber}` : ""),
      profile?.email || "",
      courseLabel(profile?.course),
      schoolLabel(profile?.school),
      profile?.organization || "",
      roleLabel(profile?.organizationRole),
      humanizeCode(profile?.organizationPosition),
    ];
    spans.forEach((span, index) => {
      span.textContent = values[index] ?? "";
    });
  }

  const avatar =
    document.querySelector<HTMLElement>(".profile-card .avatar") ||
    document.querySelector<HTMLElement>(".avatar");
  if (avatar) {
    if (profile?.photoUrl) {
      avatar.style.backgroundImage = `url("${profile.photoUrl}")`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
      avatar.classList.add("has-photo");
      avatar.textContent = "";
    } else {
      avatar.style.backgroundImage = "";
      avatar.classList.remove("has-photo");
      // Tapped participant without a photo: initials; waiting for a tap: empty.
      if (profile?.name) paintInitialsAvatar(avatar, profile.name, 26);
      else avatar.textContent = "";
    }
  }
}

function clearRfidDemoUi() {
  setTapTimes("", "");
  applyRfidParticipantProfile(null);
  setRfidAlert("");
}

type RfidLivePayload = {
  event?: { title?: string };
  latestScan?: {
    participantName: string;
    email: string;
    action: string;
    scannedAt: string;
    eventTitle?: string;
    rfidNumber?: string;
    studentNumber?: string;
    course?: string;
    school?: string;
    organization?: string;
    organizationRole?: string;
    organizationPosition?: string;
    photoUrl?: string;
  } | null;
  recentScans?: Array<{
    participantName: string;
    email: string;
    action: string;
    scannedAt: string;
    rfidNumber?: string;
    studentNumber?: string;
    course?: string;
  }>;
};

const RFID_EVENT_PLACEHOLDERS = new Set([
  "",
  "event name",
  "loading event…",
  "loading event...",
  "loading event",
]);

function isRfidEventTitlePlaceholder(value: string) {
  return RFID_EVENT_PLACEHOLDERS.has(value.trim().toLowerCase());
}

function setRfidEventTitle(title: string) {
  const nameEl = document.querySelector(".event-name");
  if (!nameEl) return;
  const next = title.trim();
  nameEl.textContent = next || "Loading event…";
}

function applyRfidLivePayload(
  data: RfidLivePayload | null,
  options?: {
    preserveProfileEmail?: string;
    /** Polls must leave the desk profile alone — only scan responses own it. */
    applyLatestProfile?: boolean;
  },
) {
  const eventTitle = data?.event?.title || data?.latestScan?.eventTitle || "";
  if (eventTitle) {
    setRfidEventTitle(eventTitle);
  } else {
    const nameEl = document.querySelector(".event-name");
    const current = (nameEl?.textContent || "").trim();
    if (!nameEl || isRfidEventTitlePlaceholder(current)) {
      setRfidEventTitle("Loading event…");
    }
  }

  const latest = data?.latestScan;
  const preserveEmail = (options?.preserveProfileEmail || "").trim().toLowerCase();
  const latestEmail = latest?.email.trim().toLowerCase() || "";
  const applyProfile = options?.applyLatestProfile === true;

  if (applyProfile) {
    if (latest && (!preserveEmail || latestEmail === preserveEmail)) {
      applyRfidParticipantProfile({
        name: latest.participantName,
        email: latest.email,
        studentNumber: latest.studentNumber,
        course: latest.course,
        school: latest.school,
        organization: latest.organization,
        organizationRole: latest.organizationRole,
        organizationPosition: latest.organizationPosition,
        rfidNumber: latest.rfidNumber,
        photoUrl: latest.photoUrl,
      });
    } else if (!preserveEmail && !latest) {
      applyRfidParticipantProfile(null);
      setTapTimes("", "");
    }
  }

  const emailForTimes = preserveEmail || (applyProfile ? latestEmail : "");
  if (emailForTimes) {
    const userScans = (data?.recentScans || []).filter(
      (row) => row.email.trim().toLowerCase() === emailForTimes,
    );
    const lastIn = userScans.find((row) => row.action === "in")?.scannedAt || "";
    const lastOut = userScans.find((row) => row.action === "out")?.scannedAt || "";
    if (lastIn || lastOut) {
      setTapTimes(lastIn, lastOut);
    } else if (applyProfile && latest && latestEmail === emailForTimes) {
      setTapTimes(
        latest.action === "in" ? latest.scannedAt : "",
        latest.action === "out" ? latest.scannedAt : "",
      );
    }
  }
}

async function applyRfidEventTitleHint(eventId: string) {
  const id = eventId.trim();
  if (!id) return;
  const nameEl = document.querySelector(".event-name");
  if (!nameEl) return;
  if (!isRfidEventTitlePlaceholder(nameEl.textContent || "")) return;

  // Prefer Mongo event list (already loaded for eligibility), then lean event GET.
  try {
    const eligible = await listRfidEligibleEvents();
    const match = eligible.find((event) => event.id === id);
    if (match?.title) {
      setRfidEventTitle(match.title);
      return;
    }
  } catch {
    /* ignore */
  }

  const data = await fetchJson<{ event?: { title?: string } }>(
    `/api/events/${encodeURIComponent(id)}`,
  );
  if (data?.event?.title) {
    setRfidEventTitle(data.event.title);
  }
}

async function refreshRfidUi(options?: {
  light?: boolean;
  preserveProfileEmail?: string;
  applyLatestProfile?: boolean;
}) {
  const eventId = rfidScanEventId || (await resolveRfidEventId());
  if (!eventId) {
    clearRfidDemoUi();
    setRfidAlert("No approved or live event available for attendance.", true);
    setRfidEventTitle("No live event");
    return;
  }

  rememberRfidEventId(eventId);
  void applyRfidEventTitleHint(eventId);
  const query = new URLSearchParams({ eventId });
  if (options?.light) query.set("light", "1");
  const data = await fetchJson<RfidLivePayload>(
    `/api/admin/attendance/live?${query.toString()}`,
  );
  if (!data) {
    // Keep any in-progress scan alert; only show this if the desk is idle.
    const alert = document.querySelector<HTMLElement>(".rfid-alert");
    if (!alert?.textContent) {
      setRfidAlert("Could not load live attendance from the database. Retrying…", true);
    }
    return;
  }
  applyRfidLivePayload(data, {
    preserveProfileEmail: options?.preserveProfileEmail,
    // Default false so 5s polls never pin the last Mongo scan (e.g. Misxa) over the card just tapped.
    applyLatestProfile: options?.applyLatestProfile === true,
  });
}

async function hydrateRfid(options?: { light?: boolean; resetProfile?: boolean }) {
  // Only wipe the desk on first paint / explicit reset — never on the 5s poll.
  if (options?.resetProfile !== false && !rfidScannerWired) {
    clearRfidDemoUi();
    setRfidEventTitle("Loading event…");
  }

  // Listen to the scanner right away: waiting for the event list first meant a card
  // tapped while the page was still loading lost its first digits. A scan that
  // arrives before the event is known resolves the event itself (see submitScan).
  if (!rfidScannerWired) {
    wireRfidScanner("");
    rfidScannerWired = true;
  }
  const eventId = await resolveRfidEventId();
  rememberRfidEventId(eventId);
  ensureRfidModeToggle();
  await syncRfidEventPicker(eventId);

  if (!eventId) {
    setRfidAlert("No approved or live event available for attendance.", true);
    setRfidEventTitle("No live event");
    return;
  }

  void applyRfidEventTitleHint(eventId);

  const card = document.querySelector(".profile-card");
  if (card instanceof HTMLElement && !card.classList.contains("dc-profile-live")) {
    card.classList.add("is-loading");
  }

  if (rfidLiveInflight) {
    await rfidLiveInflight;
  }

  rfidLiveInflight = refreshRfidUi({
    light: options?.light,
    applyLatestProfile: false,
  }).finally(() => {
    rfidLiveInflight = null;
  });
  await rfidLiveInflight;
}

function isOtherEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.id === "dc-rfid-scan-input") return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function wireRfidScanner(eventId: string) {
  rememberRfidEventId(eventId);
  ensureRfidModeToggle();
  document.getElementById("dc-rfid-event-picker")?.remove();
  document.getElementById("dc-rfid-registry")?.remove();
  document.getElementById("dc-rfid-feed")?.remove();

  let host = document.getElementById("dc-rfid-scan-wrap");
  if (!host) {
    host = document.createElement("div");
    host.id = "dc-rfid-scan-wrap";
    host.setAttribute("aria-hidden", "true");
    // Visually hidden — USB RFID keyboard wedges still type into this input.
    host.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
    host.innerHTML =
      '<label for="dc-rfid-scan-input">Scan RFID</label>' +
      '<input id="dc-rfid-scan-input" type="text" autocomplete="off" tabindex="-1" />' +
      '<span id="dc-rfid-scan-status"></span>';
    const main =
      document.querySelector(".main-panel") ||
      document.querySelector(".rfid-main") ||
      document.querySelector(".main") ||
      document.body;
    main.appendChild(host);
  } else {
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;";
    host.querySelector("#dc-rfid-feed")?.remove();
    host.querySelector("#dc-rfid-registry")?.remove();
  }

  const input = document.getElementById("dc-rfid-scan-input") as HTMLInputElement | null;
  if (!input) return;

  let hidBuffer = "";
  let hidTimer = 0;
  let lastDeskSubmitKey = "";
  let lastDeskSubmitAt = 0;

  const submitScan = async (rawValue?: string) => {
    // Prefer digit run from HID wedges; keep alphanumeric tags like RFID-ARA-001.
    const raw = String(rawValue ?? input.value).trim();
    const digitRun = raw.replace(/\D/g, "");
    const rfidNumber =
      digitRun.length >= 6 && digitRun.length >= raw.replace(/\s/g, "").length * 0.7
        ? digitRun
        : raw.replace(/\s+/g, "");
    if (!rfidNumber || rfidNumber.length < 3) return;

    const action = rfidScanMode === "out" ? "out" : "in";
    const submitKey = `${rfidScanEventId}:${rfidNumber}:${action}`;
    const now = Date.now();
    // RFID wedges often fire Enter twice — ignore only near-instant hardware repeats.
    if (submitKey === lastDeskSubmitKey && now - lastDeskSubmitAt < 450) {
      return;
    }
    lastDeskSubmitKey = submitKey;
    lastDeskSubmitAt = now;

    hidBuffer = "";
    window.clearTimeout(hidTimer);
    input.value = "";
    setRfidAlert(`Reading RFID ${rfidNumber}…`);

    if (!rfidScanEventId) {
      const resolved = await resolveRfidEventId();
      if (!resolved) {
        setRfidAlert("No approved or live event available for attendance.", true);
        return;
      }
    }
    try {
      const res = await fetch("/api/admin/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: rfidScanEventId, rfidNumber, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = String(data.error || "Scan failed.");
        const code = String(data.code || "");
        const errUser = data.user as
          | {
              name?: string;
              email?: string;
              studentNumber?: string;
              course?: string;
              school?: string;
              organization?: string;
              organizationRole?: string;
              organizationPosition?: string;
              rfidNumber?: string;
              photoUrl?: string;
            }
          | undefined;
        // Always show the card owner when Mongo resolved the RFID — even on duplicate/409.
        if (errUser?.name || errUser?.email) {
          applyRfidParticipantProfile(errUser);
          const tapInAt = String(data.lastTapInAt || "").trim();
          const tapOutAt = String(data.lastTapOutAt || "").trim();
          if (tapInAt || tapOutAt) {
            setTapTimes(tapInAt || undefined, tapOutAt || undefined);
          } else {
            const syncedEmail = String(errUser.email || "").trim().toLowerCase();
            if (syncedEmail) {
              window.requestAnimationFrame(() => {
                void refreshRfidUi({
                  light: true,
                  preserveProfileEmail: syncedEmail,
                  applyLatestProfile: false,
                });
              });
            }
          }
        } else if (code === "unknown_rfid") {
          applyRfidParticipantProfile(null);
          setTapTimes("", "");
        }
        // Quick Register on First Tap: unknown card on Tap In → "not registered"
        // popup → OK opens the Quick Register form.
        if (code === "unknown_rfid" && action === "in") {
          setRfidAlert("Card not registered yet — press OK to open Quick Register.", true);
          showRfidDuplicatePopup(
            `This RFID (${rfidNumber}) is not registered to any student yet. Press OK to register them now with Quick Register.`,
            code,
            {
              title: "Card not registered",
              okLabel: "OK",
              onOk: () => showRfidQuickRegister(rfidNumber),
            },
          );
          return;
        }
        if (
          code === "duplicate_entry" ||
          code === "duplicate_warning" ||
          code === "concurrent_event" ||
          code === "rapid_consecutive" ||
          code === "unknown_rfid" ||
          code === "ambiguous_rfid" ||
          /suspicious|duplicate entry|multiple taps|not registered|concurrent|within a minute|already tapped in/i.test(
            message,
          )
        ) {
          showRfidDuplicatePopup(message, code);
        }
        setRfidAlert(message, true);
        return;
      }
      setRfidAlert("");
      const scan = data.scan as
        | {
            action?: string;
            scannedAt?: string;
            duplicate?: boolean;
            participantName?: string;
            email?: string;
          }
        | undefined;
      if (scan?.duplicate) {
        showRfidDuplicatePopup(
          "Duplicate entry: this participant is already tapped in and did not tap out.",
          "duplicate_entry",
        );
        return;
      }
      const user = data.user as
        | {
            name?: string;
            email?: string;
            studentNumber?: string;
            course?: string;
            school?: string;
            organization?: string;
            organizationRole?: string;
            organizationPosition?: string;
            rfidNumber?: string;
            photoUrl?: string;
          }
        | undefined;
      // Always paint the owner from the scan response first (authoritative).
      if (user?.name || user?.email) {
        applyRfidParticipantProfile(user);
      } else if (scan?.participantName || scan?.email) {
        applyRfidParticipantProfile({
          name: scan.participantName,
          email: scan.email,
          rfidNumber,
        });
      }
      if (scan?.action === "in") {
        setTapTimes(scan.scannedAt || new Date().toISOString(), "");
      } else if (scan?.action === "out") {
        setTapTimes(undefined, scan.scannedAt || new Date().toISOString());
      }
      const ownerLabel = user?.name || scan?.participantName || "Participant";
      setRfidAlert(
        `${ownerLabel} — Tap ${scan?.action === "out" ? "Out" : "In"} recorded`,
      );
      // Background sync only — scan response already updated the UI instantly.
      const syncedEmail = String(user?.email || scan?.email || "")
        .trim()
        .toLowerCase();
      window.requestAnimationFrame(() => {
        void refreshRfidUi({
          light: true,
          preserveProfileEmail: syncedEmail,
          applyLatestProfile: false,
        });
      });
    } catch {
      setRfidAlert("Scan failed.", true);
    } finally {
      // Allow the next student/card immediately after the request finishes.
      if (submitKey === lastDeskSubmitKey) {
        window.setTimeout(() => {
          if (lastDeskSubmitKey === submitKey) {
            lastDeskSubmitKey = "";
          }
        }, 300);
      }
    }
  };

  if (input.dataset.dcWired !== "1") {
    input.dataset.dcWired = "1";
    // HID capture handles Enter — avoid a second submit from the hidden input listener.
  }

  if (document.body.dataset.dcRfidHidWired !== "1") {
    document.body.dataset.dcRfidHidWired = "1";

    const flushHid = (reason: "enter" | "idle") => {
      const value = hidBuffer.trim();
      hidBuffer = "";
      input.value = "";
      window.clearTimeout(hidTimer);
      if (!value) return;
      // Ignore idle flushes of short fragments (incomplete card reads).
      const digits = value.replace(/\D/g, "");
      if (reason === "idle" && digits.length > 0 && digits.length < 8) {
        return;
      }
      if (reason === "idle" && value.length < 6) {
        return;
      }
      void submitScan(value);
    };

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          !document.querySelector('[data-admin-page="rfid17"]') &&
          !document.querySelector(".tap-panel")
        ) {
          return;
        }
        if (isOtherEditableTarget(event.target)) return;
        // Let the volunteer use the Quick Register form normally.
        if (document.getElementById("dc-rfid-qr-overlay")) return;

        if (event.key === "Enter" || event.key === "NumpadEnter") {
          event.preventDefault();
          event.stopImmediatePropagation();
          window.clearTimeout(hidTimer);
          flushHid("enter");
          return;
        }

        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        hidBuffer += event.key;
        input.value = hidBuffer;
        window.clearTimeout(hidTimer);
        // Wedges vary — wait longer between keys so we don't flush mid-card.
        hidTimer = window.setTimeout(() => flushHid("idle"), 320);
      },
      true,
    );
  }

  window.setTimeout(() => input.focus(), 0);
}

function formatCertDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCertTime(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatMinutesLabel(minutes?: number, fallback?: string) {
  const text = String(fallback || "").trim();
  if (text) return text.toUpperCase();
  const mins = Number(minutes || 0);
  if (!Number.isFinite(mins) || mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} HOUR${h === 1 ? "" : "S"}`);
  if (m > 0) parts.push(`${m} MINS`);
  return parts.join(" ") || "—";
}

function formatSpanDuration(startsAt?: string, endsAt?: string) {
  if (!startsAt || !endsAt) return "—";
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "—";
  return formatMinutesLabel(Math.round((end - start) / 60000));
}

function setFdField(root: ParentNode, label: string, value: string) {
  root.querySelectorAll(".fd-field").forEach((field) => {
    const lab = field.querySelector(".label");
    if (!lab) return;
    if ((lab.textContent || "").trim().toUpperCase() !== label.toUpperCase()) return;
    const val = field.querySelector(".value");
    if (val) val.textContent = value;
  });
}

type CertEventDetail = {
  id: string;
  title: string;
  description?: string;
  status: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  venueType?: string;
  category?: string;
  department?: string;
  organizerName?: string;
  attendanceRequired?: string;
  attendanceRequiredMinutes?: number;
  gracePeriod?: string;
  gracePeriodMinutes?: number;
  hasCertificateTemplate?: boolean;
  certificateTemplateName?: string;
  attachments?: { certificateTemplate?: string };
};

function fillFulld46EventInfo(event: CertEventDetail | null) {
  const info = document.getElementById("event-info") || document.body;
  const title =
    info.querySelector(".fd-card-top h3") ||
    document.querySelector(
      ".fd-event-title, .fd-hero h1, .fd-title, h1.page-title, .event-name",
    );
  const desc = info.querySelector(".fd-card-top .desc");
  const status = info.querySelector(".fd-status-label");

  if (title) title.textContent = event?.title || "Event not found";
  if (desc) {
    desc.textContent = event?.description?.trim() || "No description provided.";
  }
  if (status) {
    status.textContent = (event?.status || "UNKNOWN").toUpperCase();
  }

  setFdField(info, "DATE", formatCertDate(event?.startsAt));
  setFdField(info, "VENUE", event?.location || "—");
  setFdField(info, "START TIME", formatCertTime(event?.startsAt));
  setFdField(info, "END TIME", formatCertTime(event?.endsAt));
  setFdField(info, "VENUE TYPE", (event?.venueType || "—").toUpperCase());
  setFdField(info, "EVENT TYPE", (event?.category || "—").toUpperCase());
  setFdField(
    info,
    "ORGANIZATION",
    (event?.department || event?.organizerName || "—").toUpperCase(),
  );
  setFdField(info, "DURATION", formatSpanDuration(event?.startsAt, event?.endsAt));
  setFdField(
    info,
    "MINIMUM ATTENDANCE",
    formatMinutesLabel(event?.attendanceRequiredMinutes, event?.attendanceRequired),
  );
  setFdField(
    info,
    "GRACE PERIOD",
    formatMinutesLabel(event?.gracePeriodMinutes, event?.gracePeriod),
  );

  const fileCard = info.querySelector(".fd-file");
  if (fileCard) {
    const nameEl = fileCard.querySelector("span");
    const labelEl = fileCard.querySelector("strong");
    if (labelEl) labelEl.textContent = "E-Certificate Template";
    if (event?.hasCertificateTemplate && event.attachments?.certificateTemplate) {
      const fileName = event.certificateTemplateName || "certificate-template.pdf";
      if (nameEl) nameEl.textContent = fileName;
      fileCard.setAttribute("role", "link");
      fileCard.setAttribute("tabindex", "0");
      (fileCard as HTMLElement).style.cursor = "pointer";
      const openTemplate = () => {
        window.open(event.attachments!.certificateTemplate!, "_blank", "noopener,noreferrer");
      };
      if (fileCard.getAttribute("data-dc-wired") !== "1") {
        fileCard.setAttribute("data-dc-wired", "1");
        fileCard.addEventListener("click", openTemplate);
        fileCard.addEventListener("keydown", (ev) => {
          if ((ev as KeyboardEvent).key === "Enter" || (ev as KeyboardEvent).key === " ") {
            ev.preventDefault();
            openTemplate();
          }
        });
      }
    } else if (nameEl) {
      nameEl.textContent = "No template uploaded";
      (fileCard as HTMLElement).style.cursor = "default";
    }
  }
}

/** Map stored certificate status → admin table label. */
function certStatusLabel(raw?: string) {
  const status = String(raw || "").trim().toLowerCase();
  if (status === "distributed" || status === "released") return "Distributed";
  if (status === "generated" || status === "issued" || status === "complete") return "Issued";
  if (!status || status === "not issued" || status === "pending") return "Not issued";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function currentFulld46EventId() {
  const table = document.querySelector<HTMLElement>(".fd-table");
  return (
    table?.dataset.eventId ||
    new URLSearchParams(window.location.search).get("id") ||
    ""
  );
}

function currentFulld46EventTitle() {
  const table = document.querySelector<HTMLElement>(".fd-table");
  return table?.dataset.eventTitle || "event";
}

/** Paint CERTIFICATE STATUS (+ download URL) immediately so the UI never lags the API. */
function paintCertificateStatuses(
  updates: Array<{ email: string; status: string; downloadUrl?: string }>,
) {
  const byEmail = new Map(
    updates.map((row) => [row.email.trim().toLowerCase(), row] as const),
  );
  document.querySelectorAll<HTMLTableRowElement>(".fd-table tbody tr").forEach((tr) => {
    const email = String(tr.dataset.email || "").toLowerCase();
    const update = byEmail.get(email);
    if (!update) return;
    const statusCell = tr.cells[6];
    if (statusCell) statusCell.textContent = update.status;
    tr.dataset.certStatus = update.status;
    if (update.downloadUrl) tr.dataset.downloadUrl = update.downloadUrl;
  });
}

/** Issue (or regenerate) one participant's certificate for an event. */
async function issueCertificateFor(eventId: string, email: string, name: string, regenerate = false) {
  const res = await fetch("/api/user/certificates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, email, name, regenerate }),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(payload.error || "Failed to issue certificate."));
  return payload;
}

async function issueCertificatesBulk(
  eventId: string,
  emails: string[],
  names: string[],
  regenerate = false,
) {
  const res = await fetch("/api/user/certificates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      emails.length
        ? { eventId, emails, name: names[0] || undefined, regenerate }
        : { eventId, regenerate },
    ),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(payload.error || "Failed to generate."));
  return payload;
}

/** Mark one or more certificates as distributed for an event. */
async function distributeCertificatesFor(eventId: string, emails: string[]) {
  const res = await fetch("/api/user/certificates", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, emails, action: "distribute" }),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(payload.error || "Failed to distribute certificate."));
  return payload;
}

function collectCertificateResults(payload: Record<string, unknown>) {
  const updates: Array<{ email: string; status: string; downloadUrl?: string }> = [];
  const push = (row: Record<string, unknown>, status: string) => {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email) return;
    updates.push({
      email,
      status,
      downloadUrl: String(row.downloadUrl || "") || undefined,
    });
  };
  for (const row of (payload.certificates as Array<Record<string, unknown>> | undefined) || []) {
    push(row, "Issued");
  }
  for (const row of (payload.skipped as Array<Record<string, unknown>> | undefined) || []) {
    const status =
      String(row.status || "").toLowerCase() === "distributed" ? "Distributed" : "Issued";
    push(row, status);
  }
  return updates;
}

let certificateRowActionsWired = false;

/**
 * Eligible-participants table (fulld46): ONE document-level capture handler for
 * row actions AND bulk Generate/Distribute. Installed once; always reads the
 * current eventId from the URL/table at click time (never a stale closure).
 */
function ensureCertificateRowActionsWired() {
  if (certificateRowActionsWired) return;
  certificateRowActionsWired = true;

  if (!document.getElementById("dc-fd-action-up-style")) {
    const style = document.createElement("style");
    style.id = "dc-fd-action-up-style";
    style.textContent =
      ".fd-action.open { z-index: 20; }" +
      ".fd-action.dc-menu-up .fd-action-menu { top: auto !important; bottom: calc(100% + 6px) !important; }" +
      ".fd-bulk.open { z-index: 20; }";
    document.head.appendChild(style);
  }

  document.addEventListener(
    "click",
    (clickEvent) => {
      const target = clickEvent.target as HTMLElement | null;
      if (!target) return;

      // Bulk dropdown toggle
      const bulkToggle = target.closest<HTMLElement>("[data-bulk-toggle]");
      if (bulkToggle) {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        const wrap = bulkToggle.closest(".fd-bulk");
        document.querySelectorAll(".fd-action.open, .fd-bulk.open").forEach((el) => {
          if (el !== wrap) el.classList.remove("open");
        });
        const open = wrap?.classList.toggle("open");
        bulkToggle.setAttribute("aria-expanded", open ? "true" : "false");
        return;
      }

      // Bulk menu actions (outside .fd-table)
      const bulkOption = target.closest<HTMLButtonElement>(".fd-bulk-menu button");
      if (bulkOption) {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        clickEvent.stopImmediatePropagation();
        const wrap = bulkOption.closest(".fd-bulk");
        wrap?.classList.remove("open");
        wrap?.querySelector("[data-bulk-toggle]")?.setAttribute("aria-expanded", "false");
        wrap?.querySelectorAll(".fd-bulk-menu button").forEach((btn) => {
          btn.classList.toggle("is-active", btn === bulkOption);
        });

        const label = (bulkOption.textContent || "").trim().toLowerCase();
        const eventId = currentFulld46EventId();
        if (!eventId) {
          window.alert("Open an event certificate page before generating.");
          return;
        }
        const selected = Array.from(
          document.querySelectorAll<HTMLInputElement>(
            '.fd-table tbody input[type="checkbox"]:checked',
          ),
        );
        const emails = selected
          .map((input) => input.dataset.email || "")
          .filter(Boolean);
        const names = selected.map((input) => input.dataset.name || "");

        if (label.includes("distribute")) {
          void (async () => {
            try {
              const targets =
                emails.length > 0
                  ? emails
                  : Array.from(document.querySelectorAll<HTMLTableRowElement>(".fd-table tbody tr"))
                      .filter((tr) => {
                        const status = (
                          tr.dataset.certStatus ||
                          tr.cells[6]?.textContent ||
                          ""
                        )
                          .trim()
                          .toLowerCase();
                        return status === "issued" || Boolean(tr.dataset.downloadUrl);
                      })
                      .map((tr) => tr.dataset.email || "")
                      .filter(Boolean);
              if (!targets.length) {
                window.alert(
                  "Select participants with Issued certificates, or Generate first.",
                );
                return;
              }
              const payload = await distributeCertificatesFor(eventId, targets);
              paintCertificateStatuses(
                targets.map((email) => ({ email, status: "Distributed" })),
              );
              window.alert(
                String(
                  payload.message ||
                    `Distributed certificates for ${targets.length} participant(s).`,
                ),
              );
              await hydrateCertificateDetails();
            } catch (error) {
              window.alert(error instanceof Error ? error.message : "Failed.");
            }
          })();
          return;
        }

        if (!label.includes("generate") || label.includes("stop")) return;
        const regenerate = label.includes("regenerate");
        void (async () => {
          try {
            const payload = await issueCertificatesBulk(
              eventId,
              emails,
              names,
              regenerate,
            );
            const painted = collectCertificateResults(payload);
            if (painted.length) paintCertificateStatuses(painted);
            window.alert(String(payload.message || "Certificates issued."));
            await hydrateCertificateDetails();
          } catch (error) {
            window.alert(error instanceof Error ? error.message : "Failed.");
          }
        })();
        return;
      }

      const table = target.closest<HTMLElement>(".fd-table");
      if (!table) return;

      const toggle = target.closest<HTMLElement>("[data-action-toggle]");
      if (toggle) {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        const wrap = toggle.closest(".fd-action");
        document.querySelectorAll(".fd-action.open, .fd-bulk.open").forEach((el) => {
          if (el !== wrap) el.classList.remove("open");
        });
        wrap?.classList.toggle("open");
        wrap?.classList.remove("dc-menu-up");
        const menu = wrap?.querySelector<HTMLElement>(".fd-action-menu");
        if (wrap?.classList.contains("open") && menu) {
          const below = window.innerHeight - toggle.getBoundingClientRect().bottom;
          if (below < menu.offsetHeight + 16 && toggle.getBoundingClientRect().top > menu.offsetHeight + 16) {
            wrap.classList.add("dc-menu-up");
          }
        }
        return;
      }

      const option = target.closest<HTMLButtonElement>(".fd-action-menu button");
      if (!option) return;
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      clickEvent.stopImmediatePropagation();
      const wrap = option.closest(".fd-action");
      wrap?.querySelectorAll(".fd-action-menu button").forEach((btn) => {
        btn.classList.toggle("is-active", btn === option);
      });
      wrap?.classList.remove("open");

      const tr = option.closest<HTMLTableRowElement>("tr");
      const email = tr?.dataset.email || "";
      const userName = tr?.dataset.userName || email;
      const downloadUrl = tr?.dataset.downloadUrl || "";
      const certStatus = (
        tr?.dataset.certStatus ||
        tr?.cells[6]?.textContent ||
        ""
      )
        .trim()
        .toLowerCase();
      const eligible = tr?.dataset.eligible === "1";
      const eventId = currentFulld46EventId();
      const eventTitle = currentFulld46EventTitle();
      const label = (option.textContent || "").trim().toLowerCase();

      if (!email) {
        window.alert("Participant details haven't loaded yet. Refresh the page and try again.");
        return;
      }
      if (label.includes("preview")) {
        if (downloadUrl) {
          window.open(downloadUrl, "_blank", "noopener,noreferrer");
        } else {
          window.alert(`No certificate PDF yet for ${userName}. Use Generate first.`);
        }
        return;
      }
      if (label.includes("distribute")) {
        if (!eventId) return;
        if (!downloadUrl && certStatus !== "issued" && certStatus !== "distributed") {
          window.alert(`No certificate PDF yet for ${userName}. Use Generate first.`);
          return;
        }
        void (async () => {
          try {
            const payload = await distributeCertificatesFor(eventId, [email]);
            paintCertificateStatuses([{ email, status: "Distributed", downloadUrl }]);
            window.alert(
              String(payload.message || `Certificate distributed for ${userName} — ${eventTitle}.`),
            );
            await hydrateCertificateDetails();
          } catch (error) {
            window.alert(error instanceof Error ? error.message : "Failed.");
          }
        })();
        return;
      }
      if (!label.includes("generate") || !eventId) return;
      const regenerate = label.includes("regenerate");
      if (!eligible && !regenerate) {
        window.alert(
          `${userName} is not eligible yet. They must tap out and meet the minimum attendance time.`,
        );
        return;
      }
      void (async () => {
        try {
          const payload = await issueCertificateFor(eventId, email, userName, regenerate);
          const painted = collectCertificateResults(payload);
          if (painted.length) paintCertificateStatuses(painted);
          else paintCertificateStatuses([{ email, status: "Issued" }]);
          const blocked = Array.isArray(payload.ineligible)
            ? (payload.ineligible[0] as { reason?: string } | undefined)
            : undefined;
          window.alert(
            String(payload.message || blocked?.reason || `Certificate issued for ${userName} — ${eventTitle}.`),
          );
          await hydrateCertificateDetails();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "Failed.");
        }
      })();
    },
    true,
  );

  document.addEventListener("click", (clickEvent) => {
    const target = clickEvent.target as HTMLElement | null;
    if (target?.closest(".fd-action, .fd-bulk")) return;
    document.querySelectorAll(".fd-action.open, .fd-bulk.open").forEach((el) => {
      el.classList.remove("open");
    });
    document.querySelectorAll("[data-bulk-toggle]").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  });
}

async function hydrateCertificateDetails() {
  const eventId = new URLSearchParams(window.location.search).get("id") || "";
  const pageId = pageIdFromPath(window.location.pathname);
  ensureCertificateRowActionsWired();

  // Clear hardcoded demo copy immediately on the detail page.
  if (pageId === "fulld46") {
    fillFulld46EventInfo(null);
  }

  const [certs, eventsPayload, attendance, detailPayload] = await Promise.all([
    fetchJson<{
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
    }>(
      eventId
        ? `/api/user/certificates?eventId=${encodeURIComponent(eventId)}`
        : "/api/user/certificates",
    ),
    fetchJson<{
      events: Array<{
        id: string;
        title: string;
        status: string;
        hasCertificateTemplate?: boolean;
        location?: string;
        startsAt?: string;
        endsAt?: string;
        attendanceRequiredMinutes?: number;
        attachments?: { certificateTemplate?: string };
      }>;
    }>("/api/events?hasCertificateTemplate=1&limit=150"),
    eventId
      ? fetchJson<{
          attendance: Array<{
            email: string;
            participantName: string;
            action: string;
            studentNumber?: string;
            course?: string;
            school?: string;
            qualifiedForCertificate?: boolean;
            attendanceMinutes?: number;
          }>;
        }>(`/api/user/attendance?eventId=${encodeURIComponent(eventId)}`)
      : Promise.resolve(null),
    pageId === "fulld46" && eventId
      ? fetchJson<{ event: CertEventDetail }>(`/api/events/${encodeURIComponent(eventId)}`)
      : Promise.resolve(null),
  ]);

  const templatedEvents = (eventsPayload?.events || []).filter(
    (event) => event.hasCertificateTemplate,
  );
  const attentionEvents = templatedEvents.filter((event) =>
    ["live", "completed", "approved"].includes(event.status),
  );

  document.querySelectorAll(".cd-panel").forEach((panel, index) => {
    const rows =
      index === 0
        ? attentionEvents
        : index === 1
          ? attentionEvents.filter((event) => event.status === "live" || event.status === "completed")
          : attentionEvents;
    patchChildren(panel, "a.cd-event, a.event-item", rows.slice(0, 8), (el, event) => {
      const title = el.querySelector("h3, h4, .title");
      if (title) title.textContent = event.title;
      const paragraphs = el.querySelectorAll("p");
      if (paragraphs[0]) {
        paragraphs[0].textContent = event.startsAt
          ? new Date(event.startsAt).toLocaleString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "Date TBA";
      }
      if (paragraphs[1]) paragraphs[1].textContent = event.location || "Venue TBA";
      if (el instanceof HTMLAnchorElement) {
        el.href = `/admin/fulld46?id=${encodeURIComponent(event.id)}`;
      }
    });
    ensureEventsFooterAtBottom(panel);
  });

  if (pageId !== "fulld46" || !eventId) {
    // Still hydrate certificate table if present on certdeets46.
    const table = document.querySelector(".fd-table");
    if (table && certs?.certificates) {
      patchTableRows(table, certs.certificates, (tr, cert) => {
        const cells = tr.querySelectorAll("td");
        if (cells[1]) cells[1].textContent = cert.userName || cert.email;
        if (cells[2]) cells[2].textContent = cert.studentNumber || "—";
        if (cells[3]) cells[3].textContent = courseLabel(cert.course) || "—";
        if (cells[4]) cells[4].textContent = schoolLabel(cert.school) || "—";
        if (cells[5]) cells[5].textContent = "Eligible";
        if (cells[6]) cells[6].textContent = certStatusLabel(cert.status);
      });
    }
    return;
  }

  const event =
    detailPayload?.event ||
    (eventsPayload?.events || []).find((row) => row.id === eventId) ||
    null;

  try {
    fillFulld46EventInfo(event);
  } catch (error) {
    console.warn("[DC Space] Certificate event info failed:", error);
  }
  try {
    wireEventPdfReportButtons(eventId);
  } catch (error) {
    console.warn("[DC Space] Certificate report buttons failed:", error);
  }

  document.querySelectorAll(".fd-overview-row").forEach((row) => {
    const key = (row.querySelector(".k")?.textContent || "").trim().toLowerCase();
    const value = row.querySelector(".v");
    if (!value || !event) return;
    if (key.includes("event")) value.textContent = event.title;
    if (key.includes("min") || key.includes("attendance")) {
      value.textContent = String(event.attendanceRequiredMinutes || 0);
    }
    if (key.includes("certificate") && key.includes("generated")) {
      value.textContent = String(certs?.certificates?.length || 0);
    }
  });

  const templateLink = document.querySelector<HTMLAnchorElement>(
    'a[href*="certificate-template"], a.fd-template, .fd-ecert a, a[download]',
  );
  if (templateLink && event?.attachments?.certificateTemplate) {
    templateLink.href = event.attachments.certificateTemplate;
    templateLink.textContent = "Download e-certificate template";
  }

  if (event && !event.hasCertificateTemplate) {
    const root = document.querySelector(".admin-legacy-root") as HTMLElement | null;
    if (root && root.dataset.dcCertTemplateWarned !== "1") {
      root.dataset.dcCertTemplateWarned = "1";
      window.alert(
        "This event has no certificate template uploaded. Add an e-certificate template before issuing certificates.",
      );
    }
  }

  // Build eligible participant rows from attendance + existing certificates.
  type EligibleRow = {
    email: string;
    userName: string;
    studentNumber: string;
    course: string;
    school: string;
    eligible: boolean;
    status: string;
    downloadUrl: string;
  };

  const byEmail = new Map<string, EligibleRow>();
  for (const row of attendance?.attendance || []) {
    const email = String(row.email || "").toLowerCase();
    if (!email) continue;
    const existing = byEmail.get(email) || {
      email,
      userName: String(row.participantName || email),
      studentNumber: String(row.studentNumber || ""),
      course: String(row.course || ""),
      school: String(row.school || ""),
      eligible: false,
      status: "Not issued",
      downloadUrl: "",
    };
    // Eligible after tap-out qualifies, or any recorded tap-out with minutes.
    if (row.qualifiedForCertificate) existing.eligible = true;
    if (String(row.action || "") === "out" && Number(row.attendanceMinutes || 0) > 0) {
      existing.eligible = true;
    }
    if (row.participantName) existing.userName = String(row.participantName);
    byEmail.set(email, existing);
  }
  for (const cert of certs?.certificates || []) {
    const email = String(cert.email || "").toLowerCase();
    if (!email) continue;
    const existing = byEmail.get(email) || {
      email,
      userName: cert.userName || email,
      studentNumber: cert.studentNumber || "",
      course: cert.course || "",
      school: cert.school || "",
      eligible: true,
      status: "Not issued",
      downloadUrl: "",
    };
    existing.status = certStatusLabel(cert.status || "generated");
    existing.downloadUrl = cert.downloadUrl || "";
    existing.userName = cert.userName || existing.userName;
    existing.studentNumber = cert.studentNumber || existing.studentNumber;
    existing.course = cert.course || existing.course;
    existing.school = cert.school || existing.school;
    existing.eligible = true;
    byEmail.set(email, existing);
  }

  const eligibleRows = [...byEmail.values()].sort((a, b) =>
    a.userName.localeCompare(b.userName),
  );

  const pendingCount = eligibleRows.filter((row) => row.status === "Not issued").length;
  const distributedCount = eligibleRows.filter((row) => row.status === "Distributed").length;
  const issuedCount = eligibleRows.filter(
    (row) => row.status === "Issued" || row.status === "Distributed",
  ).length;
  document.querySelectorAll(".fd-overview-row").forEach((row) => {
    const key = (row.querySelector(".k")?.textContent || "").trim().toLowerCase();
    const value = row.querySelector(".v");
    if (!value) return;
    if (key.includes("pending")) value.textContent = String(pendingCount);
    if (key.includes("participant")) value.textContent = String(eligibleRows.length);
    if (key.includes("released") || (key.includes("certificate") && key.includes("distribut"))) {
      value.textContent = String(distributedCount);
    }
    if (key.includes("certificate") && key.includes("generated")) {
      value.textContent = String(issuedCount);
    }
  });

  patchTableRows(document.querySelector(".fd-table"), eligibleRows, (tr, row) => {
    tr.setAttribute("data-email", row.email);
    tr.setAttribute("data-user-name", row.userName);
    const cells = tr.querySelectorAll("td");
    const checkbox = tr.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (checkbox) {
      checkbox.setAttribute("aria-label", `Select ${row.userName}`);
      checkbox.checked = false;
      checkbox.dataset.email = row.email;
      checkbox.dataset.name = row.userName;
    }
    if (cells[1]) cells[1].textContent = row.userName;
    if (cells[2]) cells[2].textContent = row.studentNumber || "—";
    if (cells[3]) cells[3].textContent = courseLabel(row.course) || "—";
    if (cells[4]) cells[4].textContent = schoolLabel(row.school) || "—";
    if (cells[5]) cells[5].textContent = row.eligible ? "Eligible" : "Not eligible";
    if (cells[6]) cells[6].textContent = row.status;
    // Read at click time by the table's delegated handler (rows are cloned and
    // re-sorted, so per-row listeners would be missing or point at the wrong person).
    tr.dataset.email = row.email;
    tr.dataset.userName = row.userName;
    tr.dataset.downloadUrl = row.downloadUrl;
    tr.dataset.eligible = row.eligible ? "1" : "0";
    tr.dataset.certStatus = row.status;
    // Every row starts as "Preview" (the Figma demo rows had other labels).
    const toggle = tr.querySelector<HTMLElement>("[data-action-toggle]");
    if (toggle) {
      const icon = toggle.querySelector("svg");
      toggle.textContent = "Preview ";
      if (icon) toggle.appendChild(icon);
    }
    tr.querySelectorAll(".fd-action-menu button").forEach((option) => {
      option.classList.toggle("is-active", (option.textContent || "").trim() === "Preview");
    });
    tr.querySelector(".fd-action")?.classList.remove("open");
  });

  const fdTable = document.querySelector<HTMLElement>(".fd-table");
  if (fdTable) {
    fdTable.dataset.eventId = eventId;
    fdTable.dataset.eventTitle = event?.title || "event";
    // 5 participants per page; ‹ › pages, Show ‹ n › page size, Ascending / Descending.
    const footer = fdTable.closest("section, .fd-card, .fd-block")?.querySelector(".fd-footer") || document;
    const showSpans = footer.querySelectorAll(".fd-show > span");
    attachTablePager({
      table: fdTable,
      pageLabel: footer.querySelector(".fd-page span"),
      prevButton: footer.querySelector<HTMLElement>('.fd-page .nav-btn[aria-label="Previous"]'),
      nextButton: footer.querySelector<HTMLElement>('.fd-page .nav-btn[aria-label="Next"]'),
      sizeLabel: showSpans[1] || null,
      totalLabel: showSpans[2] || null,
      fewerButton: footer.querySelector<HTMLElement>('.fd-show .stepper[aria-label="Fewer"]'),
      moreButton: footer.querySelector<HTMLElement>('.fd-show .stepper[aria-label="More"]'),
      sortButtons: footer.querySelectorAll<HTMLElement>(".fd-sort [data-sort]"),
      sortCellIndex: 1,
      pageSize: 5,
    });
  }
  // Bulk Generate / Distribute is handled by ensureCertificateRowActionsWired
  // (document capture) so it never closes over a stale eventId.
}

function wireReportsDownload() {
  // Reports hub CTA should open the Smart Report wizard (PDF export lives there).
  const link = document.querySelector<HTMLAnchorElement>(".rp-generate");
  if (!link || link.dataset.dcWired === "1") return;
  link.dataset.dcWired = "1";
  if (!link.getAttribute("href")) {
    link.href = "/admin/reportgen53";
  }
}

/** Generate an event PDF report and trigger a browser download. */
async function generateAndDownloadEventReportPdf(
  eventId: string,
  control?: HTMLElement | null,
) {
  if (!eventId) {
    throw new Error("Missing event id. Open an event before generating a report.");
  }

  const original =
    control instanceof HTMLElement ? (control.textContent || "").trim() || "Generate Report" : "";
  if (control instanceof HTMLElement) {
    control.setAttribute("aria-busy", "true");
    if (control instanceof HTMLButtonElement) control.disabled = true;
    if (control instanceof HTMLAnchorElement) control.style.pointerEvents = "none";
    control.textContent = "Generating…";
  }

  try {
    const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/report`, {
      method: "POST",
      credentials: "include",
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      details?: string;
      report?: { fileName?: string; hasPdf?: boolean };
    };
    if (!res.ok) {
      throw new Error(payload.error || payload.details || "Failed to generate report.");
    }
    if (!payload.report?.hasPdf) {
      throw new Error("Report was generated but no PDF file was produced.");
    }

    const fileName = payload.report.fileName || "event-report.pdf";
    const downloadUrl = `/api/admin/events/${encodeURIComponent(eventId)}/report/download`;
    const fileRes = await fetch(downloadUrl, { credentials: "include", cache: "no-store" });
    if (!fileRes.ok) {
      const err = await fileRes.json().catch(() => ({}));
      throw new Error(
        (err as { error?: string }).error || "Report PDF could not be downloaded.",
      );
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
    return payload.report;
  } finally {
    if (control instanceof HTMLElement) {
      control.removeAttribute("aria-busy");
      if (control instanceof HTMLButtonElement) control.disabled = false;
      if (control instanceof HTMLAnchorElement) control.style.pointerEvents = "";
      control.textContent = original;
    }
  }
}

function wireEventPdfReportButtons(eventId: string) {
  if (!eventId) return;
  // live16 uses #event-report-generate via AdminAiBridge; avoid double-wiring.
  const controls = document.querySelectorAll<HTMLElement>(".fd-generate-report, .report-btn");
  controls.forEach((control) => {
    if (control.dataset.dcPdfReportWired === "1") return;
    control.dataset.dcPdfReportWired = "1";
    control.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      void generateAndDownloadEventReportPdf(eventId, control).catch((error) => {
        window.alert(error instanceof Error ? error.message : "Failed to generate report PDF.");
      });
    });
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

/**
 * Profile avatars show the initials of the name actually displayed (the Figma
 * pages shipped hard-coded "KE"/"KJ"); same rule as the page hydrations.
 */
function syncProfileInitials() {
  const nameEl = document.getElementById("user-name");
  const initialsEl = document.getElementById("user-initials");
  if (!nameEl || !initialsEl) return;
  const parts = (nameEl.textContent || "").trim().split(/\s+/).filter(Boolean);
  const next = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
  if (next && initialsEl.textContent !== next) initialsEl.textContent = next;
}

/** Update the initials the moment the name changes (not after the whole page loads). */
function watchProfileInitials() {
  const nameEl = document.getElementById("user-name") as (HTMLElement & { __dcInitialsWatch?: boolean }) | null;
  if (!nameEl) return;
  if (!nameEl.__dcInitialsWatch) {
    nameEl.__dcInitialsWatch = true;
    new MutationObserver(syncProfileInitials).observe(nameEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  syncProfileInitials();
}

/**
 * The admin page container for this page. More than one `.admin-legacy-root` can
 * be in the document at once (Next keeps a hidden copy of a route while it
 * renders the next), so prefer the one for this page that has its HTML in it.
 */
function currentAdminRoot(pageId: string): Element {
  const roots = Array.from(document.querySelectorAll(".admin-legacy-root"));
  return (
    roots.find((el) => el.getAttribute("data-admin-page") === pageId && el.querySelector(".main, .topbar, main")) ||
    roots.find((el) => el.querySelector(".main, .topbar, main")) ||
    roots[0] ||
    document.querySelector("[data-admin-page]") ||
    document.body
  );
}

// ─── Top bar on every admin page: Live RFID shortcut + quick people search ───

/** Client-side navigation (set by AdminOpsBridge); falls back to a full load. */
let adminNavigate: (href: string) => void = (href) => window.location.assign(href);

function ensureTopbarShortcutStyles() {
  if (document.getElementById("dc-topbar-shortcut-style")) return;
  const style = document.createElement("style");
  style.id = "dc-topbar-shortcut-style";
  style.textContent = `
.dc-live-btn { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 16px;
  border-radius: 999px; background: #ef4444; color: #fff !important; font: 600 13px/1 "Poppins", sans-serif;
  text-decoration: none !important; white-space: nowrap; flex-shrink: 0; border: 0; cursor: pointer;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25); }
.dc-live-btn:hover { background: #dc2626; }
.dc-live-btn .dc-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff;
  animation: dcLivePulse 1.4s ease-in-out infinite; }
@keyframes dcLivePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.search-bar.dc-has-people { position: relative !important; overflow: visible !important; }
.dc-people-results { position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 80; background: #fff;
  border: 1px solid rgba(68, 138, 255, 0.25); border-radius: 12px; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  padding: 6px; max-height: 380px; overflow: auto; min-width: 300px; }
.dc-people-results[hidden] { display: none !important; }
.dc-people-head { font: 600 11px/1.2 "Poppins", sans-serif; letter-spacing: 0.06em; text-transform: uppercase;
  color: #64748b; padding: 6px 10px 4px; }
.dc-people-item { display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border-radius: 8px; text-align: left; background: transparent; border: 0; cursor: pointer; }
.dc-people-item:hover, .dc-people-item:focus-visible { background: #eef4ff; outline: none; }
.dc-people-name { display: block; font: 600 13px/1.3 "Poppins", sans-serif; color: #0f172a; }
.dc-people-meta { display: block; font: 400 12px/1.3 "Poppins", sans-serif; color: #64748b; }
.dc-people-chip, .dc-rfid-status { flex-shrink: 0; display: inline-block; font: 600 11px/1 "Poppins", sans-serif;
  padding: 5px 8px; border-radius: 999px; background: #dcfce7; color: #166534; white-space: nowrap; }
.dc-people-chip.is-missing, .dc-rfid-status.is-missing { background: #fef3c7; color: #92400e; }
.dc-rfid-status { margin-left: 8px; vertical-align: middle; }
.dc-people-empty { padding: 10px; font: 400 13px/1.3 "Poppins", sans-serif; color: #64748b; }
`;
  document.head.appendChild(style);
}

function wireTopbarShortcuts(root: Element) {
  const bar = root.querySelector<HTMLElement>(".topbar .search-bar, .top-actions .search-bar");
  const actions = bar?.parentElement;
  if (!bar || !actions) return;
  ensureTopbarShortcutStyles();

  if (!actions.querySelector(".dc-live-btn")) {
    const live = document.createElement("a");
    live.className = "dc-live-btn";
    live.href = "/admin/rfid17";
    live.title = "Open Live Attendance RFID";
    live.innerHTML = '<span class="dc-live-dot" aria-hidden="true"></span>Live';
    live.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      adminNavigate("/admin/rfid17");
    });
    bar.insertAdjacentElement("afterend", live);
  }

  const input = bar.querySelector<HTMLInputElement>('input[type="search"], input');
  if (!input || input.dataset.dcPeople === "1") return;
  input.dataset.dcPeople = "1";
  bar.classList.add("dc-has-people");
  const panel = document.createElement("div");
  panel.className = "dc-people-results";
  panel.hidden = true;
  bar.appendChild(panel);

  let timer = 0;
  let seq = 0;
  const hide = () => {
    panel.hidden = true;
  };
  const open = (user: AdminUser) => {
    hide();
    adminNavigate(`/admin/info30?id=${encodeURIComponent(user.id)}`);
  };
  let lastUsers: AdminUser[] = [];
  const render = (users: AdminUser[]) => {
    lastUsers = users;
    panel.replaceChildren();
    const head = document.createElement("div");
    head.className = "dc-people-head";
    head.textContent = "People";
    panel.appendChild(head);
    if (!users.length) {
      const empty = document.createElement("div");
      empty.className = "dc-people-empty";
      empty.textContent = "No user matches. Try a name, email, student number or RFID.";
      panel.appendChild(empty);
    }
    for (const user of users) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dc-people-item";
      const text = document.createElement("span");
      const name = document.createElement("span");
      name.className = "dc-people-name";
      name.textContent = user.fullName || user.email;
      const meta = document.createElement("span");
      meta.className = "dc-people-meta";
      meta.textContent = [user.email, user.studentNumber, courseLabel(user.course)].filter(Boolean).join(" · ");
      text.append(name, meta);
      const chip = document.createElement("span");
      const hasCard = Boolean(String(user.rfidNumber || "").trim());
      chip.className = `dc-people-chip${hasCard ? "" : " is-missing"}`;
      chip.textContent = hasCard ? `RFID ${user.rfidNumber}` : "No RFID";
      item.append(text, chip);
      item.addEventListener("mousedown", (event) => event.preventDefault()); // keep focus for keyboard users
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        open(user);
      });
      panel.appendChild(item);
    }
    panel.hidden = false;
  };

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      seq += 1;
      hide();
      return;
    }
    timer = window.setTimeout(async () => {
      const mine = ++seq;
      const data = await fetchJson<{ users: AdminUser[] }>(
        `/api/admin/users?q=${encodeURIComponent(q)}&limit=6`,
      );
      if (mine !== seq || input.value.trim() !== q || !data) return;
      render(data.users || []);
    }, 250);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
    if (event.key === "Enter" && !panel.hidden && lastUsers[0]) {
      event.preventDefault();
      open(lastUsers[0]);
    }
  });
  input.addEventListener("focus", () => {
    if (lastUsers.length && input.value.trim().length >= 2) panel.hidden = false;
  });
  if (!peopleOutsideClickWired) {
    peopleOutsideClickWired = true;
    document.addEventListener("click", (event) => {
      document.querySelectorAll<HTMLElement>(".dc-people-results").forEach((results) => {
        if (!results.parentElement?.contains(event.target as Node)) results.hidden = true;
      });
    });
  }
}
let peopleOutsideClickWired = false;

/** RFID Tag Number + status on the participant pages (view on info30, edit on perinfo31). */
function ensureRfidProfileField(user: AdminUser, editable: boolean) {
  const numberField = document
    .getElementById("field-number")
    ?.closest<HTMLElement>(".update-field, .info-field");
  if (!numberField) return null;
  ensureTopbarShortcutStyles();
  let field = document.getElementById("dc-rfid-field");
  if (!field) {
    field = numberField.cloneNode(true) as HTMLElement;
    field.id = "dc-rfid-field";
    const input = field.querySelector<HTMLInputElement>("input");
    if (input) {
      input.id = "field-rfid";
      input.name = "rfidNumber";
      input.setAttribute("readonly", "");
      input.setAttribute("inputmode", "numeric");
      input.setAttribute("autocomplete", "off");
      input.placeholder = editable ? "Tap the card on the reader or type its number" : "No RFID card linked";
      // A USB reader ends with Enter: keep it from submitting the whole form.
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") event.preventDefault();
      });
    }
    const editBtn = field.querySelector<HTMLElement>(".field-edit-btn");
    if (editBtn) {
      if (editable && input) {
        editBtn.setAttribute("data-for", "field-rfid");
        editBtn.setAttribute("aria-label", "Edit RFID Tag Number");
        editBtn.addEventListener("click", (event) => {
          event.preventDefault();
          input.removeAttribute("readonly");
          input.focus();
          input.select();
        });
      } else {
        editBtn.remove();
      }
    }
    numberField.insertAdjacentElement("afterend", field);
  }
  const rfid = String(user.rfidNumber || "").trim();
  const label = field.querySelector(".label");
  if (label) {
    label.textContent = "RFID Tag Number";
    const status = document.createElement("span");
    status.className = `dc-rfid-status${rfid ? "" : " is-missing"}`;
    status.textContent = rfid ? "Registered" : "Not registered";
    label.appendChild(status);
  }
  const input = field.querySelector<HTMLInputElement>("#field-rfid");
  if (input) input.value = rfid;
  return input;
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
  const data = await fetchJson<{
    user: AdminUser;
    attendanceSummary?: {
      attendanceCompleted: number;
      lateRecords: number;
      undertimeRecords: number;
      absences: number;
      attendanceRate: number;
    };
  }>(`/api/admin/users/${encodeURIComponent(id)}`);
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
  setInput("field-course", courseLabel(user.course));
  setInput("field-school", schoolLabel(user.school));
  setInput("field-org", user.organizationPart || "");
  const orgRole = String(user.organizationRole || "");
  const [rolePart, posPart] = orgRole.includes(":") ? orgRole.split(":") : [orgRole, ""];
  setInput("field-org-role", roleLabel(rolePart));
  setInput("field-org-pos", humanizeCode(posPart));
  fillAccountStatus(user);
  applyParticipantAttendanceSummary(data.attendanceSummary);

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
  setInput("field-course", courseLabel(user.course));
  setInput("field-school", schoolLabel(user.school));
  setInput("field-org", user.organizationPart || "");
  const orgRole = String(user.organizationRole || "");
  const [rolePart, posPart] = orgRole.includes(":") ? orgRole.split(":") : [orgRole, ""];
  setInput("field-org-role", roleLabel(rolePart));
  setInput("field-org-pos", humanizeCode(posPart));
  ensureRfidProfileField(user, true);

  const form = document.getElementById("update-info-form") as HTMLFormElement | null;
  if (form && form.dataset.dcWired !== "1") {
    form.dataset.dcWired = "1";
    // Capture + stopImmediatePropagation: the page's original script also handles
    // submit by jumping to info30 without the user id, which could cut this save off.
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const fullName = (document.getElementById("field-name") as HTMLInputElement | null)?.value || "";
      const parts = fullName.trim().split(/\s+/);
      const orgRoleVal = organizationRoleCode((document.getElementById("field-org-role") as HTMLInputElement | null)?.value);
      const orgPos = (document.getElementById("field-org-pos") as HTMLInputElement | null)?.value || "";
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: parts[0] || "",
          lastName: parts.slice(1).join(" ") || "",
          studentNumber: (document.getElementById("field-number") as HTMLInputElement | null)?.value,
          email: (document.getElementById("field-email") as HTMLInputElement | null)?.value,
          course: courseCode((document.getElementById("field-course") as HTMLInputElement | null)?.value),
          school: schoolCode((document.getElementById("field-school") as HTMLInputElement | null)?.value),
          organizationPart: (document.getElementById("field-org") as HTMLInputElement | null)?.value,
          organizationRole: orgPos ? `${orgRoleVal}:${orgPos}` : orgRoleVal,
          rfidNumber: (document.getElementById("field-rfid") as HTMLInputElement | null)?.value,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert(payload.error || "Failed to save."); return; }
      window.alert("Information updated.");
      window.location.assign(`/admin/info30?id=${encodeURIComponent(id)}`);
    }, true);
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

function renderFeedbackTableStars(cell: Element, rating: number) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  const wrap = cell.querySelector(".fb-stars") || cell;
  wrap.querySelectorAll("svg").forEach((svg, index) => {
    if (index < filled) {
      svg.setAttribute("fill", "#FFC107");
      svg.setAttribute("stroke", "#FFC107");
    } else {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "#CBD5E1");
    }
  });
  wrap.setAttribute("aria-label", `${filled} out of 5 stars`);
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

/**
 * The "Events Registered / Attended / … / Certificates Earned" dropdown links to
 * bare /admin/<view>. Keep the student's id so switching views keeps the student.
 */
function carryUserIdInViewMenu() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("id") || params.get("userId") || "";
  if (!userId) return;
  document
    .querySelectorAll<HTMLAnchorElement>(".ereg-view-menu a[data-view]")
    .forEach((link) => {
      const view = String(link.dataset.view || "").trim();
      if (view) link.href = `/admin/${view}?id=${encodeURIComponent(userId)}`;
    });
}

/** Certificates Earned: replace the placeholder cards with a clear message. */
function setCertGridMessage(message: string | null) {
  const grid = document.querySelector<HTMLElement>(".cert-grid");
  if (!grid) return;
  let note = grid.querySelector<HTMLElement>(".dc-cert-grid-note");
  if (!message) {
    note?.remove();
    return;
  }
  grid.querySelectorAll<HTMLElement>(".cert-card").forEach((card) => setLegacyHidden(card, true));
  if (!note) {
    note = document.createElement("p");
    note.className = "dc-cert-grid-note";
    note.style.cssText =
      "grid-column:1/-1;margin:0;padding:32px 16px;text-align:center;color:#64748b;font-size:14px;line-height:1.5;";
    grid.appendChild(note);
  }
  note.textContent = message;
}

async function hydrateUserEventTables(pageId: string) {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("id") || params.get("userId") || "";
  if (!userId) {
    if (pageId === "cert38") {
      setCertGridMessage("Open a student's profile, then choose Certificates Earned to see their certificates.");
    }
    return;
  }

  const userData = await fetchJson<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(userId)}`);
  const email = userData?.user?.email || "";
  if (!email) {
    if (pageId === "cert38") setCertGridMessage("Couldn't load this student. Go back and open their profile again.");
    return;
  }

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
    const certGrid = document.querySelector<HTMLElement>(".cert-grid");
    const certList = certs?.certificates || [];
    if (!certs) {
      setCertGridMessage("Couldn't load certificates. Check your connection or your permission to view certificates.");
    } else if (!certList.length) {
      setCertGridMessage("No certificates earned yet.");
    } else {
      setCertGridMessage(null);
    }
    patchChildren(certGrid, ".cert-card", certList, (el, cert) => {
      const name = el.querySelector(".name, p.name");
      const eventName = el.querySelector(".event, p.event");
      const issued = el.querySelector(".issued, p.issued");
      if (name) name.textContent = cert.name || "Certificate";
      if (eventName) eventName.textContent = cert.eventName || "—";
      if (issued) {
        issued.textContent = cert.dateIssued ? `Issued ${formatCertDate(cert.dateIssued)}` : "—";
      }
      // The whole card (preview included) opens the certificate PDF.
      const hint = el.querySelector(".cert-preview-inner span");
      if (cert.downloadUrl) {
        el.dataset.certUrl = cert.downloadUrl;
        el.setAttribute("role", "link");
        el.tabIndex = 0;
        el.style.cursor = "pointer";
        el.title = `Open ${cert.name || "certificate"}`;
        el.setAttribute("aria-label", `Open certificate: ${cert.name || "Certificate"}, ${cert.eventName || ""}`);
        if (hint) hint.textContent = "Click to view";
      } else {
        delete el.dataset.certUrl;
        el.removeAttribute("role");
        el.removeAttribute("tabindex");
        el.removeAttribute("aria-label");
        el.style.cursor = "";
        if (hint) hint.textContent = "Not available";
      }
    });
    // One delegated handler — cloned cards don't carry listeners.
    if (certGrid && certGrid.dataset.dcCertOpenWired !== "1") {
      certGrid.dataset.dcCertOpenWired = "1";
      const openCard = (target: EventTarget | null) => {
        const card = (target as HTMLElement | null)?.closest<HTMLElement>("[data-cert-url]");
        const url = card?.dataset.certUrl;
        if (!url) return false;
        window.open(url, "_blank", "noopener");
        return true;
      };
      certGrid.addEventListener("click", (event) => {
        openCard(event.target);
      });
      certGrid.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (openCard(event.target)) event.preventDefault();
      });
    }
  }

  if (pageId === "fb39") {
    const fb = await fetchJson<{
      feedback: Array<{
        id: string;
        title: string;
        type: string;
        rating: number;
        createdAt: string;
      }>;
    }>(`/api/user/feedback?mine=0&email=${encodeURIComponent(email)}`);
    const mine = fb?.feedback || [];
    patchTableRows(document.querySelector(".ereg-table"), mine, (tr, row) => {
      const cells = tr.querySelectorAll("td");
      const title = row.title?.trim() || row.type?.trim() || "—";
      if (cells[0]) {
        let checkbox = cells[0].querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (!checkbox) {
          cells[0].textContent = "";
          checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          cells[0].appendChild(checkbox);
        }
        checkbox.setAttribute("aria-label", title === "—" ? "Select feedback" : `Select ${title}`);
      }
      if (cells[1]) {
        cells[1].textContent = title;
      }
      if (cells[2]) cells[2].textContent = (row.type || "General").toUpperCase();
      if (cells[3]) renderFeedbackTableStars(cells[3], Number(row.rating || 0));
      if (cells[4]) cells[4].textContent = formatEventDate(row.createdAt);
      const link = tr.querySelector<HTMLAnchorElement>("a.ereg-view, a");
      if (link) {
        link.href = `/admin/fbdeets01?id=${encodeURIComponent(row.id)}&userId=${encodeURIComponent(userId)}`;
      }
    });
  }
}

type ListpParticipant = {
  email: string;
  name: string;
  studentNumber: string;
  course: string;
  school: string;
  organization: string;
  organizationRole: string;
  organizationPosition: string;
  statusLabel: string;
  tapInLabel: string;
  tapOutLabel: string;
  durationLabel: string;
  attendanceStatusLabel: string;
  certificateStatus: string;
  filters: {
    errors: boolean;
    manualOverride: boolean;
    onTime: boolean;
    completed: boolean;
    incomplete: boolean;
  };
};

function inferListpFiltersFromStatus(status: string): ListpParticipant["filters"] {
  const normalized = status.trim().toUpperCase();
  return {
    errors: false,
    manualOverride: false,
    onTime:
      normalized === "COMPLETE" ||
      normalized === "ATTENDANCE REQUIREMENT MET" ||
      normalized === "ON TIME",
    completed:
      normalized === "COMPLETE" ||
      normalized === "ATTENDANCE REQUIREMENT MET" ||
      normalized === "LATE",
    incomplete:
      normalized === "UNDERTIME" ||
      normalized === "ABSENT" ||
      normalized === "ATTENDANCE REQUIREMENT INCOMPLETE" ||
      normalized === "INCOMPLETE",
  };
}

function buildListpParticipantsFromTable(root: Element): ListpParticipant[] {
  const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>("#listp-body tr"));
  return rows
    .map((tr) => {
      const name = tr.querySelector(".name-cell span:last-child")?.textContent?.trim() || "";
      if (!name) return null;
      const cells = tr.querySelectorAll("td");
      const statusLabel = (cells[3]?.textContent || "").trim().toUpperCase() || "—";
      return {
        email: String(tr.dataset.email || name).toLowerCase(),
        name,
        studentNumber: (cells[1]?.textContent || "—").trim(),
        course: (cells[2]?.textContent || "—").trim(),
        school: "—",
        organization: "—",
        organizationRole: "—",
        organizationPosition: "—",
        statusLabel,
        tapInLabel: "—",
        tapOutLabel: "—",
        durationLabel: "—",
        attendanceStatusLabel: statusLabel,
        certificateStatus: "—",
        filters: inferListpFiltersFromStatus(statusLabel),
      } satisfies ListpParticipant;
    })
    .filter((row): row is ListpParticipant => Boolean(row));
}

async function resolveListp44EventId(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const direct = params.get("id") || params.get("eventId") || "";
  if (direct) return direct;

  const eventName = (params.get("event") || "").trim();
  if (!eventName || eventName.toLowerCase() === "event name") return "";

  const data = await fetchJson<{ events: Array<{ id: string; title: string }> }>(
    "/api/events?limit=150",
  );
  const target = eventName.toLowerCase();
  const match = (data?.events || []).find(
    (event) => event.title.trim().toLowerCase() === target,
  );
  return match?.id || "";
}

function wireDeets43ListpJump() {
  const jump = document.getElementById("listp-jump");
  if (!(jump instanceof HTMLAnchorElement)) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || "";
  if (!id) return;

  const q = new URLSearchParams(params);
  q.set("id", id);
  if (!q.get("event")) {
    const eventName = document.getElementById("event-name")?.textContent?.trim();
    if (eventName) q.set("event", eventName);
  }
  jump.href = `/admin/listp44?${q.toString()}`;
}

function ensureListp44FilterWrap(root: Element) {
  if (root.querySelector(".listp-filter-wrap")) return;
  const btn = root.querySelector(".listp-filter");
  if (!(btn instanceof HTMLButtonElement)) return;

  const wrap = document.createElement("div");
  wrap.className = "listp-filter-wrap stu-filter-wrap";
  btn.parentNode?.insertBefore(wrap, btn);
  wrap.appendChild(btn);
  btn.classList.add("filter-btn");
  btn.setAttribute("aria-haspopup", "menu");
  btn.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "events-filter-menu stu-filter-menu listp-filter-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  const options: Array<{ id: string; label: string }> = [
    { id: "errors", label: "Errors Detected" },
    { id: "manual", label: "Manual Override" },
    { id: "on-time", label: "On Time" },
    { id: "completed", label: "Completed Attendance" },
    { id: "incomplete", label: "Incomplete Attendance" },
  ];

  for (const opt of options) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.setAttribute("data-listp-filter", opt.id);
    item.textContent = opt.label;
    menu.appendChild(item);
  }

  wrap.appendChild(menu);
}

function matchesListpFilter(participant: ListpParticipant, filter: string) {
  switch (filter) {
    case "errors":
      return participant.filters.errors;
    case "manual":
      return participant.filters.manualOverride;
    case "on-time":
      return participant.filters.onTime;
    case "completed":
      return participant.filters.completed;
    case "incomplete":
      return participant.filters.incomplete;
    default:
      return true;
  }
}

/** Sticky selection across listp44 poll refreshes (email stays until the user picks another). */
let listpSelectedEmail = "";

function readListpSelectedEmail(root?: Element | null) {
  const fromDom = String(
    (root as HTMLElement | null)?.dataset?.dcListpSelectedEmail || listpSelectedEmail || "",
  )
    .trim()
    .toLowerCase();
  return fromDom;
}

function writeListpSelectedEmail(email: string, root?: Element | null) {
  listpSelectedEmail = String(email || "").trim().toLowerCase();
  if (root instanceof HTMLElement) {
    root.dataset.dcListpSelectedEmail = listpSelectedEmail;
  } else {
    const host =
      document.querySelector<HTMLElement>(".admin-legacy-root") ||
      document.querySelector<HTMLElement>("[data-admin-page]");
    if (host) host.dataset.dcListpSelectedEmail = listpSelectedEmail;
  }
}

function selectListpParticipant(
  participant: ListpParticipant,
  index: number,
  root?: Element | null,
) {
  writeListpSelectedEmail(participant.email, root);
  document.querySelectorAll("#listp-body tr").forEach((row) => {
    const rowEmail = String((row as HTMLElement).dataset.email || "").toLowerCase();
    const rowIndex = Number(row.getAttribute("data-index"));
    row.classList.toggle(
      "is-selected",
      listpSelectedEmail
        ? rowEmail === listpSelectedEmail
        : rowIndex === index,
    );
  });
  setText("d-name", participant.name);
  paintInitialsAvatar(document.querySelector<HTMLElement>("#listp-detail .big-avatar"), participant.name, 30);
  setText("d-number", participant.studentNumber || "—");
  setText("d-email", participant.email);
  setText("d-course", courseLabel(participant.course) || "—");
  setText("d-school", schoolLabel(participant.school) || "—");
  setText("d-org", participant.organization || "—");
  setText("d-org-role", roleLabel(participant.organizationRole) || "—");
  setText("d-org-pos", humanizeCode(participant.organizationPosition) || "—");
  setText("d-tap-in", participant.tapInLabel || "—");
  setText("d-tap-out", participant.tapOutLabel || "—");
  setText("d-duration", participant.durationLabel || "—");
  setText("d-att-status", participant.attendanceStatusLabel || "—");
  setText("d-cert", participant.certificateStatus || "—");
}

function clearListpParticipantDetail() {
  [
    "d-name",
    "d-number",
    "d-email",
    "d-course",
    "d-school",
    "d-org",
    "d-org-role",
    "d-org-pos",
    "d-tap-in",
    "d-tap-out",
    "d-duration",
    "d-att-status",
    "d-cert",
  ].forEach((id) => setText(id, "—"));
}

/** Same initials rule as the profile pages: first letters of the first two names. */
function nameInitials(name: string) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

/** The participant avatars are empty gradient circles in the design: put the initials in. */
function paintInitialsAvatar(el: HTMLElement | null, name: string, fontPx: number) {
  if (!el) return;
  const initials = nameInitials(name);
  if (el.textContent !== initials) el.textContent = initials;
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.color = "#fff";
  el.style.fontWeight = "700";
  el.style.fontSize = `${fontPx}px`;
  el.style.letterSpacing = "0.02em";
  el.style.lineHeight = "1";
  el.style.userSelect = "none";
}

function renderListp44Table(participants: ListpParticipant[], selectedEmail = "") {
  const selected = selectedEmail.trim().toLowerCase();
  patchTableRows(document.querySelector(".listp-table"), participants, (tr, row, index) => {
    tr.dataset.index = String(index);
    tr.dataset.email = row.email;
    tr.tabIndex = 0;
    const isSelected = selected
      ? row.email.toLowerCase() === selected
      : index === 0;
    tr.classList.toggle("is-selected", isSelected);

    const nameSpan = tr.querySelector(".name-cell span:last-child");
    if (nameSpan) nameSpan.textContent = row.name;
    paintInitialsAvatar(tr.querySelector<HTMLElement>(".listp-avatar"), row.name, 12);
    const cells = tr.querySelectorAll("td");
    if (cells[1]) cells[1].textContent = row.studentNumber || "—";
    if (cells[2]) cells[2].textContent = courseLabel(row.course) || "—";
    if (cells[3]) cells[3].textContent = row.statusLabel || "—";
  });
}

function wireListp44RowSelection(
  root: Element,
  getParticipants: () => ListpParticipant[],
) {
  const tbody = root.querySelector("#listp-body");
  if (!(tbody instanceof HTMLElement) || tbody.dataset.dcWired === "1") return;
  tbody.dataset.dcWired = "1";

  const pickRow = (row: HTMLTableRowElement) => {
    const index = Number(row.dataset.index);
    const email = String(row.dataset.email || "").toLowerCase();
    const participant =
      getParticipants().find((item) => item.email === email) || getParticipants()[index];
    if (participant) selectListpParticipant(participant, index, root);
  };

  tbody.addEventListener("click", (event) => {
    const row = (event.target as Element | null)?.closest("#listp-body tr");
    if (row instanceof HTMLTableRowElement) pickRow(row);
  });

  tbody.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLTableRowElement)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pickRow(target);
    }
  });
}

function wireListp44AttendanceFilter(
  root: Element,
  getParticipants: () => ListpParticipant[],
  renderParticipants: (participants: ListpParticipant[]) => void,
) {
  ensureListp44FilterWrap(root);
  const wrap = root.querySelector(".listp-filter-wrap");
  if (!(wrap instanceof HTMLElement) || wrap.dataset.dcWired === "1") return;
  wrap.dataset.dcWired = "1";

  const btn = wrap.querySelector(".listp-filter, .filter-btn");
  const menu = wrap.querySelector(".listp-filter-menu, .stu-filter-menu");
  if (!(btn instanceof HTMLButtonElement) || !(menu instanceof HTMLElement)) return;

  let activeFilter = "";

  const closeMenu = () => {
    wrap.classList.remove("open");
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const willOpen = !wrap.classList.contains("open");
    document.querySelectorAll(".listp-filter-wrap.open, .stu-filter-wrap.open").forEach((other) => {
      if (other !== wrap) other.classList.remove("open");
    });
    wrap.classList.toggle("open", willOpen);
    menu.hidden = !willOpen;
    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  menu.querySelectorAll<HTMLButtonElement>("[data-listp-filter]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = item.getAttribute("data-listp-filter") || "";
      activeFilter = activeFilter === next ? "" : next;
      menu.querySelectorAll("[data-listp-filter]").forEach((node) => {
        node.classList.toggle("active", node === item && activeFilter === next);
      });
      const filtered = activeFilter
        ? getParticipants().filter((participant) =>
            matchesListpFilter(participant, activeFilter),
          )
        : getParticipants();
      renderParticipants(filtered);
      closeMenu();
    });
  });

  document.addEventListener("click", (event) => {
    if (!wrap.contains(event.target as Node)) closeMenu();
  });
}

async function hydrateListp44() {
  const root =
    document.querySelector(".admin-legacy-root") ||
    document.querySelector("[data-admin-page]") ||
    document.body;
  if (!root.querySelector(".listp-filter")) return;

  const eventId = await resolveListp44EventId();
  let allParticipants: ListpParticipant[] = [];

  if (eventId) {
    const data = await fetchJson<{ participants: ListpParticipant[] }>(
      `/api/admin/attendance/participants?eventId=${encodeURIComponent(eventId)}`,
    );
    allParticipants = data?.participants || [];
  }

  // Never fall back to scraping demo table rows for tap times — that blanks
  // or invents attendance clocks. Prefer an empty state if the API has nothing.

  if (!allParticipants.length) {
    ensureListp44FilterWrap(root);
    clearListpParticipantDetail();
    return;
  }

  (root as HTMLElement).dataset.dcListpCount = String(allParticipants.length);
  let displayedParticipants = allParticipants;

  const renderParticipants = (participants: ListpParticipant[]) => {
    displayedParticipants = participants;
    const preferredEmail = readListpSelectedEmail(root);
    const selectedIndex = preferredEmail
      ? participants.findIndex((item) => item.email.toLowerCase() === preferredEmail)
      : -1;
    const index = selectedIndex >= 0 ? selectedIndex : 0;
    const selected = participants[index];

    renderListp44Table(participants, selected?.email || "");
    if (selected) selectListpParticipant(selected, index, root);
    else clearListpParticipantDetail();
  };

  const activeFilterEl = root.querySelector<HTMLElement>(
    ".listp-filter-wrap [data-listp-filter].active",
  );
  const activeFilter = activeFilterEl?.getAttribute("data-listp-filter") || "";
  const initialRows = activeFilter
    ? allParticipants.filter((participant) => matchesListpFilter(participant, activeFilter))
    : allParticipants;

  renderParticipants(initialRows);
  wireListp44RowSelection(root, () => displayedParticipants);
  wireListp44AttendanceFilter(root, () => allParticipants, renderParticipants);
}

async function hydrateManageCounts(pageId: string) {
  const isAdminManage = pageId === "manageadmin";
  const role =
    pageId === "manages28" ? "student" : pageId === "managef29" ? "faculty" : isAdminManage ? "admins" : "";
  const query = new URLSearchParams({ limit: "200" });
  if (role) query.set("role", role);

  const data = await fetchJson<{ users: AdminUser[]; total?: number }>(
    `/api/admin/users?${query.toString()}`,
  );
  const users = data?.users || [];
  const n = String(data?.total ?? users.length);

  const countNum = document.querySelector<HTMLElement>(".stu-count-num");
  if (countNum) countNum.textContent = n;

  const countLabel = document.querySelector<HTMLElement>(".stu-count-label");
  if (countLabel) {
    const labelText = isAdminManage ? "Admins" : "Users";
    // Keep info icon if present
    const icon = countLabel.querySelector("svg");
    countLabel.textContent = labelText;
    if (icon) countLabel.appendChild(icon);
  }

  document.querySelectorAll(".ms-count, .school-count, .stat-value, .count, .adm-kpi-value").forEach((el) => {
    const text = (el.textContent || "").trim();
    if (text === "50" || el.classList.contains("stu-count-num")) el.textContent = n;
  });
}

/**
 * Wires remaining admin pages (users, profile, notifications, RFID, certs, reports)
 * to live Mongo APIs without restyling legacy markup.
 */
export function AdminOpsBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryId = searchParams.get("id") || "";
  const queryEvent = searchParams.get("event") || "";

  // Top bar "Live" button and people search navigate without a full reload.
  useEffect(() => {
    adminNavigate = (href) => router.push(href);
    router.prefetch("/admin/rfid17");
    // Warm the main sidebar pages while the browser is idle so switching is instant.
    const warm = () =>
      ["/admin/home12", "/admin/event13", "/admin/user27", "/admin/attendance42", "/admin/cert45", "/admin/feedback47", "/admin/report51"].forEach(
        (href) => router.prefetch(href),
      );
    // Some phone browsers have no requestIdleCallback: fall back to a short delay.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const handle = hasIdle ? window.requestIdleCallback(warm, { timeout: 4000 }) : window.setTimeout(warm, 2000);
    return () => {
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [router]);

  useEffect(() => {
    const pageId = pageIdFromPath(pathname);
    if (
      !pageId ||
      pageId === "login02" ||
      pageId === "register03" ||
      pageId === "verify06" ||
      pageId === "pass07" ||
      pageId === "agreement08" ||
      pageId === "fp09" ||
      pageId === "fpv10" ||
      pageId === "fpp11" ||
      pageId === "school04" ||
      pageId === "acc1" ||
      pageId === "acc05"
    ) {
      return;
    }
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      // Look the page container up on every run: when this bridge mounts before the
      // legacy HTML is swapped in, an element captured once would be a stale,
      // detached node and everything below would silently act on nothing.
      const root = currentAdminRoot(pageId);
      try {
        if (root instanceof Element && root.getAttribute("data-dc-blanked") !== pageId) {
          // Keep placeholder notifications visible until live data replaces them.
          if (pageId !== "listp44" && pageId !== "notif1") {
            hideLegacyDemoContent(root);
          }
          root.setAttribute("data-dc-blanked", pageId);
        }
        if (root instanceof Element) wireTopbarShortcuts(root);
        watchProfileInitials();
        if (pageId === "fulld46" || pageId === "certdeets46") ensureCertificateRowActionsWired();
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
          carryUserIdInViewMenu();
          await hydrateSubDetailUserHeader();
          await hydrateUserEventTables(pageId);
        }
        if (pageId === "listp44") await hydrateListp44();
        if (pageId === "deets43") wireDeets43ListpJump();
        if (pageId === "fbdeets01") await hydrateFbDeets01();
        if (pageId === "vorg36") await hydrateVorg36();
        if (pageId === "vsaved1" || pageId === "vattend34" || pageId === "regview33") {
          await hydrateVsaved1();
        }
        if (pageId === "administration") await hydrateAdministration(root);
        if (pageId === "profile") await hydrateAdminProfile();
        if (pageId === "notif1") await hydrateAdminNotifications();
        else await updateAdminNotifBadge();
        if (pageId === "rfid17") await hydrateRfid({ light: true });
        if (pageId === "certdeets46" || pageId === "fulld46") await hydrateCertificateDetails();
        if (
          pageId === "feeddeets49" ||
          pageId === "cc19" ||
          pageId === "edetails14" ||
          pageId === "aed15"
        ) {
          const eventId = new URLSearchParams(window.location.search).get("id") || "";
          if (eventId) wireEventPdfReportButtons(eventId);
        }
        if (pageId === "report51" || pageId === "reportgen53") wireReportsDownload();
        if (pageId === "user27") wireUser27Views(root);
        wireLiveSearch(root);
        syncProfileInitials();
      } catch {
        /* keep static markup */
      }
    };

    const t1 = window.requestAnimationFrame(() => void run());
    const onLegacyReady = (event: Event) => {
      const detail = (event as CustomEvent<{ pageId?: string }>).detail;
      if (detail?.pageId && detail.pageId !== pageIdFromPath(pathname)) return;
      void run();
    };
    document.addEventListener("dc-legacy-content-ready", onLegacyReady);
    const pollMs =
      pageIdFromPath(pathname) === "rfid17"
        ? 5000
        : pageIdFromPath(pathname) === "notif1"
          ? 10000
          : 20000;
    const stopPoll = startSmartPoll(run, pollMs);
    const stopBadgePoll = startSmartPoll(() => {
      if (pageIdFromPath(pathname) === "notif1") return;
      return updateAdminNotifBadge();
    }, 15000);
    return () => {
      cancelled = true;
      document.removeEventListener("dc-legacy-content-ready", onLegacyReady);
      window.cancelAnimationFrame(t1);
      stopPoll();
      stopBadgePoll();
      if (pageIdFromPath(pathname) === "rfid17") {
        rfidScannerWired = false;
      }
    };
  }, [pathname, queryId, queryEvent]);

  return null;
}
