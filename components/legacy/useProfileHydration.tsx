"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  fetchProfile,
  readAuthSession,
  saveAuthSession,
  syncProfileToLegacyStorage,
  updateProfile,
  type UserProfile,
} from "@/lib/user-api";
import {
  applyAvatarToDom,
  applyBannerToDom,
  applyCoverImageLocally,
  applyProfilePhotoLocally,
  cacheAccountImages,
  getProfileInfoStorageKey,
  prepareCoverImageForStorage,
  prepareProfilePhotoForStorage,
} from "@/lib/profile-images";

const COURSE_LABELS: Record<string, string> = {
  "bs-medical-laboratory-science": "BS Medical Laboratory Science (Medical Technology)",
  "bs-biology": "BS Biology",
  "bs-pharmacy": "BS Pharmacy",
  "bs-accountancy": "BS Accountancy",
  "bs-accounting-information-system": "BS Accounting Information System",
  "bs-psychology": "BS Psychology",
  beed: "BEED",
  bsed: "BSED",
  "bs-information-technology": "BS Information Technology",
  bma: "BMA",
  "ba-communication": "BA Communication",
  "bsba-financial-management": "BSBA Financial Management",
  "bsba-marketing-management": "BSBA Marketing Management",
  "bsba-human-resource-management": "BSBA Human Resource Management",
  bshm: "BSHM",
  bstm: "BSTM",
  "bs-nursing": "BS Nursing",
  "bs-physical-therapy": "BS Physical Therapy",
};

const SCHOOL_LABELS: Record<string, string> = {
  sase: "SASE",
  scmcs: "SCMCS",
  sihtm: "SIHTM",
  shs: "SHS",
  snahs: "SNAHS",
};

function displayLabel(value: string, map: Record<string, string>) {
  const key = String(value || "").trim();
  if (!key) return "";
  return map[key] || key;
}

function setInputValue(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (input) {
    input.value = value || "";
  }
}

function showPhotoHint(message: string, isError = false) {
  const saveHint = document.getElementById("profile-save-hint");
  if (!saveHint) {
    return;
  }
  saveHint.textContent = message;
  saveHint.classList.toggle("is-saved", !isError);
}

