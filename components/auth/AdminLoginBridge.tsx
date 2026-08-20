"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Wires admin login/logout to the shared API without changing admin page markup.
 * Errors only appear after a failed submit (same pattern as student LoginBridge).
 */
export function AdminLoginBridge() {
  const { login, logout } = useAuth();

  useEffect(() => {
    let submitting = false;
    const expectedFromQuery =
      (new URLSearchParams(window.location.search).get("role") as
        | "admin"
        | "super-admin"
        | null) || "admin";
    const welcome = document.getElementById("welcome-title");
    const loginTitle = document.getElementById("login-title");
    if (welcome) {
      welcome.textContent =
        expectedFromQuery === "super-admin"
          ? "Welcome, Super Admin!"
          : "Welcome, Administrator!";
    }
    if (loginTitle) loginTitle.textContent = "LOG IN TO DC SPACE";

    const ensureErrorEl = (form: HTMLFormElement) => {
      let errorEl = form.querySelector<HTMLParagraphElement>(".login-error");
      if (!errorEl) {
        errorEl = document.createElement("p");
        errorEl.className = "login-error";
        errorEl.setAttribute("role", "alert");
        errorEl.style.cssText =
          "color:#c0392b;font-size:13px;font-weight:600;margin:8px 0 0;text-align:left;";
        form.appendChild(errorEl);
      }
      return errorEl;
    };

    const runLogin = async (form: HTMLFormElement) => {
      if (submitting) return;

      const emailInput =
        form.querySelector<HTMLInputElement>("#email") ||
        form.querySelector<HTMLInputElement>('input[type="email"]');
      const passwordInput =
        form.querySelector<HTMLInputElement>("#password") ||
        form.querySelector<HTMLInputElement>('input[type="password"]');
      const email = (emailInput?.value ?? "").trim();
      const password = passwordInput?.value ?? "";
      const errorEl = ensureErrorEl(form);
      errorEl.textContent = "";

      const expectedRole =
        (new URLSearchParams(window.location.search).get("role") as
          | "admin"
          | "super-admin"
          | null) || expectedFromQuery;

      if (!email || !password) {
        errorEl.textContent = "Please enter your school email and password.";
        return;
      }

      submitting = true;
      try {
        const result = await login(email, password, {
          portal: "admin",
          expectedRole,
        });
        if (!result.ok) {
          errorEl.textContent = result.error || "Unable to sign in.";
          return;
        }

        try {
          localStorage.setItem(
            "dc_admin_role",
            result.user?.role === "super-admin" ? "super-admin" : "admin",
          );
        } catch {
          /* ignore */
        }

        // Same destination the original UI used after login
        window.location.href = "/admin/home12";
      } catch (error) {
        errorEl.textContent =
          error instanceof Error ? error.message : "Unable to sign in.";
      } finally {
        submitting = false;
      }
    };

    const runForgot = async (form: HTMLFormElement) => {
      if (submitting) return;
      submitting = true;
      try {
        if (form.id === "forgot-form") {
          const email = (
            form.querySelector<HTMLInputElement>("#email")?.value || ""
          )
            .trim()
            .toLowerCase();
          if (!email.endsWith("@sdca.edu.ph")) {
            window.alert("Use your school email ending in @sdca.edu.ph.");
            return;
          }
          const res = await fetch("/api/user/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.error || "Failed to send code.");
          window.sessionStorage.setItem("dcspaceAdminResetEmail", email);
          window.alert(payload.message || "Verification code sent.");
          window.location.assign("/admin/fpv10");
          return;
        }

        if (form.id === "verify-form") {
          const email = window.sessionStorage.getItem("dcspaceAdminResetEmail") || "";
          const code = (form.querySelector<HTMLInputElement>("#code")?.value || "")
            .trim()
            .replace(/\s/g, "");
          if (!email) {
            window.alert("Start again from the email step.");
            window.location.assign("/admin/fp09");
            return;
          }
          const res = await fetch("/api/user/auth/verify-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.error || "Invalid code.");
          window.sessionStorage.setItem("dcspaceAdminResetCode", code);
          window.location.assign("/admin/fpp11");
          return;
        }

        const email = window.sessionStorage.getItem("dcspaceAdminResetEmail") || "";
        const code = window.sessionStorage.getItem("dcspaceAdminResetCode") || "";
        const password =
          form.querySelector<HTMLInputElement>("#password")?.value || "";
        const confirmPassword =
          form.querySelector<HTMLInputElement>("#confirm-password")?.value || "";
        if (!email || !code) {
          window.alert("Start again from the email step.");
          window.location.assign("/admin/fp09");
          return;
        }
        const res = await fetch("/api/user/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            code,
            newPassword: password,
            confirmPassword,
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || "Failed to reset password.");
        window.sessionStorage.removeItem("dcspaceAdminResetEmail");
        window.sessionStorage.removeItem("dcspaceAdminResetCode");
        window.alert(payload.message || "Password updated. You can sign in now.");
        window.location.assign("/admin/login02");
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Reset failed.");
      } finally {
        submitting = false;
      }
    };

    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form) return;
      if (form.id === "login-form") {
        if (!document.querySelector(".admin-legacy-root")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void runLogin(form);
        return;
      }
      if (form.id === "forgot-form" || form.id === "verify-form" || form.id === "new-password-form") {
        if (!document.querySelector(".admin-legacy-root")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void runForgot(form);
      }
    };

    const onLogoutClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const logoutBtn = target?.closest<HTMLElement>("#user-menu-logout");
      if (!logoutBtn) return;
      event.preventDefault();
      event.stopPropagation();
      void logout().then(() => {
        window.location.href = "/admin/selection01";
      });
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onLogoutClick, true);

    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onLogoutClick, true);
    };
  }, [login, logout]);

  return null;
}
