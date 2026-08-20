"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  clearRegistrationDraft,
  readRegistrationDraft,
  registerUser,
  saveAuthSession,
  sendRegistrationVerificationEmail,
  syncProfileToLegacyStorage,
  writeRegistrationDraft,
} from "@/lib/user-api";
import { canOrganizeEvents } from "@/lib/organize-access";

function showError(message: string) {
  window.alert(message);
}

function clearError() {
  /* no injected UI — keep original page layout */
}

function setSubmitting(form: HTMLFormElement, submitting: boolean) {
  const button =
    form.querySelector<HTMLButtonElement>("[data-auth-continue]") ||
    form.querySelector<HTMLButtonElement>('button[type="submit"], .btn-continue, .btn-create, .btn-signin');
  if (!button) {
    return;
  }
  button.disabled = submitting;
}

function getActiveRole(): "student" | "faculty" {
  const active = document.querySelector<HTMLElement>(
    ".role-btn.active, .role-btn[aria-pressed='true']",
  );
  const role =
    active?.getAttribute("data-role") || window.localStorage.getItem("dcspaceAccountType");
  return role === "faculty" ? "faculty" : "student";
}

function lockNativeFormNavigation(form: HTMLFormElement) {
  form.setAttribute("method", "post");
  form.setAttribute("action", "javascript:void(0)");
  form.setAttribute("onsubmit", "return false;");
}

function isPasswordStrong(password: string) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function requireFields(
  data: FormData,
  fields: Array<{ name: string; label: string }>,
): string | null {
  for (const field of fields) {
    if (!String(data.get(field.name) || "").trim()) {
      return `${field.label} is required.`;
    }
  }
  return null;
}

function lockAllAuthForms() {
  document.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
    // Student login is handled by LoginBridge — leave its native submit path alone.
    if (form.closest(".signin-card")) return;
    lockNativeFormNavigation(form);
  });
}

function findAuthForm(from: EventTarget | null): HTMLFormElement | null {
  if (!(from instanceof Element)) {
    return null;
  }
  return from.closest("form");
}

function go(path: string) {
  // Hard navigation so step-to-step never stalls on a soft-router race.
  window.location.assign(path);
}

const AUTH_PATHS = new Set([
  "/login",
  "/create",
  "/school-details",
  "/accounts",
  "/verify",
  "/agreement",
  "/forgot-password",
  "/forgot-password/verify",
  "/new-password",
]);

