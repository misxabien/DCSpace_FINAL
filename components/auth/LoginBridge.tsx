"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isAdminRole } from "@/lib/auth/types";

function ensureErrorEl(form: HTMLFormElement) {
  let errorEl = form.querySelector<HTMLParagraphElement>(".login-error");
  if (!errorEl) {
    errorEl = document.createElement("p");
    errorEl.className = "login-error";
    errorEl.setAttribute("role", "alert");
    errorEl.style.cssText =
      "color:#c0392b;font-size:13px;font-weight:600;margin:0 0 12px;text-align:left;";
    const submitBtn = form.querySelector(".btn-signin");
    form.insertBefore(errorEl, submitBtn);
  }
  return errorEl;
}

/**
 * Student/organizer login — same UI, wired to shared /api/auth/login.
 * Document-level listeners survive legacy HTML remounts.
 */
export function LoginBridge() {
  const { login } = useAuth();

  useEffect(() => {
    let submitting = false;

    const runLogin = async (form: HTMLFormElement) => {
      if (submitting) return;
      if (!form.closest(".signin-card")) return;

      form.setAttribute("action", "#");
      form.setAttribute("method", "post");

      const emailInput = form.querySelector<HTMLInputElement>("#email");
      const passwordInput = form.querySelector<HTMLInputElement>("#password");
      const email = (emailInput?.value ?? "").trim();
      const password = passwordInput?.value ?? "";
      const errorEl = ensureErrorEl(form);
      errorEl.textContent = "";

      const isSdcaEmail = /^[A-Za-z0-9._%+\-]+@sdca\.edu\.ph$/i.test(email);
      if (!isSdcaEmail) {
        errorEl.textContent = "Use your school email ending in @sdca.edu.ph";
        emailInput?.focus();
        return;
      }
      if (!password) {
        errorEl.textContent = "Please enter your password.";
        return;
      }

      submitting = true;
      try {
        const result = await login(email, password, { portal: "user" });
        if (!result.ok) {
          errorEl.textContent = result.error || "Unable to sign in.";
          if (result.redirectTo) {
            window.setTimeout(() => {
              window.location.assign(result.redirectTo!);
            }, 1000);
          }
          return;
        }

        let destination = "/home";
        if (result.user?.isAdmin || isAdminRole(result.user?.role)) {
          destination = "/admin/home12";
        } else if (result.user?.isOrganizer) {
          destination = "/organized";
        }
        window.location.assign(destination);
      } catch (error) {
        errorEl.textContent =
          error instanceof Error ? error.message : "Unable to sign in.";
      } finally {
        submitting = false;
      }
    };

    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      if (!form.closest(".signin-card")) return;
      event.preventDefault();
      event.stopPropagation();
      void runLogin(form);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>(".btn-signin");
      if (!button || button.disabled) return;
      const form = button.closest("form");
      if (!form || !form.closest(".signin-card")) return;
      event.preventDefault();
      event.stopPropagation();
      void runLogin(form);
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [login]);

  return null;
}
