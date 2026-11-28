"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "@/components/organized/FilterMenu.module.css";

/**
 * The filter icon beside an organizer table's search box: opens a short list of
 * the courses in that table; ticking some shows only those rows.
 */
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
  buttonClassName,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  buttonClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (option: string) =>
    onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option]);

  return (
    <span className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${buttonClassName}${selected.length ? ` ${styles.active}` : ""}`}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        {selected.length ? <span className={styles.count}>{selected.length}</span> : null}
      </button>
      {open ? (
        <div className={styles.menu} id={menuId} role="group" aria-label={label}>
          <p className={styles.heading}>Filter by course</p>
          {options.length ? (
            <ul className={styles.list}>
              {options.map((option) => (
                <li key={option}>
                  <label className={styles.option}>
                    <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} />
                    <span>{option}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No courses to filter yet.</p>
          )}
          {selected.length ? (
            <button type="button" className={styles.clear} onClick={() => onChange([])}>
              Clear filter
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

/** Distinct, sorted course labels from a table's rows (blank values left out). */
export function courseOptions(values: string[]) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter((v) => v && v !== "—"))].sort((a, b) =>
    a.localeCompare(b),
  );
}