export function useAuthFormBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!AUTH_PATHS.has(pathname)) {
      return;
    }

    let cancelled = false;
    let submitting = false;

    lockAllAuthForms();
    const lockTimer = window.setInterval(() => {
      if (!cancelled) lockAllAuthForms();
    }, 200);
    const observer = new MutationObserver(() => {
      if (!cancelled) lockAllAuthForms();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const handleAuthAction = async (formEl: HTMLFormElement) => {
      if (cancelled || submitting) {
        return;
      }

      clearError();
      lockNativeFormNavigation(formEl);
      const data = new FormData(formEl);

      try {
        if (pathname === "/login") {
          // Login is handled by LoginBridge + /api/auth/login (main design).
          return;
        }

        if (pathname === "/create") {
          const missing = requireFields(data, [
            { name: "firstName", label: "First name" },
            { name: "lastName", label: "Last name" },
            { name: "studentNumber", label: "Student number" },
          ]);
          if (missing) {
            showError(missing);
            return;
          }
          writeRegistrationDraft({
            firstName: String(data.get("firstName") || "").trim(),
            lastName: String(data.get("lastName") || "").trim(),
            studentNumber: String(data.get("studentNumber") || "").trim(),
          });
          go("/school-details");
          return;
        }

        if (pathname === "/school-details") {
          const missing = requireFields(data, [
            { name: "course", label: "Course" },
            { name: "schoolDepartment", label: "School / department" },
          ]);
          if (missing) {
            showError(missing);
            return;
          }

          const organizationRoleSelect = String(data.get("organizationRole") || "").trim();
          const organizationPosition = String(data.get("organizationPosition") || "").trim();
          const organizationRole = organizationRoleSelect
            ? organizationPosition && organizationRoleSelect === "officer"
              ? `${organizationRoleSelect}:${organizationPosition}`
              : organizationRoleSelect
            : organizationPosition;

          writeRegistrationDraft({
            course: String(data.get("course") || "").trim(),
            school: String(data.get("schoolDepartment") || "").trim(),
            organizationPart: String(data.get("organization") || "").trim(),
            organizationRole,
          });
          go("/accounts");
          return;
        }

        if (pathname === "/accounts") {
          const email = String(data.get("email") || "")
            .trim()
            .toLowerCase();
          const password = String(data.get("password") || "");
          const confirmPassword = String(data.get("confirmPassword") || "");
          const rfidNumber = String(data.get("rfidTagNumber") || "").trim();

          if (!email.endsWith("@sdca.edu.ph")) {
            showError("Please use your school email (@sdca.edu.ph).");
            return;
          }
          if (!rfidNumber) {
            showError("Please enter your RFID tag number.");
            return;
          }
          if (password !== confirmPassword) {
            showError("Passwords do not match.");
            return;
          }
          if (!isPasswordStrong(password)) {
            showError(
              "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.",
            );
            return;
          }

          const draftSoFar = readRegistrationDraft();
          if (!draftSoFar.firstName || !draftSoFar.lastName || !draftSoFar.studentNumber) {
            showError("Registration details are incomplete. Please start again from Create Account.");
            go("/create");
            return;
          }

          submitting = true;
          setSubmitting(formEl, true);
          writeRegistrationDraft({
            email,
            password,
            confirmPassword,
            rfidNumber,
            role: getActiveRole(),
          });

          const result = await sendRegistrationVerificationEmail(email);
          clearError();
          window.alert(
            result.message ||
              "Verification code sent. Check your school email, or the terminal running npm run dev.",
          );
          go("/verify");
          return;
        }

        if (pathname === "/verify") {
          const verificationCode = String(data.get("verificationCode") || "")
            .trim()
            .replace(/\s/g, "");
          if (!/^\d{6}$/.test(verificationCode)) {
            showError("Enter the 6-digit verification code from your email (or server terminal).");
            return;
          }
          writeRegistrationDraft({ verificationCode });
          go("/agreement");
          return;
        }

        if (pathname === "/forgot-password") {
          const email = String(
            data.get("schoolEmail") ||
              (document.getElementById("schoolEmail") as HTMLInputElement | null)?.value ||
              "",
          )
            .trim()
            .toLowerCase();
          if (!email.endsWith("@sdca.edu.ph")) {
            showError("Please use your school email (@sdca.edu.ph).");
            return;
          }
          submitting = true;
          setSubmitting(formEl, true);
          const res = await fetch("/api/user/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.error || "Failed to send reset code.");
          }
          window.sessionStorage.setItem("dcspaceResetEmail", email);
          window.alert(payload.message || "Verification code sent.");
          go("/forgot-password/verify");
          return;
        }

        if (pathname === "/forgot-password/verify") {
          const email = window.sessionStorage.getItem("dcspaceResetEmail") || "";
          const verificationCode = String(
            data.get("verificationCode") ||
              (document.getElementById("verificationCode") as HTMLInputElement | null)?.value ||
              "",
          )
            .trim()
            .replace(/\s/g, "");
          if (!email) {
            showError("Start again from the school email step.");
            go("/forgot-password");
            return;
          }
          if (!/^\d{6}$/.test(verificationCode)) {
            showError("Enter the 6-digit verification code from your email.");
            return;
          }
          submitting = true;
          setSubmitting(formEl, true);
          const res = await fetch("/api/user/auth/verify-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code: verificationCode }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.error || "Invalid verification code.");
          }
          window.sessionStorage.setItem("dcspaceResetCode", verificationCode);
          go("/new-password");
          return;
        }

        if (pathname === "/new-password") {
          const email = window.sessionStorage.getItem("dcspaceResetEmail") || "";
          const code = window.sessionStorage.getItem("dcspaceResetCode") || "";
          const newPassword = String(
            data.get("newPassword") ||
              (document.getElementById("newPassword") as HTMLInputElement | null)?.value ||
              "",
          );
          const confirmPassword = String(
            data.get("confirmPassword") ||
              (document.getElementById("confirmPassword") as HTMLInputElement | null)?.value ||
              "",
          );
          if (!email || !code) {
            showError("Start again from the school email step.");
            go("/forgot-password");
            return;
          }
          if (newPassword !== confirmPassword) {
            showError("Passwords do not match.");
            return;
          }
          if (!isPasswordStrong(newPassword)) {
            showError(
              "Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.",
            );
            return;
          }
          submitting = true;
          setSubmitting(formEl, true);
          const res = await fetch("/api/user/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code, newPassword, confirmPassword }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.error || "Failed to reset password.");
          }
          window.sessionStorage.removeItem("dcspaceResetEmail");
          window.sessionStorage.removeItem("dcspaceResetCode");
          window.alert(payload.message || "Password updated. You can sign in now.");
          go("/login");
          return;
        }

        if (pathname === "/agreement") {
          const consent = formEl.querySelector<HTMLInputElement>("#consent");
          if (!consent?.checked) {
            showError("Please agree to the Data Privacy Notice to continue.");
            return;
          }

          const draft = readRegistrationDraft();
          if (
            !draft.firstName ||
            !draft.lastName ||
            !draft.studentNumber ||
            !draft.email ||
            !draft.password ||
            !draft.confirmPassword ||
            !draft.verificationCode
          ) {
            showError("Registration details are incomplete. Please start again from Create Account.");
            return;
          }

          submitting = true;
          setSubmitting(formEl, true);
          const result = await registerUser({
            firstName: draft.firstName,
            lastName: draft.lastName,
            studentNumber: draft.studentNumber,
            email: draft.email,
            rfidNumber: draft.rfidNumber,
            organizationPart: draft.organizationPart,
            organizationRole: draft.organizationRole,
            course: draft.course,
            school: draft.school,
            password: draft.password,
            confirmPassword: draft.confirmPassword,
            verificationCode: draft.verificationCode,
            role: draft.role || "student",
            dataPrivacyAccepted: true,
          });

          saveAuthSession(result.token, result.user);
          syncProfileToLegacyStorage(result.user);

          // Set shared session cookie so /home and /organized work immediately.
          try {
            await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: draft.email,
                password: draft.password,
                portal: "user",
              }),
            });
          } catch {
            /* cookie sync is best-effort; JWT session already saved */
          }

          clearRegistrationDraft();
          window.location.assign(
            canOrganizeEvents(result.user) ? "/organized" : "/home",
          );
          return;
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        setSubmitting(formEl, false);
        submitting = false;
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }
      // Login button clicks are owned by LoginBridge — do not intercept.
      if (pathname === "/login") {
        return;
      }
      const button = target.closest<HTMLButtonElement>(
        "[data-auth-continue], .btn-continue, .btn-send, .btn-submit, .btn-save, button.btn-create, button.btn-signin",
      );
      if (!button || button.disabled) {
        return;
      }
      // Ignore password toggles / role chips that might share a class.
      if (
        button.classList.contains("toggle-password") ||
        button.classList.contains("role-btn")
      ) {
        return;
      }
      const formEl = findAuthForm(button);
      if (!formEl) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void handleAuthAction(formEl);
    };

    const onSubmit = (event: Event) => {
      const formEl = event.target as HTMLFormElement | null;
      if (!formEl || formEl.tagName !== "FORM") {
        return;
      }
      // Login submit is owned by LoginBridge.
      if (pathname === "/login") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof (event as SubmitEvent).stopImmediatePropagation === "function") {
        (event as SubmitEvent).stopImmediatePropagation();
      }
      void handleAuthAction(formEl);
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);

    return () => {
      cancelled = true;
      window.clearInterval(lockTimer);
      observer.disconnect();
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname]);
}
