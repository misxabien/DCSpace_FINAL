"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

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

    const onSubmit = async (event: Event) => {
      event.preventDefault();
      const emailInput = form.querySelector<HTMLInputElement>("#email");
      const passwordInput = form.querySelector<HTMLInputElement>("#password");
      const email = emailInput?.value ?? "";
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

    form.addEventListener("submit", onSubmit);
    return () => {
      form.removeEventListener("submit", onSubmit);
      bound.current = false;
    };
  }, [login, router]);

  return null;
}
