"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { readRegisterRole } from "@/lib/auth/registerRole";

function ensureErrorBanner() {
  let banner = document.getElementById("dcspace-auth-error");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "dcspace-auth-error";
    banner.setAttribute("role", "alert");
    banner.style.cssText = [
      "display:none",
      "position:fixed",
      "top:16px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:9999",
      "max-width:min(520px,92vw)",
      "padding:12px 16px",
      "border-radius:10px",
      "background:#7f1d1d",
      "color:#fff",
      "font:600 14px/1.4 system-ui,sans-serif",
      "box-shadow:0 8px 24px rgba(0,0,0,.2)",
    ].join(";");
    document.body.appendChild(banner);
  }
  return banner;
}

function showError(message: string) {
  const banner = ensureErrorBanner();
  banner.textContent = message;
  banner.style.display = "block";
}

function clearError() {
  const banner = document.getElementById("dcspace-auth-error");
  if (banner) {
    banner.style.display = "none";
    banner.textContent = "";
  }
}

function setSubmitting(form: HTMLFormElement, submitting: boolean) {
  const button =
    form.querySelector<HTMLButtonElement>("[data-auth-continue]") ||
    form.querySelector<HTMLButtonElement>(
      'button[type="submit"], .btn-continue, .btn-create, .btn-signin, .btn-send, .btn-submit, .btn-save',
    );
  if (!button) {
    return;
  }
  if (submitting) {
    button.dataset.originalLabel = button.textContent || "";
    button.disabled = true;
    button.textContent = "Please wait…";
  } else {
    button.disabled = false;
    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
    }
  }
}

function getActiveRole(): "student" | "faculty" {
  const active = document.querySelector<HTMLElement>(
    ".role-btn.active, .role-btn[aria-pressed='true']",
  );
  const role =
    active?.getAttribute("data-role") ||
    window.localStorage.getItem("dcspaceAccountType") ||
    readRegisterRole();
  return role === "faculty" ? "faculty" : "student";
}

