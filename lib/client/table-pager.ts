/**
 * Client-side pagination (+ sort) for the admin legacy tables whose Figma footers
 * shipped with static "Page 1 of 1" / "Show 6 out of 6 entries" controls.
 *
 * Call it after every (re)hydration of the table; the page, page size and sort
 * order are kept on the table element, so live refreshes don't jump back to page 1.
 * Rows hidden by the data layer (hidden attribute) or by the top search bar
 * (style.display = "none") are left out of the count.
 */

type PagerState = { page: number; size: number; sort: "asc" | "desc" | null };

export type TablePagerOptions = {
  table: Element | null;
  /** "Page 1 of 1" label. */
  pageLabel?: Element | null;
  prevButton?: HTMLElement | null;
  nextButton?: HTMLElement | null;
  /** Full "Showing 1–5 of 23 entries" label (Certificates list). */
  entriesLabel?: Element | null;
  /** Page-size stepper (event certificate page): number label, "out of N entries" label, buttons. */
  sizeLabel?: Element | null;
  totalLabel?: Element | null;
  fewerButton?: HTMLElement | null;
  moreButton?: HTMLElement | null;
  /** Ascending / Descending buttons (data-sort="asc|desc") and the cell to sort by. */
  sortButtons?: Iterable<HTMLElement>;
  sortCellIndex?: number;
  pageSize?: number;
};

const SIZE_STEPS = [5, 10, 20, 50];
const OFF_ATTR = "data-dc-page-off";

function ensureStyle() {
  if (document.getElementById("dc-table-pager-style")) return;
  const style = document.createElement("style");
  style.id = "dc-table-pager-style";
  style.textContent = `tr[${OFF_ATTR}] { display: none !important; }
.dc-pager-disabled { opacity: 0.4 !important; cursor: default !important; }`;
  document.head.appendChild(style);
}

export function attachTablePager(options: TablePagerOptions) {
  const table = options.table as (HTMLElement & { __dcPager?: PagerState; __dcPagerRefresh?: () => void }) | null;
  const tbody = table?.querySelector("tbody");
  if (!table || !tbody) return;
  ensureStyle();

  const state: PagerState = table.__dcPager || { page: 1, size: options.pageSize || 5, sort: null };
  table.__dcPager = state;

  const rows = () => Array.from(tbody.querySelectorAll<HTMLTableRowElement>(":scope > tr"));
  const isDataRow = (tr: HTMLTableRowElement) => !tr.hasAttribute("hidden");
  const isSearchHidden = (tr: HTMLTableRowElement) => tr.style.display === "none";

  const applySort = () => {
    if (!state.sort) return;
    const index = options.sortCellIndex ?? 0;
    const data = rows().filter(isDataRow);
    const key = (tr: HTMLTableRowElement) => (tr.cells[index]?.textContent || "").trim().toLowerCase();
    data.sort((a, b) => key(a).localeCompare(key(b)) * (state.sort === "desc" ? -1 : 1));
    // Data rows first (sorted), then the hidden template rows.
    const hidden = rows().filter((tr) => !isDataRow(tr));
    [...data, ...hidden].forEach((tr) => tbody.appendChild(tr));
  };

  const refresh = () => {
    applySort();
    const visible = rows().filter((tr) => isDataRow(tr) && !isSearchHidden(tr));
    const total = visible.length;
    const pages = Math.max(1, Math.ceil(total / state.size));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.size;
    rows().forEach((tr) => tr.removeAttribute(OFF_ATTR));
    visible.forEach((tr, index) => {
      if (index < start || index >= start + state.size) tr.setAttribute(OFF_ATTR, "");
    });

    if (options.pageLabel) options.pageLabel.textContent = `Page ${state.page} of ${pages}`;
    if (options.entriesLabel) {
      options.entriesLabel.textContent = total
        ? `Showing ${start + 1}–${Math.min(start + state.size, total)} of ${total} entries`
        : "No entries";
    }
    if (options.sizeLabel) options.sizeLabel.textContent = String(state.size);
    if (options.totalLabel) options.totalLabel.textContent = `out of ${total} entries`;
    const setDisabled = (button: HTMLElement | null | undefined, disabled: boolean) => {
      if (!button) return;
      button.classList.toggle("dc-pager-disabled", disabled);
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
    };
    setDisabled(options.prevButton, state.page <= 1);
    setDisabled(options.nextButton, state.page >= pages);
    setDisabled(options.fewerButton, state.size <= SIZE_STEPS[0]);
    setDisabled(options.moreButton, state.size >= SIZE_STEPS[SIZE_STEPS.length - 1]);
  };
  table.__dcPagerRefresh = refresh;

  const wire = (button: HTMLElement | null | undefined, onClick: () => void) => {
    if (!button || button.dataset.dcPagerWired === "1") return;
    button.dataset.dcPagerWired = "1";
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClick();
        table.__dcPagerRefresh?.();
      },
      true,
    );
  };
  wire(options.prevButton, () => {
    state.page -= 1;
  });
  wire(options.nextButton, () => {
    state.page += 1;
  });
  wire(options.fewerButton, () => {
    const index = SIZE_STEPS.findIndex((step) => step >= state.size);
    state.size = SIZE_STEPS[Math.max(0, index - 1)] ?? SIZE_STEPS[0];
    state.page = 1;
  });
  wire(options.moreButton, () => {
    const next = SIZE_STEPS.find((step) => step > state.size);
    state.size = next ?? state.size;
    state.page = 1;
  });
  const sortButtons = Array.from(options.sortButtons || []);
  sortButtons.forEach((button) =>
    wire(button, () => {
      state.sort = button.dataset.sort === "desc" ? "desc" : "asc";
      sortButtons.forEach((other) => other.classList.toggle("active", other === button));
      state.page = 1;
    }),
  );

  // Top search bar filters rows → recount pages (runs after the filter listener).
  const search = document.querySelector<HTMLInputElement>(".topbar .search-bar input");
  if (search && search.dataset.dcPagerWired !== "1") {
    search.dataset.dcPagerWired = "1";
    search.addEventListener("input", () => {
      state.page = 1;
      table.__dcPagerRefresh?.();
    });
  }

  refresh();
}
