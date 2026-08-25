"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const DRAFT_KEY = "dcspaceAdminRegisterDraft";

type AdminRegisterDraft = {
  role?: "admin" | "super-admin";
  firstName?: string;
  middleName?: string;
  lastName?: string;
  idNumber?: string;
  program?: string;
  department?: string;
  rfid?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  verificationCode?: string;
};

function pageIdFromPath(pathname: string | null) {
  if (!pathname) return "";
  if (pathname === "/admin") return "selection01";
  const parts = pathname.split("/").filter(Boolean);
  return parts[1] || "";
}

function readDraft(): AdminRegisterDraft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AdminRegisterDraft;
  } catch {
    return {};
  }
}

function writeDraft(patch: AdminRegisterDraft) {
  const next = { ...readDraft(), ...patch };
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}

function clearDraft() {
  window.sessionStorage.removeItem(DRAFT_KEY);
}

function pendingRole(searchParams: URLSearchParams): "admin" | "super-admin" {
  const fromQuery = searchParams.get("role");
  if (fromQuery === "super-admin" || fromQuery === "admin") return fromQuery;
  try {
    const stored = localStorage.getItem("dc_admin_pending_role");
    if (stored === "super-admin" || stored === "admin") return stored;
  } catch {
    /* ignore */
  }
  const draft = readDraft();
  if (draft.role === "super-admin" || draft.role === "admin") return draft.role;
  return "admin";
}

function setInputValue(id: string, value: string | undefined) {
  if (!value) return;
  const el = document.getElementById(id) as
    | HTMLInputElement
    | HTMLSelectElement
    | null;
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  if (el.tagName === "SELECT") {
    el.classList.toggle("has-value", Boolean(el.value));
  }
}

function ensureRoleSelect(preferred: "admin" | "super-admin") {
  const select = document.getElementById("account-role") as HTMLSelectElement | null;
  if (!select) return;
  if (!select.value) select.value = preferred;
  select.classList.toggle("has-value", Boolean(select.value));
}

/**
 * Wires the public admin registration wizard (register03 → agreement)
 * and creates Admin / Super Admin accounts via /api/admin/auth/register.
 */
