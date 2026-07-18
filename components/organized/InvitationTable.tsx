"use client";

import { useMemo, useState } from "react";
import {
  INVITE_FILTER_OPTIONS,
  setAllInvited,
  setCandidateInvited,
  type InviteAudience,
  type InviteCandidate,
} from "@/lib/organizedInvitations";
import styles from "@/components/organized/OrganizedInvitations.module.css";

const PAGE_SIZE = 10;

type SortDir = "asc" | "desc";

function InviteEnvelopeIcon({ invited }: { invited: boolean }) {
  if (invited) {
    return (
      <svg viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <path
          d="M5 8.5C5 7.67 5.67 7 6.5 7h17c.83 0 1.5.67 1.5 1.5v13c0 .83-.67 1.5-1.5 1.5h-17A1.5 1.5 0 015 21.5v-13z"
          stroke="#2e7d32"
          strokeWidth="1.6"
        />
        <path d="M6.5 8.5L15 14.5 23.5 8.5" stroke="#2e7d32" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="22" cy="22" r="6" fill="#43a047" />
        <path d="M19.5 22l1.8 1.8 3.4-3.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <path
        d="M5 8.5C5 7.67 5.67 7 6.5 7h17c.83 0 1.5.67 1.5 1.5v13c0 .83-.67 1.5-1.5 1.5h-17A1.5 1.5 0 015 21.5v-13z"
        stroke="#1a1a1a"
        strokeWidth="1.6"
      />
      <path d="M6.5 8.5L15 14.5 23.5 8.5" stroke="#1a1a1a" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="22" cy="22" r="6" fill="#1a1a1a" />
      <path d="M22 19.5v5M19.5 22h5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function matchesQuery(row: InviteCandidate, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [row.number, row.name, row.course, row.organization].join(" ").toLowerCase().includes(q);
}

function matchesFilters(row: InviteCandidate, filters: string[]) {
  if (!filters.length) return true;
  return filters.some(
    (filter) =>
      row.course.toLowerCase().includes(filter.toLowerCase()) ||
      row.organization.toLowerCase().includes(filter.toLowerCase())
  );
}

export function InvitationTable({
  eventId,
  title,
  numberLabel,
  candidates,
  inviteState,
  onInviteStateChange,
}: {
  eventId: string;
  title: string;
  numberLabel: string;
  candidates: InviteCandidate[];
  inviteState: Record<string, boolean>;
  onInviteStateChange: (next: Record<string, boolean>) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const rows = candidates.filter(
      (row) => matchesQuery(row, query.trim()) && matchesFilters(row, activeFilters)
    );
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [candidates, query, sortDir, activeFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleIds = filtered.map((row) => row.id);
  const invitedCount = visibleIds.filter((id) => inviteState[id]).length;

  const toggleFilter = (filter: string) => {
    setActiveFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]
    );
    setPage(1);
  };

  const toggleInvite = (candidateId: string) => {
    const invited = !inviteState[candidateId];
    setCandidateInvited(eventId, candidateId, invited);
    onInviteStateChange({ ...inviteState, [candidateId]: invited });
  };

  const inviteAll = () => {
    setAllInvited(eventId, visibleIds, true);
    const next = { ...inviteState };
    for (const id of visibleIds) next[id] = true;
    onInviteStateChange(next);
  };

  const undoAll = () => {
    setAllInvited(eventId, visibleIds, false);
    const next = { ...inviteState };
    for (const id of visibleIds) next[id] = false;
    onInviteStateChange(next);
  };

  return (
    <section className={styles.block} aria-labelledby={title.replace(/\s+/g, "-").toLowerCase()}>
      <h4 className={styles.blockTitle} id={title.replace(/\s+/g, "-").toLowerCase()}>
        {title}
      </h4>

      <div className={styles.blockTop}>
        <div className={styles.blockTopLeft}>
          {INVITE_FILTER_OPTIONS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`${styles.filterChip}${activeFilters.includes(filter) ? ` ${styles.filterChipActive}` : ""}`}
              aria-pressed={activeFilters.includes(filter)}
              onClick={() => toggleFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className={styles.blockTopRight}>
          <div className={styles.bulkActions}>
            <button
              type="button"
              className={styles.bulkBtnDark}
              disabled={!invitedCount}
              onClick={undoAll}
            >
              Undo Invite to All
            </button>
            <button
              type="button"
              className={styles.bulkBtnLight}
              disabled={!filtered.length || invitedCount === filtered.length}
              onClick={inviteAll}
            >
              Send Invite to All
            </button>
          </div>

          <div className={styles.search}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search"
              aria-label={`Search ${title.toLowerCase()}`}
            />
            <button type="button" className={styles.filterBtn} aria-label={`Filter ${title.toLowerCase()}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label={title}>
          <thead>
            <tr>
              <th scope="col">{numberLabel}</th>
              <th scope="col">STUDENT NAME</th>
              <th scope="col">COURSE</th>
              <th scope="col">ORGANIZATION</th>
              <th scope="col">Send Invite</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr className={styles.emptyRow}>
                <td colSpan={5}>No users found.</td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const invited = Boolean(inviteState[row.id]);
                return (
                  <tr key={row.id}>
                    <td>{row.number}</td>
                    <td>{row.name}</td>
                    <td>{row.course}</td>
                    <td>{row.organization}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.inviteBtn}
                        aria-label={invited ? `Undo invite for ${row.name}` : `Send invite to ${row.name}`}
                        aria-pressed={invited}
                        onClick={() => toggleInvite(row.id)}
                      >
                        <InviteEnvelopeIcon invited={invited} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <div className={styles.sort}>
          <button
            type="button"
            className={`${styles.sortBtn}${sortDir === "asc" ? ` ${styles.sortBtnActive}` : ""}`}
            aria-pressed={sortDir === "asc"}
            onClick={() => {
              setSortDir("asc");
              setPage(1);
            }}
          >
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            Ascending
          </button>
          <button
            type="button"
            className={`${styles.sortBtn}${sortDir === "desc" ? ` ${styles.sortBtnActive}` : ""}`}
            aria-pressed={sortDir === "desc"}
            onClick={() => {
              setSortDir("desc");
              setPage(1);
            }}
          >
            <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
            Descending
          </button>
        </div>

        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            &lsaquo;
          </button>
          <span>
            Page {filtered.length === 0 ? 0 : currentPage} of {filtered.length === 0 ? 0 : totalPages}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            aria-label="Next page"
            disabled={currentPage >= totalPages || filtered.length === 0}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            &rsaquo;
          </button>
        </div>
      </div>
    </section>
  );
}

export type { InviteAudience };
