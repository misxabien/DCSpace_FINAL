"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { changePassword, readAuthSession } from "@/lib/user-api";

export function ChangePasswordModal() {
  const pathname = usePathname();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pathname !== "/profile") {
      setOpen(false);
      return;
    }

    const button = document.querySelector<HTMLButtonElement>("button.btn-change");
    if (!button) {
      return;
    }

    const onClick = (event: Event) => {
      event.preventDefault();
      setError("");
      setSuccess("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOpen(true);
    };

    button.addEventListener("click", onClick);
    return () => button.removeEventListener("click", onClick);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, submitting]);

  if (pathname !== "/profile" || !open) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    const session = readAuthSession();
    if (!session?.token) {
      setError("Please sign in again to change your password.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await changePassword(session.token, {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setSuccess(result.message || "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      window.setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="dc-pw-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          setOpen(false);
        }
      }}
    >
      <div
        className="dc-pw-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dc-pw-modal__header">
          <h2 id={titleId}>Change Password</h2>
          <button
            type="button"
            className="dc-pw-modal__close"
            aria-label="Close"
            disabled={submitting}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>

        <p className="dc-pw-modal__copy">
          Enter your current password, then choose a new one. This updates your account in the
          database right away.
        </p>

        <form className="dc-pw-form" onSubmit={handleSubmit} autoComplete="off">
          <label className="dc-pw-field">
            <span>Current Password</span>
            <div className="dc-pw-field__input-wrap">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="dc-pw-eye"
                onClick={() => setShowCurrent((v) => !v)}
                aria-label={showCurrent ? "Hide current password" : "Show current password"}
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label className="dc-pw-field">
            <span>New Password</span>
            <div className="dc-pw-field__input-wrap">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="dc-pw-eye"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label className="dc-pw-field">
            <span>Confirm New Password</span>
            <div className="dc-pw-field__input-wrap">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <button
                type="button"
                className="dc-pw-eye"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error ? (
            <p className="dc-pw-message dc-pw-message--error" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="dc-pw-message dc-pw-message--success" role="status">
              {success}
            </p>
          ) : null}

          <div className="dc-pw-actions">
            <button
              type="button"
              className="dc-pw-btn dc-pw-btn--ghost"
              disabled={submitting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="dc-pw-btn dc-pw-btn--primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save New Password"}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .dc-pw-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(26, 26, 26, 0.45);
        }

        .dc-pw-modal {
          width: min(440px, 100%);
          border-radius: 18px;
          background: #fffcf8;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
          padding: 22px 22px 20px;
          font-family: Montserrat, system-ui, sans-serif;
          color: #1a1a1a;
        }

        .dc-pw-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }

        .dc-pw-modal__header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
        }

        .dc-pw-modal__close {
          border: none;
          background: transparent;
          font-size: 28px;
          line-height: 1;
          color: #6b6b6b;
          cursor: pointer;
          padding: 0 4px;
        }

        .dc-pw-modal__copy {
          margin: 0 0 18px;
          font-size: 13px;
          line-height: 1.45;
          color: #6b6b6b;
        }

        .dc-pw-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .dc-pw-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .dc-pw-field span {
          font-size: 12px;
          font-weight: 600;
        }

        .dc-pw-field__input-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          border-radius: 10px;
          background: rgba(68, 138, 255, 0.06);
          padding: 2px 10px 2px 12px;
        }

        .dc-pw-field__input-wrap input {
          flex: 1;
          min-width: 0;
          border: none;
          background: transparent;
          padding: 11px 0;
          font: inherit;
          font-size: 14px;
          outline: none;
        }

        .dc-pw-eye {
          border: none;
          background: transparent;
          color: #448aff;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        .dc-pw-message {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.4;
        }

        .dc-pw-message--error {
          color: #b91c1c;
        }

        .dc-pw-message--success {
          color: #15803d;
        }

        .dc-pw-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 4px;
        }

        .dc-pw-btn {
          border-radius: 999px;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          padding: 10px 18px;
          cursor: pointer;
        }

        .dc-pw-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .dc-pw-btn--ghost {
          border: 1.5px solid rgba(68, 138, 255, 0.35);
          background: #fff;
          color: #448aff;
        }

        .dc-pw-btn--primary {
          border: none;
          background: #448aff;
          color: #fff;
        }

        .dc-pw-btn--primary:hover:not(:disabled) {
          background: #3a7aee;
        }
      `}</style>
    </div>
  );
}
