import { readAuthSession, saveAuthSession, type UserProfile } from "@/lib/user-api";

export const PROFILE_PHOTO_STORAGE_KEY = "dcspaceProfilePhotoImage";
export const PROFILE_COVER_STORAGE_KEY = "dcspaceProfileCoverImage";
export const PROFILE_INFO_STORAGE_KEY = "dc_profile_info";

const MAX_AVATAR_DIMENSION = 512;
const MAX_BANNER_DIMENSION = 960;
const JPEG_QUALITY = 0.82;
const MAX_DATA_URL_LENGTH = 280_000;

function normalizeStorageAccountKey(value?: string) {
  return (
    (value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "guest"
  );
}

export function getActiveStorageAccountKey() {
  if (typeof window === "undefined") {
    return "guest";
  }
  const session = readAuthSession();
  const accountSeed =
    session?.user.id ||
    session?.user.email ||
    window.localStorage.getItem("dcspaceStudentEmail") ||
    window.localStorage.getItem("dcspaceStudentNumber") ||
    "";
  return normalizeStorageAccountKey(accountSeed);
}

export function getScopedStorageKey(baseKey: string, accountKey?: string) {
  const resolvedAccountKey = normalizeStorageAccountKey(accountKey || getActiveStorageAccountKey());
  return `${baseKey}:${resolvedAccountKey}`;
}

export function getProfilePhotoStorageKey(accountKey?: string) {
  return getScopedStorageKey(PROFILE_PHOTO_STORAGE_KEY, accountKey);
}

export function getProfileCoverStorageKey(accountKey?: string) {
  return getScopedStorageKey(PROFILE_COVER_STORAGE_KEY, accountKey);
}

export function getProfileInfoStorageKey(accountKey?: string) {
  return getScopedStorageKey(PROFILE_INFO_STORAGE_KEY, accountKey);
}

export function safeSetLocalStorage(key: string, value: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    try {
      window.localStorage.removeItem(key);
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

/** Remove legacy global photo keys so images never leak across accounts. */
export function clearLegacyGlobalPhotoKeys() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem("dc_profile_avatar");
  window.localStorage.removeItem("dc_profile_banner");
  window.localStorage.removeItem("dc_profile_info");
  window.localStorage.removeItem("dcspaceProfilePhotoImage");
  window.localStorage.removeItem("dcspaceProfileCoverImage");
}

export function compressDataUrl(dataUrl: string, maxDimension: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Unable to process image."));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const compressed = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      resolve(
        compressed.length <= MAX_DATA_URL_LENGTH
          ? compressed
          : canvas.toDataURL("image/jpeg", 0.65),
      );
    };

    image.onerror = () => reject(new Error("Unable to read image."));
    image.src = dataUrl;
  });
}

export async function fileToCompressedDataUrl(file: File, maxDimension: number) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read image file."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error || new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });

  return compressDataUrl(dataUrl, maxDimension);
}

export async function prepareProfilePhotoForStorage(file: File) {
  return fileToCompressedDataUrl(file, MAX_AVATAR_DIMENSION);
}

export async function prepareCoverImageForStorage(file: File) {
  return fileToCompressedDataUrl(file, MAX_BANNER_DIMENSION);
}

export function cacheAccountImages(profile: UserProfile) {
  if (typeof window === "undefined") {
    return;
  }

  clearLegacyGlobalPhotoKeys();

  const accountKey = normalizeStorageAccountKey(profile.id || profile.email);
  const photoKey = getProfilePhotoStorageKey(accountKey);
  const coverKey = getProfileCoverStorageKey(accountKey);

  if (profile.photoUrl) {
    safeSetLocalStorage(photoKey, profile.photoUrl);
  } else {
    window.localStorage.removeItem(photoKey);
  }

  if (profile.bannerUrl) {
    safeSetLocalStorage(coverKey, profile.bannerUrl);
  } else {
    window.localStorage.removeItem(coverKey);
  }
}

export function applyProfilePhotoLocally(photoUrl: string) {
  safeSetLocalStorage(getProfilePhotoStorageKey(), photoUrl);
  const session = readAuthSession();
  if (session) {
    saveAuthSession(session.token, { ...session.user, photoUrl });
  }
}

export function applyCoverImageLocally(bannerUrl: string) {
  safeSetLocalStorage(getProfileCoverStorageKey(), bannerUrl);
  const session = readAuthSession();
  if (session) {
    saveAuthSession(session.token, { ...session.user, bannerUrl });
  }
}

export function applyAvatarToDom(photoUrl?: string) {
  const avatarEl = document.getElementById("profile-avatar");
  if (!avatarEl) {
    return;
  }

  if (photoUrl) {
    avatarEl.style.backgroundImage = `url("${photoUrl}")`;
    avatarEl.style.backgroundSize = "cover";
    avatarEl.style.backgroundPosition = "center";
    avatarEl.textContent = "";
    avatarEl.classList.add("is-photo");
    avatarEl.setAttribute("aria-label", "Profile photo");
    return;
  }

  avatarEl.style.backgroundImage = "";
  avatarEl.classList.remove("is-photo");
  if (!avatarEl.textContent?.trim()) {
    avatarEl.textContent = "🐱";
  }
  avatarEl.setAttribute("aria-label", "Profile photo placeholder");
}

export function applyBannerToDom(bannerUrl?: string) {
  const bannerEl = document.getElementById("profile-banner");
  if (!bannerEl) {
    return;
  }

  if (bannerUrl) {
    bannerEl.style.backgroundImage = `url("${bannerUrl}")`;
    bannerEl.classList.add("has-photo");
    return;
  }

  bannerEl.style.backgroundImage = "";
  bannerEl.classList.remove("has-photo");
}
