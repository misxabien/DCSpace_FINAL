/** Non-destructive DOM helpers — update text in existing legacy markup only. */

const HIDDEN_CLASS = "dc-legacy-hidden";
const EMPTY_CLASS = "dc-events-empty";

const HIDE_STYLE_ID = "dc-legacy-hide-style-v5";

export function ensureLegacyHideStyles() {
  if (typeof document === "undefined") return;
  // Upgrade older injected style tags so centering / hide fixes apply after soft nav.
  ["dc-legacy-hide-style-v3", "dc-legacy-hide-style-v4"].forEach((id) => {
    document.getElementById(id)?.remove();
  });
  if (document.getElementById(HIDE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIDE_STYLE_ID;
  style.textContent = `
.${HIDDEN_CLASS},
a.event-item.${HIDDEN_CLASS},
a.event-item[hidden],
.event-item.${HIDDEN_CLASS},
.event-item[hidden],
article.event-card.${HIDDEN_CLASS},
article.event-card[hidden],
.card-row article.event-card.${HIDDEN_CLASS},
.card-row article.event-card[hidden],
a.att-event-card.${HIDDEN_CLASS},
a.att-event-card[hidden],
table tbody tr.${HIDDEN_CLASS},
table tbody tr[hidden] {
  display: none !important;
}
.${EMPTY_CLASS},
.${EMPTY_CLASS}.dc-card-row-empty {
  width: 100%;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px 16px;
  margin: 0;
  text-align: center;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  color: #b7aa89;
}
.card-row > .${EMPTY_CLASS}.dc-card-row-empty {
  grid-column: 1 / -1;
  justify-self: stretch;
  width: 100%;
  min-height: 240px;
}
.card-row > .${EMPTY_CLASS}.dc-card-row-empty.${HIDDEN_CLASS},
.card-row > .${EMPTY_CLASS}.dc-card-row-empty[hidden] {
  display: none !important;
}
.${EMPTY_CLASS}.${HIDDEN_CLASS},
.${EMPTY_CLASS}[hidden] {
  display: none !important;
}
.${EMPTY_CLASS}__icon {
  width: 120px;
  height: 120px;
  margin: 0 auto 8px;
  display: block;
  object-fit: contain;
}
.${EMPTY_CLASS}__title {
  margin: 0;
  max-width: 520px;
  color: #b1a483;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.35;
}
.${EMPTY_CLASS}__text {
  margin: 0;
  max-width: 520px;
  color: #b7aa89;
  font-size: 0.95rem;
  font-weight: 400;
  line-height: 1.55;
}
`;
  document.head.appendChild(style);
}

export function setLegacyHidden(el: HTMLElement | null | undefined, hidden: boolean) {
  if (!el) return;
  ensureLegacyHideStyles();
  el.classList.toggle(HIDDEN_CLASS, hidden);
  if (hidden) {
    el.setAttribute("hidden", "");
    el.style.setProperty("display", "none", "important");
  } else {
    el.removeAttribute("hidden");
    el.style.removeProperty("display");
  }
}

export const STAT_CARD_SELECTORS =
  ".stat-card, .user-stat, .fb-stat, .cert-stat, .rp-stat";

const STAT_VALUE_SELECTORS =
  ".stat-value, .value, .name, .fb-stat-body .value";

export function clearStatCardLoading(card: Element) {
  if (!(card instanceof HTMLElement)) return;
  card.classList.remove("dc-stat-loading");
  card.removeAttribute("aria-busy");
}

export function setStatCardsLoading(
  root: ParentNode,
  loading: boolean,
  selectors = STAT_CARD_SELECTORS,
) {
  root.querySelectorAll<HTMLElement>(selectors).forEach((card) => {
    if (loading) {
      card.classList.add("dc-stat-loading");
      card.setAttribute("aria-busy", "true");
    } else {
      clearStatCardLoading(card);
    }
  });

  root.querySelectorAll<HTMLElement>(".stats, .users-stats, .cert-stats, .rp-stats, .fb-stats").forEach(
    (section) => {
      if (loading) section.setAttribute("aria-busy", "true");
      else section.removeAttribute("aria-busy");
    },
  );
}

export function clearRemainingStatCardLoading(
  root: ParentNode,
  selectors = STAT_CARD_SELECTORS,
) {
  root.querySelectorAll<HTMLElement>(selectors).forEach((card) => {
    if (card.classList.contains("dc-stat-loading")) {
      clearStatCardLoading(card);
    }
  });
  root.querySelectorAll<HTMLElement>(".stats, .users-stats, .cert-stats, .rp-stats, .fb-stats").forEach(
    (section) => {
      if (!section.querySelector(".dc-stat-loading")) {
        section.removeAttribute("aria-busy");
      }
    },
  );
}

export function setStatByLabel(
  root: ParentNode,
  label: string,
  value: string | number,
  selectors = STAT_CARD_SELECTORS,
) {
  root.querySelectorAll(selectors).forEach((card) => {
    const labelEl = card.querySelector(".stat-label, .label, .fb-stat-head span");
    if (!labelEl) return;
    const text = (labelEl.textContent || "").trim().toLowerCase();
    if (!text.includes(label.toLowerCase())) return;
    const valueEl = card.querySelector(STAT_VALUE_SELECTORS);
    if (valueEl) {
      valueEl.textContent = String(value);
      clearStatCardLoading(card);
    }
  });
}

export function patchChildren<T>(
  parent: Element | null,
  itemSelector: string,
  items: T[],
  patch: (element: HTMLElement, item: T, index: number) => void,
) {
  if (!parent) return;
  ensureLegacyHideStyles();

  const nodes = Array.from(parent.querySelectorAll<HTMLElement>(itemSelector));
  if (!nodes.length) return;

  if (!items.length) {
    nodes.forEach((el) => setLegacyHidden(el, true));
    return;
  }

  const template = nodes[0]!;
  const host = template.parentElement;
  if (!host) return;

  const insertBeforeFooter = (el: HTMLElement) => {
    // Keep Asc/Desc + pager (and empty-state) at the bottom of the list card.
    const footer =
      host.querySelector(":scope > .events-footer") ||
      host.querySelector(":scope > .table-footer") ||
      host.querySelector(":scope > .cd-footer") ||
      host.querySelector(":scope > .cert-footer") ||
      host.querySelector(":scope > .cd-sort")?.closest(".cd-footer, .cert-footer, .events-footer") ||
      host.querySelector(`:scope > .${EMPTY_CLASS}`);
    if (footer) host.insertBefore(el, footer);
    else host.appendChild(el);
  };

  items.forEach((item, index) => {
    let el = nodes[index];
    if (!el) {
      el = template.cloneNode(true) as HTMLElement;
      el.removeAttribute("data-dc-template");
      insertBeforeFooter(el);
    }
    setLegacyHidden(el, false);
    patch(el, item, index);
  });

  host.querySelectorAll<HTMLElement>(itemSelector).forEach((el, index) => {
    if (index >= items.length) setLegacyHidden(el, true);
  });
}

export function patchTableRows<T>(
  table: Element | null,
  items: T[],
  patch: (row: HTMLTableRowElement, item: T, index: number) => void,
) {
  if (!table) return;
  ensureLegacyHideStyles();
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));
  if (!rows.length) return;

  if (!items.length) {
    rows.forEach((row) => setLegacyHidden(row, true));
    return;
  }

  const template = rows[0]!;

  items.forEach((item, index) => {
    let row = rows[index];
    if (!row) {
      row = template.cloneNode(true) as HTMLTableRowElement;
      tbody.appendChild(row);
    }
    setLegacyHidden(row, false);
    patch(row, item, index);
  });

  tbody.querySelectorAll<HTMLTableRowElement>("tr").forEach((row, index) => {
    if (index >= items.length) setLegacyHidden(row, true);
  });
}