function applyProfileToDom(profile: UserProfile) {
  const fullName =
    profile.fullName || `${profile.firstName || ""} ${profile.lastName || ""}`.trim();

  document.querySelectorAll(".main__user-name").forEach((el) => {
    el.textContent = fullName || "Your Name";
  });

  // Home greeting: "Hello, User Name!" → registered account name
  document.querySelectorAll(".main__greeting").forEach((el) => {
    const text = (el.textContent || "").trim();
    if (/^Hello,\s+/i.test(text) || /User Name/i.test(text)) {
      el.textContent = `Hello, ${fullName || "User"}!`;
    }
  });

  // Always reset/apply photos for the active account (empty = default placeholder).
  // Also updates the top-right profile logo on every app page.
  applyAvatarToDom(profile.photoUrl || "");
  applyBannerToDom(profile.bannerUrl || "");
  cacheAccountImages(profile);

  if (!document.getElementById("profile-name")) {
    return;
  }

  setInputValue("profile-name", fullName);
  setInputValue("profile-email", profile.email || "");
  setInputValue("profile-student-number", profile.studentNumber || "");
  setInputValue("profile-course", displayLabel(profile.course || "", COURSE_LABELS));
  setInputValue("profile-department", displayLabel(profile.school || "", SCHOOL_LABELS));
  setInputValue("profile-organization", profile.organizationPart || "None");
  setInputValue("profile-org-role", profile.organizationRole || "None");
  setInputValue("profile-org-position", profile.organizationRole || "");
  setInputValue("profile-rfid", profile.rfidNumber || "");
  setInputValue(
    "profile-account-type",
    profile.role?.toLowerCase() === "faculty" ? "Faculty" : "Student",
  );

  const aboutTitle = document.getElementById("profile-about-title");
  if (aboutTitle) {
    const firstName = (profile.firstName || fullName.split(/\s+/)[0] || "You").trim();
    aboutTitle.textContent = `About ${firstName}`;
  }

  try {
    window.localStorage.setItem(
      getProfileInfoStorageKey(profile.id || profile.email),
      JSON.stringify({
        name: fullName,
        email: profile.email || "",
        studentNumber: profile.studentNumber || "",
        course: displayLabel(profile.course || "", COURSE_LABELS),
        department: displayLabel(profile.school || "", SCHOOL_LABELS),
        organization: profile.organizationPart || "None",
        orgRole: profile.organizationRole || "None",
        orgPosition: profile.organizationRole || "",
        rfidNumber: profile.rfidNumber || "",
        accountType: profile.role?.toLowerCase() === "faculty" ? "Faculty" : "Student",
      }),
    );
  } catch {
    /* ignore quota errors */
  }
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function useProfileHydration() {
  const pathname = usePathname();

  useEffect(() => {
    const session = readAuthSession();
    if (!session?.user) {
      return;
    }

    applyProfileToDom(session.user);

    let cancelled = false;

    async function refreshFromServer() {
      try {
        const result = await fetchProfile(session!.token);
        if (cancelled) return;
        saveAuthSession(session!.token, result.profile);
        syncProfileToLegacyStorage(result.profile);
        applyProfileToDom(result.profile);
      } catch {
        /* keep local session data if API is unreachable */
      }
    }

    void refreshFromServer();

    if (pathname !== "/profile") {
      return () => {
        cancelled = true;
      };
    }

    const saveBtn = document.getElementById("save-profile-btn");
    const avatarInput = document.getElementById("avatar-photo-input") as HTMLInputElement | null;
    const bannerInput = document.getElementById("banner-photo-input") as HTMLInputElement | null;

    const onSaveClick = () => {
      const isSaving = saveBtn?.classList.contains("is-editing");
      if (!isSaving) {
        return;
      }

      window.setTimeout(async () => {
        const current = readAuthSession();
        if (!current?.token) {
          return;
        }

        const name =
          (document.getElementById("profile-name") as HTMLInputElement | null)?.value || "";
        const { firstName, lastName } = splitFullName(name);
        const course =
          (document.getElementById("profile-course") as HTMLInputElement | null)?.value || "";
        const school =
          (document.getElementById("profile-department") as HTMLInputElement | null)?.value || "";
        const organizationPart =
          (document.getElementById("profile-organization") as HTMLInputElement | null)?.value || "";
        const organizationRole =
          (document.getElementById("profile-org-role") as HTMLInputElement | null)?.value ||
          (document.getElementById("profile-org-position") as HTMLInputElement | null)?.value ||
          "";
        const rfidNumber =
          (document.getElementById("profile-rfid") as HTMLInputElement | null)?.value || "";

        try {
          const result = await updateProfile(current.token, {
            firstName,
            lastName,
            course,
            school,
            organizationPart: organizationPart === "None" ? "" : organizationPart,
            organizationRole: organizationRole === "None" ? "" : organizationRole,
            rfidNumber,
          });
          saveAuthSession(current.token, result.profile);
          syncProfileToLegacyStorage(result.profile);
          applyProfileToDom(result.profile);
        } catch {
          /* local save already handled by legacy script */
        }
      }, 0);
    };

    const onAvatarChange = async (event: Event) => {
      event.stopImmediatePropagation();
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file) {
        return;
      }

      const current = readAuthSession();
      if (!current?.token) {
        showPhotoHint("Please sign in again to save your photo.", true);
        return;
      }

      try {
        showPhotoHint("Saving profile photo…");
        const photoUrl = await prepareProfilePhotoForStorage(file);
        applyAvatarToDom(photoUrl);
        applyProfilePhotoLocally(photoUrl);
        const result = await updateProfile(current.token, { photoUrl });
        saveAuthSession(current.token, result.profile);
        syncProfileToLegacyStorage(result.profile);
        applyProfileToDom(result.profile);
        showPhotoHint("Profile photo saved to your account.");
      } catch (error) {
        showPhotoHint(
          error instanceof Error ? error.message : "Could not save profile photo.",
          true,
        );
      }
    };

    const onBannerChange = async (event: Event) => {
      event.stopImmediatePropagation();
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file) {
        return;
      }

      const current = readAuthSession();
      if (!current?.token) {
        showPhotoHint("Please sign in again to save your background photo.", true);
        return;
      }

      try {
        showPhotoHint("Saving background photo…");
        const bannerUrl = await prepareCoverImageForStorage(file);
        applyBannerToDom(bannerUrl);
        applyCoverImageLocally(bannerUrl);
        const result = await updateProfile(current.token, { bannerUrl });
        saveAuthSession(current.token, result.profile);
        syncProfileToLegacyStorage(result.profile);
        applyProfileToDom(result.profile);
        showPhotoHint("Background photo saved to your account.");
      } catch (error) {
        showPhotoHint(
          error instanceof Error ? error.message : "Could not save background photo.",
          true,
        );
      }
    };

    saveBtn?.addEventListener("click", onSaveClick, true);
    avatarInput?.addEventListener("change", onAvatarChange, true);
    bannerInput?.addEventListener("change", onBannerChange, true);

    return () => {
      cancelled = true;
      saveBtn?.removeEventListener("click", onSaveClick, true);
      avatarInput?.removeEventListener("change", onAvatarChange, true);
      bannerInput?.removeEventListener("change", onBannerChange, true);
    };
  }, [pathname]);
}
