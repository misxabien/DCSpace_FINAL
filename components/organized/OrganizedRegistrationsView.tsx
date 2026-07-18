"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OrganizedEventHeader } from "@/components/organized/OrganizedEventHeader";
import type { OrganizedEventDetail } from "@/lib/organizedEventDetails";
import type { EventRegistration } from "@/lib/organizedRegistrations";
import detailStyles from "@/components/organized/OrganizedDetail.module.css";
import styles from "@/components/organized/OrganizedRegistrations.module.css";

const PAGE_SIZE = 10;

type SortDir = "asc" | "desc";

function matchesQuery(row: EventRegistration, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [row.studentNumber, row.studentName, row.course].join(" ").toLowerCase().includes(q);
}

export function OrganizedRegistrationsView({
  event,
  registrations,
}: {
  event: OrganizedEventDetail;
  registrations: EventRegistration[];
}) {
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const rows = registrations.filter((row) => matchesQuery(row, query.trim()));
    rows.sort((a, b) => {
      const cmp = a.studentName.localeCompare(b.studentName);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [registrations, query, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const onSearch = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const onSort = (dir: SortDir) => {
    setSortDir(dir);
    setPage(1);
  };

  return (
    <article className={`${detailStyles.page} ${styles.page}`}>
      <OrganizedEventHeader event={event} />

      <hr className={styles.divider} />

      <section aria-labelledby="submitted-registrations">
        <div className={styles.sectionHead}>
          <h3 id="submitted-registrations">Submitted Registrations</h3>
          <div className={styles.search}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search"
              aria-label="Search registrations"
            />
            <button type="button" className={styles.filterBtn} aria-label="Filter registrations">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Submitted registrations">
            <thead>
              <tr>
                <th scope="col">STUDENT NUMBER</th>
                <th scope="col">STUDENT NAME</th>
                <th scope="col">COURSE</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr className={styles.emptyRow}>
                  <td colSpan={4}>No registrations found.</td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.studentNumber}</td>
                    <td>{row.studentName}</td>
                    <td>{row.course}</td>
                    <td>
                      <Link
                        href={`/organized/events/${event.id}/registrations/${row.id}`}
                        className={styles.rowAction}
                        aria-label={`View ${row.studentName}`}
                      >
                        <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M6.83709 3.08709C7.2032 2.72097 7.7968 2.72097 8.16291 3.08709L19.4129 14.3371C19.779 14.7032 19.779 15.2968 19.4129 15.6629L8.16291 26.9129C7.7968 27.279 7.2032 27.279 6.83709 26.9129C6.47097 26.5468 6.47097 25.9532 6.83709 25.5871L17.4242 15L6.83709 4.41291C6.47097 4.0468 6.47097 3.4532 6.83709 3.08709Z"
                            fill="white"
                          />
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M14.3371 3.08709C14.7032 2.72097 15.2968 2.72097 15.6629 3.08709L26.9129 14.3371C27.279 14.7032 27.279 15.2968 26.9129 15.6629L15.6629 26.9129C15.2968 27.279 14.7032 27.279 14.3371 26.9129C13.971 26.5468 13.971 25.9532 14.3371 25.5871L24.9242 15L14.3371 4.41291C13.971 4.0468 13.971 3.4532 14.3371 3.08709Z"
                            fill="white"
                          />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))
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
              onClick={() => onSort("asc")}
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
              onClick={() => onSort("desc")}
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
    </article>
  );
}
