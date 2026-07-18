export type EventGalleryPhoto = {
  id: string;
  dataUrl: string;
  uploadedAt: string;
};

const STORAGE_KEY = "dc_organized_event_gallery_v1";

function loadAll(): Record<string, EventGalleryPhoto[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, EventGalleryPhoto[]>;
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, EventGalleryPhoto[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event("dc-gallery-changed"));
}

export function getEventGalleryPhotos(eventId: string): EventGalleryPhoto[] {
  return loadAll()[eventId] ?? [];
}

export function addEventGalleryPhoto(eventId: string, dataUrl: string): EventGalleryPhoto {
  const map = loadAll();
  const photo: EventGalleryPhoto = {
    id: `${eventId}-photo-${Date.now()}`,
    dataUrl,
    uploadedAt: new Date().toISOString(),
  };
  map[eventId] = [...(map[eventId] ?? []), photo];
  saveAll(map);
  return photo;
}

export function removeEventGalleryPhoto(eventId: string, photoId: string) {
  const map = loadAll();
  map[eventId] = (map[eventId] ?? []).filter((photo) => photo.id !== photoId);
  saveAll(map);
}