/**
 * Hide Figma demo lists immediately so leftover names/events never stay
 * on screen when Mongo has fewer (or zero) rows.
 */
export function hideLegacyDemoContent(root: ParentNode) {
  ensureLegacyHideStyles();
  const scope =
    (root as Element).querySelector?.("main") ||
    (root as Element).querySelector?.(".content") ||
    root;
  const selector = [
    "table tbody tr",
    "a.event-item",
    "a.att-event-card",
    ".cert-card",
    ".card-row article.event-card",
    ".rank-row",
    ".task-item",
    ".rg-event",
    "article.notif-item",
  ].join(", ");
  scope.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    if (el.closest("#user-menu-popover, .user-menu, thead")) return;
    setLegacyHidden(el, true);
  });
}

/** Keep Asc/Desc + pager pinned to the bottom of every list card. */
export function ensureEventsFooterAtBottom(host: ParentNode | null) {
  if (!host) return;
  const panels = Array.from(
    (host as Element).querySelectorAll?.(
      ".events-panel, .cd-panel, .cert-table-panel, .panel-box",
    ) || [],
  ) as HTMLElement[];
  const targets =
    panels.length > 0
      ? panels
      : (host as Element).classList?.contains("events-panel") ||
          (host as Element).classList?.contains("cd-panel")
        ? [host as HTMLElement]
        : [];

  targets.forEach((panel) => {
    const footer = panel.querySelector<HTMLElement>(
      ":scope > .events-footer, :scope > .table-footer, :scope > .cd-footer, :scope > .cert-footer",
    );
    if (!footer) return;
    if (panel.lastElementChild !== footer) {
      panel.appendChild(footer);
    }
  });
}

