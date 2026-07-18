"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

function lockLoginForm(form: HTMLFormElement) {
  form.setAttribute("action", "javascript:void(0)");
  form.setAttribute("method", "post");
  form.setAttribute("onsubmit", "return false;");
}

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

export function LoginBridge() {
  const { login } = useAuth();

  useEffect(() => {
    let submitting = false;

    const runLogin = async (form: HTMLFormElement) => {
      if (submitting) return;
      lockLoginForm(form);

      const emailInput = form.querySelector<HTMLInputElement>("#email");
      const passwordInput = form.querySelector<HTMLInputElement>("#password");
      const email = (emailInput?.value ?? "").trim();
      const password = passwordInput?.value ?? "";
      const errorEl = ensureErrorEl(form);
      errorEl.textContent = "";

      if (!email || !password) {
        errorEl.textContent = "Please enter your school email and password.";
        return;
      }

      const button = form.querySelector<HTMLButtonElement>(".btn-signin");
      const originalLabel = button?.textContent || "SIGN IN";
      submitting = true;
      if (button) {
        button.disabled = true;
        button.textContent = "Please wait…";
      }

      try {
        // Role comes from the SDCA account (organizer approval), not Faculty.
        // Organizers sign in on the Student side of this same form.
        const result = await login(email, password);
        if (!result.ok) {
          errorEl.textContent = result.error || "Unable to sign in.";
          return;
        }

        // Approved organizers open Events Organized UI; students open Home.
        const destination = result.user?.isOrganizer ? "/organized" : "/home";
        window.location.assign(destination);
      } catch (error) {
        errorEl.textContent =
          error instanceof Error ? error.message : "Unable to sign in.";
      } finally {
        submitting = false;
        if (button) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
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

    // Document-level listeners survive legacy innerHTML mounts/re-renders.
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);

    const lockExisting = () => {
      document.querySelectorAll<HTMLFormElement>(".signin-card form").forEach(lockLoginForm);
    };
    lockExisting();
    const timer = window.setInterval(lockExisting, 300);
    const observer = new MutationObserver(lockExisting);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, [login]);

  return null;
}
