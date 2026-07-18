"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  saveFileStatus,
  type FileSubmissionStatus,
} from "@/lib/organizedRegistrations";
import styles from "@/components/organized/OrganizedParticipant.module.css";

function FileAction({
  participantId,
  fileId,
  status,
  onChange,
}: {
  participantId: string;
  fileId: string;
  status: FileSubmissionStatus;
  onChange: (status: FileSubmissionStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; minWidth: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const minWidth = Math.max(rect.width, 140);

    setMenuStyle({
      top: rect.bottom + 6,
      left: rect.right - minWidth,
      minWidth,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    updateMenuPosition();

    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const setStatus = (next: FileSubmissionStatus) => {
    saveFileStatus(participantId, fileId, next);
    onChange(next);
    setOpen(false);
  };

  const toggleOpen = () => {
    setOpen((current) => !current);
  };

  const triggerClass =
    status === "accepted"
      ? `${styles.statusBadge} ${styles.statusAccepted} ${styles.statusBadgeBtn}`
      : status === "rejected"
        ? `${styles.statusBadge} ${styles.statusRejected} ${styles.statusBadgeBtn}`
        : styles.actionBtn;

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            ref={menuRef}
            className={styles.actionDropdown}
            style={{
              position: "fixed",
              top: menuStyle.top,
              left: menuStyle.left,
              minWidth: menuStyle.minWidth,
              zIndex: 1000,
            }}
            role="menu"
          >
            <button
              type="button"
              className={`${styles.actionOption}${status === "accepted" ? ` ${styles.actionOptionActive}` : ""}`}
              role="menuitem"
              onClick={() => setStatus("accepted")}
            >
              Accept
            </button>
            <button
              type="button"
              className={`${styles.actionOption}${status === "rejected" ? ` ${styles.actionOptionActive}` : ""}`}
              role="menuitem"
              onClick={() => setStatus("rejected")}
            >
              Reject
            </button>
            {status !== "pending" ? (
              <button
                type="button"
                className={styles.actionOption}
                role="menuitem"
                onClick={() => setStatus("pending")}
              >
                Reset to pending
              </button>
            ) : null}
          </div>,
          document.body
        )
      : null;

  return (
    <div className={styles.actionMenu}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggleOpen}
      >
        {status === "accepted" ? (
          <>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Accepted
          </>
        ) : status === "rejected" ? (
          <>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            Rejected
          </>
        ) : (
          <>
            Accept
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
      </button>
      {menu}
    </div>
  );
}

export { FileAction };
