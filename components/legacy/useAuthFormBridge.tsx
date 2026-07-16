"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearRegistrationDraft,
  loginUser,
  readRegistrationDraft,
  registerUser,
  saveAuthSession,
  sendRegistrationVerificationEmail,
  syncProfileToLegacyStorage,
  writeRegistrationDraft,
} from "@/lib/user-api";

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
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
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
  const active = document.querySelector<HTMLElement>(".role-btn.active, .role-btn[aria-pressed='true']");
  const role = active?.getAttribute("data-role") || window.localStorage.getItem("dcspaceAccountType");
  return role === "faculty" ? "faculty" : "student";
}

const AUTH_PATHS = new Set([
  "/login",
  "/create",
  "/school-details",
  "/accounts",
  "/verify",
  "/agreement",
]);

export function useAuthFormBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!AUTH_PATHS.has(pathname)) {
      return;
    }

    const form = document.querySelector<HTMLFormElement>("form");
    if (!form) {
      return;
    }

    let cancelled = false;

    const onSubmit = async (event: Event) => {
      event.preventDefault();
      if (cancelled) {
        return;
      }

      clearError();
      const formEl = event.currentTarget as HTMLFormElement;
      const data = new FormData(formEl);

      try {
        if (pathname === "/login") {
          const email = String(data.get("email") || "")
            .trim()
            .toLowerCase();
          const password = String(data.get("password") || "");
          if (!email || !password) {
            showError("Please enter your school email and password.");
            return;
          }

          setSubmitting(formEl, true);
          const role = getActiveRole();
          window.localStorage.setItem("dcspaceAccountType", role);
          const result = await loginUser(email, password);
          saveAuthSession(result.token, result.user);
          syncProfileToLegacyStorage(result.user);
          router.push("/home");
          return;
        }

        if (pathname === "/create") {
          writeRegistrationDraft({
            firstName: String(data.get("firstName") || "").trim(),
            lastName: String(data.get("lastName") || "").trim(),
            studentNumber: String(data.get("studentNumber") || "").trim(),
          });
          router.push("/school-details");
          return;
        }

        if (pathname === "/school-details") {
          const organizationRole =
            String(data.get("organizationRole") || "").trim() ||
            String(data.get("organizationPosition") || "").trim();
          writeRegistrationDraft({
            course: String(data.get("course") || "").trim(),
            school: String(data.get("schoolDepartment") || "").trim(),
            organizationPart: String(data.get("organization") || "").trim(),
            organizationRole,
          });
          router.push("/accounts");
          return;
        }

        if (pathname === "/accounts") {
          const email = String(data.get("email") || "")
            .trim()
            .toLowerCase();
          const password = String(data.get("password") || "");
          const confirmPassword = String(data.get("confirmPassword") || "");
          const rfidNumber = String(data.get("rfidTagNumber") || "").trim();

          if (password !== confirmPassword) {
            showError("Passwords do not match.");
            return;
          }
          if (password.length < 8) {
            showError("Password must be at least 8 characters.");
            return;
          }

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
          window.alert(result.message || "Verification code sent. Check your school email.");
          router.push("/verify");
          return;
        }

        if (pathname === "/verify") {
          const verificationCode = String(data.get("verificationCode") || "")
            .trim()
            .replace(/\s/g, "");
          if (!/^\d{6}$/.test(verificationCode)) {
            showError("Enter the 6-digit verification code from your email.");
            return;
          }
          writeRegistrationDraft({ verificationCode });
          router.push("/agreement");
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
          clearRegistrationDraft();
          router.push("/home");
          return;
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        setSubmitting(formEl, false);
      }
    };

    form.addEventListener("submit", onSubmit);
    return () => {
      cancelled = true;
      form.removeEventListener("submit", onSubmit);
    };
  }, [pathname, router]);
}
