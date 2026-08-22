/** Non-destructive DOM helpers — update text in existing legacy markup only. */

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

  const nodes = Array.from(parent.querySelectorAll<HTMLElement>(itemSelector));
  if (!nodes.length) return;

  if (!items.length) {
    nodes.forEach((el) => {
      el.style.display = "none";
    });
    return;
  }

  const template = nodes[0]!;
  const host = template.parentElement;
  if (!host) return;

  items.forEach((item, index) => {
    let el = nodes[index];
    if (!el) {
      el = template.cloneNode(true) as HTMLElement;
      host.appendChild(el);
    }
    el.style.display = "";
    patch(el, item, index);
  });

  host.querySelectorAll<HTMLElement>(itemSelector).forEach((el, index) => {
    if (index >= items.length) el.style.display = "none";
  });
}

export function patchTableRows<T>(
  table: Element | null,
  items: T[],
  patch: (row: HTMLTableRowElement, item: T, index: number) => void,
) {
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr"));
  if (!rows.length) return;

  if (!items.length) {
    rows.forEach((row) => {
      row.style.display = "none";
    });
    return;
  }

  const template = rows[0]!;

  items.forEach((item, index) => {
    let row = rows[index];
    if (!row) {
      row = template.cloneNode(true) as HTMLTableRowElement;
      tbody.appendChild(row);
    }
    row.style.display = "";
    patch(row, item, index);
  });

  tbody.querySelectorAll<HTMLTableRowElement>("tr").forEach((row, index) => {
    if (index >= items.length) row.style.display = "none";
  });
}

/**
 * Hide Figma demo lists immediately so leftover names/events never stay
 * on screen when Mongo has fewer (or zero) rows.
 */
export function hideLegacyDemoContent(root: ParentNode) {
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
    el.style.display = "none";
  });
}
