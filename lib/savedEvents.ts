const SAVED_STORAGE_KEY = "dc_saved_events";

export function getSavedEventIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function isEventSaved(id: string | number): boolean {
  return getSavedEventIds().includes(String(id));
}

export function setSavedEventIds(ids: string[]) {
  localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent("dc-saved-changed"));
}

export function toggleSavedEvent(id: string | number): boolean {
  const sid = String(id);
  const ids = getSavedEventIds();
  const index = ids.indexOf(sid);
  if (index === -1) {
    ids.push(sid);
  } else {
    ids.splice(index, 1);
  }
  setSavedEventIds(ids);
  return ids.includes(sid);
}
