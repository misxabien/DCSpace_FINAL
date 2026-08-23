/** Non-destructive DOM helpers — update text in existing legacy markup only. */

const HIDDEN_CLASS = "dc-legacy-hidden";
const EMPTY_CLASS = "dc-events-empty";

const HIDE_STYLE_ID = "dc-legacy-hide-style";

export function ensureLegacyHideStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(HIDE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIDE_STYLE_ID;
  style.textContent = `
.${HIDDEN_CLASS} { display: none !important; }
.${EMPTY_CLASS} {
  width: 100%;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 36px 24px;
  margin: 8px 0 12px;
  text-align: center;
  background: #fff;
  border: 1px solid rgba(68, 138, 255, 0.14);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(19, 87, 201, 0.04), 0 4px 14px rgba(68, 138, 255, 0.07);
  color: #b7aa89;
}
.${EMPTY_CLASS}.${HIDDEN_CLASS} { display: none !important; }
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
    el.style.display = "none";
  } else {
    el.removeAttribute("hidden");
    el.style.removeProperty("display");
  }
}

export function setStatByLabel(
  root: ParentNode,
  label: string,
  value: string | number,
  selectors = ".stat-card, .user-stat, .fb-stat, .cert-stat, .rp-stat",
) {
  root.querySelectorAll(selectors).forEach((card) => {
    const labelEl = card.querySelector(".stat-label, .label, .fb-stat-head span");
    if (!labelEl) return;
    const text = (labelEl.textContent || "").trim().toLowerCase();
    if (!text.includes(label.toLowerCase())) return;
    const valueEl = card.querySelector(".stat-value, .value, .fb-stat-body .value");
    if (valueEl) valueEl.textContent = String(value);
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

  items.forEach((item, index) => {
    let el = nodes[index];
    if (!el) {
      el = template.cloneNode(true) as HTMLElement;
      el.removeAttribute("data-dc-template");
      host.appendChild(el);
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

  const title = copy?.title || "No events scheduled for today.";
  const text =
    copy?.text ||
    "You currently have no events happening today. Check back later or join a new event to get started.";

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
      const footer = panel.querySelector(".events-footer");
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
