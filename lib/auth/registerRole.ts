export const REGISTER_ROLE_KEY = "dcspace_register_role";

export type RegisterRole = "student" | "faculty";

export function isRegisterRole(value: string | null | undefined): value is RegisterRole {
  return value === "student" || value === "faculty";
}

export function readRegisterRole(): RegisterRole {
  if (typeof window === "undefined") return "student";
  const fromQuery = new URLSearchParams(window.location.search).get("role");
  if (isRegisterRole(fromQuery)) return fromQuery;
  try {
    const stored = window.sessionStorage.getItem(REGISTER_ROLE_KEY);
    if (isRegisterRole(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "student";
}

export function writeRegisterRole(role: RegisterRole) {
  try {
    window.sessionStorage.setItem(REGISTER_ROLE_KEY, role);
  } catch {
    /* ignore */
  }
}

export function applyIdNumberField(role: RegisterRole) {
  const input = document.getElementById("studentNumber") as HTMLInputElement | null;
  const label =
    (document.getElementById("idNumberLabel") as HTMLLabelElement | null) ||
    document.querySelector<HTMLLabelElement>('label[for="studentNumber"]');
  if (!label && !input) return;

  const isFaculty = role === "faculty";
  if (label) {
    label.innerHTML = `${isFaculty ? "Employee Number" : "Student Number"}<span class="req">*</span>`;
  }
  if (input) {
    input.placeholder = isFaculty
      ? "Enter your employee number"
      : "Enter your student number";
    input.setAttribute("aria-label", isFaculty ? "Employee Number" : "Student Number");
  }

  const hidden = document.getElementById("registerRole") as HTMLInputElement | null;
  if (hidden) hidden.value = role;
}

export function syncRoleCapsules(role: RegisterRole) {
  document.querySelectorAll<HTMLButtonElement>(".role-btn[data-role]").forEach((btn) => {
    const active = btn.dataset.role === role;
    btn.classList.toggle("active", active);
    btn.classList.toggle("inactive", !active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  document.querySelectorAll<HTMLAnchorElement>('a[href^="/create"]').forEach((link) => {
    const url = new URL(link.getAttribute("href") || "/create", window.location.origin);
    url.searchParams.set("role", role);
    link.setAttribute("href", `${url.pathname}?${url.searchParams.toString()}`);
  });
}

export function applyRegisterRole(role: RegisterRole) {
  writeRegisterRole(role);
  syncRoleCapsules(role);
  applyIdNumberField(role);
}
