"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveAdminEventId } from "@/lib/events/resolve-admin-event-id";

type GalleryPhoto = {
  id: string;
  dataUrl: string;
  uploadedAt: string;
  archived?: boolean;
  source?: string;
};

function pageIdFromPath(pathname: string) {
  if (!pathname.startsWith("/admin")) return "";
  return pathname.replace(/^\/admin\/?/, "").split("/")[0] || "";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image."));
    };
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function renderPhotoGrid(photos: GalleryPhoto[], eventId: string, showArchived: boolean) {
  const grid = document.getElementById("event-photo-grid");
  const empty = document.getElementById("event-photo-empty");
  const count = document.getElementById("event-photo-count");
  if (!grid) return;

  const visible = showArchived ? photos : photos.filter((photo) => !photo.archived);
  if (count) {
    const active = photos.filter((photo) => !photo.archived).length;
    const archived = photos.filter((photo) => photo.archived).length;
    count.textContent = showArchived
      ? `${active} active · ${archived} archived`
      : `${active} photos`;
  }

  if (!visible.length) {
    grid.innerHTML = "";
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = visible
    .map((photo) => {
      const label = photo.archived ? "Restore" : "Archive";
      const next = photo.archived ? "false" : "true";
      return `<div class="dc-photo-item${photo.archived ? " is-archived" : ""}" data-photo-id="${photo.id}">
        <img src="${photo.dataUrl}" alt="Event photo" />
        <div class="dc-photo-actions">
          <button type="button" data-archive="${next}">${label}</button>
        </div>
      </div>`;
    })
    .join("");

  grid.querySelectorAll<HTMLButtonElement>("button[data-archive]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = btn.closest(".dc-photo-item");
      const photoId = item?.getAttribute("data-photo-id") || "";
      const archived = btn.getAttribute("data-archive") === "true";
      if (!photoId) return;
      btn.disabled = true;
      try {
        const res = await fetch(
          `/api/admin/events/${encodeURIComponent(eventId)}/photos/${encodeURIComponent(photoId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ archived }),
          },
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to update photo.");
        }
        window.dispatchEvent(new Event("dc-admin-photos-changed"));
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Failed to update photo.");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function loadPhotos(eventId: string) {
  const showArchived =
    (document.getElementById("event-photo-show-archived") as HTMLInputElement | null)
      ?.checked || false;
  const res = await fetch(
    `/api/admin/events/${encodeURIComponent(eventId)}/photos?includeArchived=1`,
    { cache: "no-store", credentials: "include" },
  );
  if (!res.ok) return;
  const payload = (await res.json()) as { photos?: GalleryPhoto[] };
  renderPhotoGrid(payload.photos || [], eventId, showArchived);
}

/** Feature #9: Event Photo Archive on /admin/live16 using event_gallery dataUrl storage. */
export function AdminEventPhotosBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pageIdFromPath(pathname) !== "live16") return;
    if (!document.getElementById("event-photo-archive-card")) return;

    let cancelled = false;
    let eventId = "";

    const run = async () => {
      eventId = await resolveAdminEventId(
        searchParams.get("id") || "",
        searchParams.get("status") || "",
      );
      if (!eventId || cancelled) return;
      await loadPhotos(eventId);
    };

    const uploadBtn = document.getElementById("event-photo-upload-btn");
    const fileInput = document.getElementById(
      "event-photo-file-input",
    ) as HTMLInputElement | null;
    const showArchived = document.getElementById(
      "event-photo-show-archived",
    ) as HTMLInputElement | null;

    const onUploadClick = () => fileInput?.click();
    const onFiles = async () => {
      if (!fileInput?.files?.length || !eventId) return;
      const files = Array.from(fileInput.files).filter((file) =>
        file.type.startsWith("image/"),
      );
      for (const file of files) {
        try {
          const dataUrl = await fileToDataUrl(file);
          const res = await fetch(
            `/api/admin/events/${encodeURIComponent(eventId)}/photos`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ dataUrl }),
            },
          );
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}));
            throw new Error(payload.error || "Upload failed.");
          }
        } catch (error) {
          window.alert(error instanceof Error ? error.message : "Upload failed.");
          break;
        }
      }
      fileInput.value = "";
      window.dispatchEvent(new Event("dc-admin-photos-changed"));
    };
    const onToggle = () => {
      if (eventId) void loadPhotos(eventId);
    };
    const onChanged = () => {
      if (eventId) void loadPhotos(eventId);
    };

    uploadBtn?.addEventListener("click", onUploadClick);
    fileInput?.addEventListener("change", onFiles);
    showArchived?.addEventListener("change", onToggle);
    window.addEventListener("dc-admin-photos-changed", onChanged);

    const timer = window.setTimeout(() => void run(), 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      uploadBtn?.removeEventListener("click", onUploadClick);
      fileInput?.removeEventListener("change", onFiles);
      showArchived?.removeEventListener("change", onToggle);
      window.removeEventListener("dc-admin-photos-changed", onChanged);
    };
  }, [pathname, searchParams]);

  return null;
}
