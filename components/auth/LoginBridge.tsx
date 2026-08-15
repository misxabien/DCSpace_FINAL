"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  applyRegisterRole,
  readRegisterRole,
  type RegisterRole,
} from "@/lib/auth/registerRole";

export function LoginBridge() {
  const { login } = useAuth();
  const router = useRouter();
  const bound = useRef(false);

  useEffect(() => {
    if (bound.current) return;
    const form = document.querySelector<HTMLFormElement>(".signin-card form");
    if (!form) return;
    bound.current = true;

    form.setAttribute("action", "#");
    form.setAttribute("method", "post");

    const emailField = form.querySelector<HTMLInputElement>("#email");
    if (emailField) {
      emailField.required = true;
      emailField.pattern = "[^@\\s]+@sdca\\.edu\\.ph";
      emailField.title = "Use your @sdca.edu.ph school email";
      if (!emailField.placeholder.includes("sdca.edu.ph")) {
        emailField.placeholder = "name@sdca.edu.ph";
      }
    }

    const onSubmit = async (event: Event) => {
      event.preventDefault();
      const emailInput = form.querySelector<HTMLInputElement>("#email");
      const passwordInput = form.querySelector<HTMLInputElement>("#password");
      const email = (emailInput?.value ?? "").trim().toLowerCase();
      const password = passwordInput?.value ?? "";

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
      errorEl.textContent = "";

      if (!email.endsWith("@sdca.edu.ph")) {
        errorEl.textContent = "Please use your @sdca.edu.ph school email.";
        emailInput?.focus();
        return;
      }

      // Role comes from the SDCA account (organizer approval), not Faculty.
      // Organizers sign in on the Student side of this same form.
      const result = await login(email, password);
      if (!result.ok) {
        errorEl.textContent = result.error || "Unable to sign in.";
        return;
      }

      // Approved organizers open Events Organized UI; students open Home.
      const destination = result.user?.isOrganizer ? "/organized" : "/home";
      router.push(destination);
      router.refresh();
    };

    const OPEN_EYE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>`;
    const CLOSED_EYE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6A2.5 2.5 0 0012 14.5a2.5 2.5 0 001.9-.8M9.9 5.2A10.4 10.4 0 0112 5c5 0 9.3 3.1 11 7.5a11.7 11.7 0 01-4.2 5.1M6.1 6.1A11.6 11.6 0 001 12.5C2.7 16.9 7 20 12 20c1.7 0 3.3-.4 4.7-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const bindToggle = (btn: HTMLButtonElement) => {
      if (btn.dataset.pwBound === "1") return;
      btn.dataset.pwBound = "1";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const input =
          (document.getElementById(btn.getAttribute("data-target") || "password") as
            | HTMLInputElement
            | null) || form.querySelector<HTMLInputElement>("#password");
        if (!input) return;
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        btn.classList.toggle("is-visible", !showing);
        btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        btn.innerHTML = showing ? CLOSED_EYE : OPEN_EYE;
      });
    };

    const bindToggles = () => {
      form
        .querySelectorAll<HTMLButtonElement>("#toggle-password, .toggle-password")
        .forEach(bindToggle);
    };

    bindToggles();
    const retry = window.setTimeout(bindToggles, 50);

    applyRegisterRole(readRegisterRole());
    const onRoleClick = (event: Event) => {
      const btn = (event.target as HTMLElement | null)?.closest(
        ".role-btn[data-role]"
      ) as HTMLButtonElement | null;
      if (!btn) return;
      const role = btn.dataset.role as RegisterRole | undefined;
      if (role !== "student" && role !== "faculty") return;
      applyRegisterRole(role);
    };
    document.addEventListener("click", onRoleClick);

    form.addEventListener("submit", onSubmit);
    return () => {
      window.clearTimeout(retry);
      document.removeEventListener("click", onRoleClick);
      form.removeEventListener("submit", onSubmit);
      bound.current = false;
    };
  }, [login, router]);

  return null;
}
