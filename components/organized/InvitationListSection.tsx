"use client";

import { useMemo, useState } from "react";
import { INVITE_FILTER_OPTIONS, type InvitationListEntry } from "@/lib/organizedInvitations";
import styles from "@/components/organized/OrganizedDetail.module.css";

const PAGE_SIZE = 10;

type SortDir = "asc" | "desc";

function matchesQuery(row: InvitationListEntry, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [row.name, row.course, row.organization, row.status].join(" ").toLowerCase().includes(q);
}

function matchesFilters(row: InvitationListEntry, filters: string[]) {
  if (!filters.length) return true;
  return filters.some(
    (filter) =>
      row.course.toLowerCase().includes(filter.toLowerCase()) ||
      row.organization.toLowerCase().includes(filter.toLowerCase())
  );
}

export function InvitationListSection({ entries }: { entries: InvitationListEntry[] }) {
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const rows = entries.filter(
      (row) => matchesQuery(row, query.trim()) && matchesFilters(row, activeFilters)
    );
    rows.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [entries, query, sortDir, activeFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleFilter = (filter: string) => {
    setActiveFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]
    );
    setPage(1);
  };

  return (
    <section className={styles.inviteSection} aria-labelledby="invitation-lists">
      <div className={styles.inviteHead}>
        <h3 id="invitation-lists">Invitation Lists</h3>
        <div className={styles.inviteSearch}>
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
            aria-label="Search invitation list"
          />
          <button type="button" className={styles.inviteFilterBtn} aria-label="Filter invitation list">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.inviteChips}>
        {INVITE_FILTER_OPTIONS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`${styles.inviteChip}${activeFilters.includes(filter) ? ` ${styles.inviteChipActive}` : ""}`}
            aria-pressed={activeFilters.includes(filter)}
            onClick={() => toggleFilter(filter)}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className={styles.inviteTableWrap}>
        <table className={styles.inviteTable} aria-label="Invitation lists">
          <thead>
            <tr>
              <th scope="col">PARTICIPANT NAME</th>
              <th scope="col">COURSE</th>
              <th scope="col">ORGANIZATION</th>
              <th scope="col">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.course}</td>
                <td>{row.organization}</td>
                <td className={styles.inviteStatus}>{row.status.toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.inviteFooter}>
        <div className={styles.inviteSort}>
          <button
            type="button"
            className={`${styles.inviteSortBtn}${sortDir === "asc" ? ` ${styles.inviteSortBtnActive}` : ""}`}
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
            className={`${styles.inviteSortBtn}${sortDir === "desc" ? ` ${styles.inviteSortBtnActive}` : ""}`}
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

        <div className={styles.invitePagination}>
          <button
            type="button"
            className={styles.invitePageBtn}
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
            className={styles.invitePageBtn}
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