export function AdminRegisterBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const pageId = pageIdFromPath(pathname);
    const wizardPages = new Set([
      "register03",
      "school04",
      "acc05",
      "verify06",
      "pass07",
      "agreement08",
    ]);
    if (!wizardPages.has(pageId)) return;

    const root =
      document.querySelector(".admin-legacy-root") ||
      document.querySelector("[data-admin-page]") ||
      document.body;

    const role = pendingRole(searchParams);
    writeDraft({ role });
    try {
      localStorage.setItem("dc_admin_pending_role", role);
    } catch {
      /* ignore */
    }

    const draft = readDraft();
    if (pageId === "register03") {
      ensureRoleSelect(role);
      setInputValue("first-name", draft.firstName);
      setInputValue("middle-name", draft.middleName);
      setInputValue("last-name", draft.lastName);
      setInputValue("id-number", draft.idNumber);
      if (draft.role) ensureRoleSelect(draft.role);
    }
    if (pageId === "school04") {
      setInputValue("program", draft.program);
      setInputValue("department", draft.department);
    }
    if (pageId === "acc05") {
      setInputValue("rfid", draft.rfid);
      setInputValue("email", draft.email);
    }

    let submitting = false;

    const collectRegister03 = () => {
      const firstName = (
        document.getElementById("first-name") as HTMLInputElement | null
      )?.value?.trim();
      const middleName = (
        document.getElementById("middle-name") as HTMLInputElement | null
      )?.value?.trim();
      const lastName = (
        document.getElementById("last-name") as HTMLInputElement | null
      )?.value?.trim();
      const idNumber = (
        document.getElementById("id-number") as HTMLInputElement | null
      )?.value?.trim();
      const selectedRole = (
        document.getElementById("account-role") as HTMLSelectElement | null
      )?.value as "admin" | "super-admin" | "" | undefined;

      if (!firstName || !lastName || !idNumber) {
        window.alert("Please complete the required basic information fields.");
        return null;
      }
      if (selectedRole !== "admin" && selectedRole !== "super-admin") {
        window.alert("Please select Admin or Super Admin.");
        return null;
      }
      return writeDraft({
        firstName,
        middleName: middleName || "",
        lastName,
        idNumber,
        role: selectedRole,
      });
    };

    const collectSchool04 = () => {
      const program = (
        document.getElementById("program") as HTMLSelectElement | null
      )?.value?.trim();
      const department = (
        document.getElementById("department") as HTMLSelectElement | null
      )?.value?.trim();
      if (!program || !department) {
        window.alert("Please select your program and department.");
        return null;
      }
      return writeDraft({ program, department });
    };

    const goAcc05 = async () => {
      if (submitting) return;
      const rfid = (
        document.getElementById("rfid") as HTMLInputElement | null
      )?.value?.trim();
      const email = (
        document.getElementById("email") as HTMLInputElement | null
      )?.value?.trim()
        .toLowerCase();
      const password = (
        document.getElementById("password") as HTMLInputElement | null
      )?.value || "";
      const confirmPassword =
        (
          document.getElementById("confirm-password") as HTMLInputElement | null
        )?.value || password;

      if (!rfid || !email || !password) {
        window.alert("Please complete RFID, school email, and password.");
        return;
      }
      if (!email.endsWith("@sdca.edu.ph")) {
        window.alert("Use your school email ending in @sdca.edu.ph.");
        return;
      }
      if (password.length < 8) {
        window.alert("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        window.alert("Passwords do not match.");
        return;
      }

      submitting = true;
      try {
        writeDraft({ rfid, email, password, confirmPassword });
        const res = await fetch("/api/user/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Failed to send verification code.");
        }
        window.alert(
          payload.message || "Verification code sent. Check your school email.",
        );
        window.location.assign("/admin/verify06");
      } catch (error) {
        window.alert(
          error instanceof Error ? error.message : "Unable to continue.",
        );
      } finally {
        submitting = false;
      }
    };

    const createAccount = async () => {
      if (submitting) return;
      const consent = document.getElementById("consent") as HTMLInputElement | null;
      if (consent && !consent.checked) {
        window.alert("Please accept the Data Privacy Policy.");
        return;
      }

      const latest = readDraft();
      const codeInput = document.getElementById("code") as HTMLInputElement | null;
      const verificationCode = (
        latest.verificationCode ||
        codeInput?.value ||
        ""
      )
        .trim()
        .replace(/\s/g, "");

      if (!/^\d{6}$/.test(verificationCode)) {
        window.alert("Enter the 6-digit verification code.");
        return;
      }
      if (
        !latest.firstName ||
        !latest.lastName ||
        !latest.idNumber ||
        !latest.email ||
        !latest.password ||
        !latest.role
      ) {
        window.alert("Registration details are incomplete. Start again from Basic Information.");
        window.location.assign("/admin/register03");
        return;
      }

      submitting = true;
      try {
        const res = await fetch("/api/admin/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: latest.firstName,
            middleName: latest.middleName || "",
            lastName: latest.lastName,
            idNumber: latest.idNumber,
            studentNumber: latest.idNumber,
            email: latest.email,
            password: latest.password,
            confirmPassword: latest.confirmPassword || latest.password,
            verificationCode,
            rfidNumber: latest.rfid || "",
            program: latest.program || "",
            course: latest.program || "",
            department: latest.department || "",
            school: latest.department || "",
            role: latest.role,
            dataPrivacyAccepted: true,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload.error || "Unable to create account.");
        }

        try {
          localStorage.setItem(
            "dc_admin_role",
            latest.role === "super-admin" ? "super-admin" : "admin",
          );
          localStorage.removeItem("dc_admin_pending_role");
        } catch {
          /* ignore */
        }
        clearDraft();
        window.alert(payload.message || "Account created successfully.");
        window.location.assign("/admin/home12");
      } catch (error) {
        window.alert(
          error instanceof Error ? error.message : "Unable to create account.",
        );
      } finally {
        submitting = false;
      }
    };

    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || !root.contains(target)) return;

      const createBtn = target.closest("#create-account");
      if (createBtn) {
        event.preventDefault();
        event.stopPropagation();
        void createAccount();
        return;
      }

      if (pageId === "register03") {
        const btn = target.closest(".continue-btn");
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        const saved = collectRegister03();
        if (!saved) return;
        window.location.assign("/admin/school04");
      }
    };

    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || !root.contains(form)) return;

      if (form.id === "register-form") {
        event.preventDefault();
        event.stopPropagation();
        const saved = collectRegister03();
        if (!saved) return;
        window.location.assign("/admin/school04");
        return;
      }

      if (form.id === "school-form") {
        event.preventDefault();
        event.stopPropagation();
        const saved = collectSchool04();
        if (!saved) return;
        window.location.assign("/admin/acc05");
        return;
      }

      if (form.id === "account-form") {
        event.preventDefault();
        event.stopPropagation();
        void goAcc05();
        return;
      }

      if (form.id === "verify-form") {
        // Let legacy open the agreement modal; stash the code first.
        const code = (
          form.querySelector<HTMLInputElement>("#code")?.value || ""
        )
          .trim()
          .replace(/\s/g, "");
        if (!/^\d{6}$/.test(code)) {
          event.preventDefault();
          event.stopPropagation();
          window.alert("Enter the 6-digit verification code.");
          return;
        }
        writeDraft({ verificationCode: code });
      }
    };

    root.addEventListener("click", onClick, true);
    root.addEventListener("submit", onSubmit, true);

    return () => {
      root.removeEventListener("click", onClick, true);
      root.removeEventListener("submit", onSubmit, true);
    };
  }, [pathname, searchParams]);

  return null;
}
