/** Shared empty-state illustration and markup helpers. */

export const EMPTY_STATE_ICON = "/empty-state.svg";

export type EmptyStateCopy = {
  title: string;
  description: string;
};

export function escapeEmptyStateHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildEmptyStateMarkup(
  copy: EmptyStateCopy,
  options?: {
    compact?: boolean;
    section?: boolean;
    extraClass?: string;
  },
) {
  const sizeClass = options?.section
    ? " dc-empty-state--section"
    : options?.compact
      ? " dc-empty-state--compact"
      : "";
  const extraClass = options?.extraClass ? ` ${options.extraClass}` : "";

  return (
    `<div class="dc-empty-state${sizeClass}${extraClass}" role="status">` +
    `<img class="dc-empty-state__icon" src="${EMPTY_STATE_ICON}" width="160" height="161" alt="" aria-hidden="true" />` +
    `<h3 class="dc-empty-state__title">${escapeEmptyStateHtml(copy.title)}</h3>` +
    `<p class="dc-empty-state__description">${escapeEmptyStateHtml(copy.description)}</p>` +
    `</div>`
  );
}