/** Show / hide an empty-state note inside each events panel under a list host. */
export function setEventsEmptyState(
  host: Element | null,
  empty: boolean,
  copy?: { title?: string; text?: string },
) {
  if (!host) return;
  ensureLegacyHideStyles();

  const panels = Array.from(host.querySelectorAll<HTMLElement>(".events-panel"));
  const targets = panels.length ? panels : [host as HTMLElement];

  const title = copy?.title || "No events to show.";
  const text =
    copy?.text ||
    "Events from the database will appear here when they match this view.";

  targets.forEach((panel) => {
    let note = panel.querySelector<HTMLElement>(`:scope > .${EMPTY_CLASS}`);
    if (!note) {
      note = document.createElement("div");
      note.className = EMPTY_CLASS;
      note.setAttribute("role", "status");
      note.innerHTML = `
        <img class="${EMPTY_CLASS}__icon" src="/no-event.svg" width="120" height="120" alt="" aria-hidden="true" />
        <h3 class="${EMPTY_CLASS}__title"></h3>
        <p class="${EMPTY_CLASS}__text"></p>
      `;
      const footer = panel.querySelector(
        ".events-footer, .table-footer, .cd-footer, .cert-footer",
      );
      if (footer) panel.insertBefore(note, footer);
      else panel.appendChild(note);
    }
    const titleEl = note.querySelector(`.${EMPTY_CLASS}__title`);
    const textEl = note.querySelector(`.${EMPTY_CLASS}__text`);
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    setLegacyHidden(note, !empty);
  });
}

/** Empty state for dashboard card rows (Events Requiring Attention / Today's Events). */
export function setCardRowEmptyState(
  row: Element | null,
  empty: boolean,
  copy?: { title?: string; text?: string },
) {
  if (!row) return;
  ensureLegacyHideStyles();

  const title = copy?.title || "No events to show.";
  const text = copy?.text || "Live events from the database will appear here.";

  let note = row.querySelector<HTMLElement>(`:scope > .${EMPTY_CLASS}.dc-card-row-empty`);

  // When cards exist, drop any empty placeholder — do not leave a hidden sibling.
  if (!empty) {
    note?.remove();
    return;
  }

  if (!note) {
    note = document.createElement("div");
    note.className = `${EMPTY_CLASS} dc-card-row-empty`;
    note.setAttribute("role", "status");
    note.innerHTML = `
      <img class="${EMPTY_CLASS}__icon" src="/no-event.svg" width="96" height="96" alt="" aria-hidden="true" />
      <h3 class="${EMPTY_CLASS}__title"></h3>
      <p class="${EMPTY_CLASS}__text"></p>
    `;
    row.appendChild(note);
  }

  const titleEl = note.querySelector(`.${EMPTY_CLASS}__title`);
  const textEl = note.querySelector(`.${EMPTY_CLASS}__text`);
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  setLegacyHidden(note, false);
}