function idNumberFieldLabel(role: "student" | "faculty") {
  return role === "faculty" ? "Employee number" : "Student number";
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
  document.querySelectorAll<HTMLFormElement>("form").forEach(lockNativeFormNavigation);
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

const RESET_EMAIL_KEY = "dcspaceResetEmail";
const RESET_CODE_KEY = "dcspaceResetCode";

function readResetEmail() {
  try {
    return (window.sessionStorage.getItem(RESET_EMAIL_KEY) || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function writeResetEmail(email: string) {
  try {
    window.sessionStorage.setItem(RESET_EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}

function writeResetCode(code: string) {
  try {
    window.sessionStorage.setItem(RESET_CODE_KEY, code);
  } catch {
    /* ignore */
  }
}

function readResetCode() {
  try {
    return (window.sessionStorage.getItem(RESET_CODE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function clearResetSession() {
  try {
    window.sessionStorage.removeItem(RESET_EMAIL_KEY);
    window.sessionStorage.removeItem(RESET_CODE_KEY);
  } catch {
    /* ignore */
  }
}

export function useAuthFormBridge() {
  const pathname = usePathname();
  const router = useRouter();

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
            {
              name: "studentNumber",
              label: idNumberFieldLabel(getActiveRole()),
            },
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
          // Store role only (e.g. "officer") — never append organization position.
          const organizationRole = organizationRoleSelect || "";

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
            `${result.message || "Verification code sent."}\n\nUse the newest 6-digit code from your school email (older emails will not work).`,
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
          const draft = readRegistrationDraft();
          if (!draft.email) {
            showError("Registration details are incomplete. Please start again from Create Account.");
            return;
          }

          submitting = true;
          setSubmitting(formEl, true);
          const check = await fetch("/api/user/auth/check-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: draft.email, verificationCode }),
          });
          const checkPayload = await check.json().catch(() => ({}));
          if (!check.ok) {
            throw new Error(
              checkPayload.error ||
                "Invalid or outdated verification code. Request a new code and use the latest email.",
            );
          }

          writeRegistrationDraft({ verificationCode });
          go("/agreement");
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

          // Set main-branch organizer session cookie so /organized middleware works.
          try {
            await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: draft.email,
                password: draft.password,
              }),
            });
          } catch {
            /* cookie sync is best-effort; JWT session already saved */
          }

          clearRegistrationDraft();
          router.push(canOrganizeEvents(result.user) ? "/organized" : "/home");
          return;
        }

        if (pathname === "/forgot-password") {
          const email = String(
            data.get("schoolEmail") || data.get("email") || "",
          )
            .trim()
            .toLowerCase();
          if (!email.endsWith("@sdca.edu.ph")) {
            showError("Use your school email ending in @sdca.edu.ph.");
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
            throw new Error(payload.error || payload.details || "Failed to send reset code.");
          }

          writeResetEmail(email);
          clearError();
          window.alert(
            `${payload.message || "If this email is registered, a verification code was sent."}\n\nUse the newest 6-digit code from your school email.`,
          );
          go("/forgot-password/verify");
          return;
        }

        if (pathname === "/forgot-password/verify") {
          const verificationCode = String(
            data.get("verificationCode") || data.get("code") || "",
          )
            .trim()
            .replace(/\s/g, "");
          if (!/^\d{6}$/.test(verificationCode)) {
            showError("Enter the 6-digit verification code from your email (or server terminal).");
            return;
          }

          const email =
            readResetEmail() ||
            new URLSearchParams(window.location.search).get("schoolEmail")?.trim().toLowerCase() ||
            "";
          if (!email) {
            showError("Start again from the school email step.");
            go("/forgot-password");
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

          writeResetEmail(email);
          writeResetCode(verificationCode);
          go("/new-password");
          return;
        }

        if (pathname === "/new-password") {
          const newPassword = String(data.get("newPassword") || data.get("password") || "");
          const confirmPassword = String(data.get("confirmPassword") || "");
          const email = readResetEmail();
          const code = readResetCode();

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
            body: JSON.stringify({
              email,
              code,
              newPassword,
              confirmPassword,
            }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(payload.error || "Failed to reset password.");
          }

          clearResetSession();
          window.alert(payload.message || "Password updated. You can sign in now.");
          go("/login");
          return;
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        setSubmitting(formEl, false);
        submitting = false;
      }
    };

    const onSubmit = (event: Event) => {
      const formEl = event.target as HTMLFormElement | null;
      if (!formEl || formEl.tagName !== "FORM") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (typeof (event as SubmitEvent).stopImmediatePropagation === "function") {
        (event as SubmitEvent).stopImmediatePropagation();
      }
      void handleAuthAction(formEl);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      const resendVerification = target.closest<HTMLElement>("[data-auth-resend-verification]");
      if (resendVerification) {
        event.preventDefault();
        event.stopPropagation();
        void (async () => {
          const draft = readRegistrationDraft();
          if (!draft.email) {
            showError("Registration details are incomplete. Please start again from Create Account.");
            go("/accounts");
            return;
          }
          try {
            resendVerification.setAttribute("disabled", "true");
            const result = await sendRegistrationVerificationEmail(draft.email);
            clearError();
            window.alert(
              `${result.message || "Verification code sent."}\n\nUse the newest 6-digit code from your school email.`,
            );
          } catch (error) {
            showError(
              error instanceof Error ? error.message : "Failed to resend verification code.",
            );
          } finally {
            resendVerification.removeAttribute("disabled");
          }
        })();
        return;
      }

      const resendReset = target.closest<HTMLElement>("[data-auth-resend-reset]");
      if (resendReset) {
        event.preventDefault();
        event.stopPropagation();
        void (async () => {
          const email = readResetEmail();
          if (!email) {
            showError("Start again from the school email step.");
            go("/forgot-password");
            return;
          }
          try {
            resendReset.setAttribute("disabled", "true");
            const res = await fetch("/api/user/auth/forgot-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(payload.error || payload.details || "Failed to resend reset code.");
            }
            clearError();
            window.alert(
              `${payload.message || "If this email is registered, a verification code was sent."}\n\nUse the newest 6-digit code from your school email.`,
            );
          } catch (error) {
            showError(error instanceof Error ? error.message : "Failed to resend reset code.");
          } finally {
            resendReset.removeAttribute("disabled");
          }
        })();
        return;
      }

      const button = target.closest<HTMLButtonElement>(
        "[data-auth-continue], .btn-continue, button.btn-create, button.btn-signin, button.btn-send, button.btn-submit, button.btn-save",
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

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);

    return () => {
      cancelled = true;
      window.clearInterval(lockTimer);
      observer.disconnect();
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname, router]);
}
