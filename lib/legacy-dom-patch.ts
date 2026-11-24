/** Non-destructive DOM helpers — update text in existing legacy markup only. */

import { EMPTY_STATE_ICON } from "@/lib/ui/empty-state";

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
`;
  document.head.appendChild(style);
}

export function setLegacyHidden(el: HTMLElement | null | undefined, hidden: boolean) {
  if (!el) return;
  ensureLegacyHideStyles();
  el.classList.toggle(HIDDEN_CLASS, hidden);
  el.classList.toggle("is-hidden", hidden);
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
    el.setAttribute(LIVE_ATTR, "1");
    patch(el, item, index);
  });

  host.querySelectorAll<HTMLElement>(itemSelector).forEach((el, index) => {
    if (index >= items.length) {
      el.removeAttribute(LIVE_ATTR);
      setLegacyHidden(el, true);
    }
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
    row.setAttribute(LIVE_ATTR, "1");
    patch(row, item, index);
  });

  tbody.querySelectorAll<HTMLTableRowElement>("tr").forEach((row, index) => {
    if (index >= items.length) {
      row.removeAttribute(LIVE_ATTR);
      setLegacyHidden(row, true);
    }
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
    // Never hide rows/cards already filled with live data (the bridges can run
    // in either order, so this may run after real data is on screen).
    if (el.hasAttribute(LIVE_ATTR)) return;
    setLegacyHidden(el, true);
  });
}

/** Marks an element as showing live (database) data so demo-hiding skips it. */
export const LIVE_ATTR = "data-dc-live";
export function markLive(el: Element | null | undefined) {
  el?.setAttribute(LIVE_ATTR, "1");
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

/**
 * Sync Asc/Desc pager labels with actually visible event rows
 * (ignores dc-legacy-hidden / [hidden] template stubs).
 */
export function updateEventsPagers(root: ParentNode | null) {
  if (!root) return;
  const blocks = Array.from(
    (root as Element).querySelectorAll?.(".events-block") || [],
  ) as HTMLElement[];
  const panels =
    blocks.length > 0
      ? blocks
      : (Array.from(
          (root as Element).querySelectorAll?.(".events-panel") || [],
        ) as HTMLElement[]);

  panels.forEach((block) => {
    const panel = block.classList.contains("events-panel")
      ? block
      : block.querySelector<HTMLElement>(".events-panel") || block;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(".event-item"));
    const visible = items.filter(
      (el) =>
        !el.classList.contains(HIDDEN_CLASS) &&
        !el.classList.contains("is-hidden") &&
        !el.hasAttribute("hidden"),
    );
    const pager =
      panel.querySelector(".pager") || block.querySelector(".pager");
    if (!pager) return;
    const spans = pager.querySelectorAll("span");
    const total = visible.length;
    if (spans[0]) {
      spans[0].textContent = `Show ${total} out of ${total} entries`;
    }
    if (spans[1]) {
      spans[1].textContent = `Page ${total ? 1 : 0} of ${total ? 1 : 0}`;
    }
  });
}

/** Show / hide an empty-state note inside the admin notifications panel. */
export function setNotifEmptyState(
  list: Element | null,
  empty: boolean,
  copy?: { title?: string; text?: string },
) {
  if (!list) return;
  ensureLegacyHideStyles();

  const panel = list.closest(".notif-panel") || list.parentElement;
  if (!panel) return;

  const title = copy?.title || "No notifications";
  const text =
    copy?.text || "You're all caught up. New alerts will appear here when something needs your attention.";

  let note = panel.querySelector<HTMLElement>(`:scope > .${EMPTY_CLASS}.dc-notif-empty`);
  if (!note) {
    note = document.createElement("div");
    note.className = `${EMPTY_CLASS} dc-notif-empty`;
    note.setAttribute("role", "status");
    note.innerHTML = `
      <img class="${EMPTY_CLASS}__icon" src="/no-event.svg" width="96" height="96" alt="" aria-hidden="true" />
      <h3 class="${EMPTY_CLASS}__title"></h3>
      <p class="${EMPTY_CLASS}__text"></p>
    `;
    const footer = panel.querySelector(".notif-footer");
    if (footer) panel.insertBefore(note, footer);
    else panel.appendChild(note);
  }

  const titleEl = note.querySelector(`.${EMPTY_CLASS}__title`);
  const textEl = note.querySelector(`.${EMPTY_CLASS}__text`);
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  setLegacyHidden(note, !empty);
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
      note.className = `dc-empty-state dc-empty-state--admin ${EMPTY_CLASS}`;
      note.setAttribute("role", "status");
      note.innerHTML = `
        <img class="dc-empty-state__icon ${EMPTY_CLASS}__icon" src="${EMPTY_STATE_ICON}" width="140" height="141" alt="" aria-hidden="true" />
        <h3 class="dc-empty-state__title ${EMPTY_CLASS}__title"></h3>
        <p class="dc-empty-state__description ${EMPTY_CLASS}__text"></p>
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
    note.className = `dc-empty-state dc-empty-state--compact ${EMPTY_CLASS} dc-card-row-empty`;
    note.setAttribute("role", "status");
    note.innerHTML = `
      <img class="dc-empty-state__icon ${EMPTY_CLASS}__icon" src="${EMPTY_STATE_ICON}" width="140" height="141" alt="" aria-hidden="true" />
      <h3 class="dc-empty-state__title ${EMPTY_CLASS}__title"></h3>
      <p class="dc-empty-state__description ${EMPTY_CLASS}__text"></p>
    `;
    row.appendChild(note);
  }

  const titleEl = note.querySelector(`.${EMPTY_CLASS}__title`);
  const textEl = note.querySelector(`.${EMPTY_CLASS}__text`);
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  setLegacyHidden(note, false);
}
