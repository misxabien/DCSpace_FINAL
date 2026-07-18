const authStorageKey = "dcspace_auth";
const registrationDraftKey = "dcspace_registration_draft";
const authRequestTimeoutMs = 60_000;

export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  studentNumber: string;
  email: string;
  photoUrl?: string;
  bannerUrl?: string;
  role: string;
  rfidNumber?: string;
  organizationPart?: string;
  organizationRole?: string;
  course?: string;
  school?: string;
};

export type RegistrationDraft = {
  firstName?: string;
  lastName?: string;
  studentNumber?: string;
  course?: string;
  school?: string;
  organizationPart?: string;
  organizationRole?: string;
  rfidNumber?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  verificationCode?: string;
  role?: "student" | "faculty";
};

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const errorValue = (payload as { error?: unknown }).error;
  if (typeof errorValue === "string" && errorValue.trim()) {
    const detailsValue = (payload as { details?: unknown }).details;
    if (
      typeof detailsValue === "string" &&
      detailsValue.trim() &&
      !errorValue.includes(detailsValue) &&
      (/Failed to (login|register|send)/i.test(errorValue) ||
        /email|smtp|mongo/i.test(errorValue))
    ) {
      return `${errorValue} ${detailsValue}`;
    }
    return errorValue;
  }

  const detailsValue = (payload as { details?: unknown }).details;
  if (typeof detailsValue === "string" && detailsValue.trim()) {
    return detailsValue;
  }
  return null;
}

async function authRequest<T>(endpoint: "login" | "register" | "send-verification", body: unknown) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), authRequestTimeoutMs);

  try {
    const response = await fetch(`/api/user/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { error: (await response.text()) || `Request failed (${response.status}).` };

    if (!response.ok) {
      throw new Error(extractErrorMessage(payload) || "Request failed.");
    }

    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Check MongoDB and SMTP in .env, then try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendRegistrationVerificationEmail(email: string) {
  return authRequest<{ message: string; email: string; expiresAt: string }>("send-verification", {
    email,
  });
}

export async function registerUser(payload: {
  firstName: string;
  lastName: string;
  studentNumber: string;
  email: string;
  photoUrl?: string;
  rfidNumber?: string;
  organizationPart?: string;
  organizationRole?: string;
  course?: string;
  school?: string;
  password: string;
  confirmPassword: string;
  verificationCode: string;
  role?: "student" | "faculty";
  dataPrivacyAccepted: boolean;
}) {
  return authRequest<{ token: string; user: UserProfile; message: string }>("register", payload);
}

export async function loginUser(email: string, password: string) {
  return authRequest<{ token: string; user: UserProfile; message: string }>("login", {
    email,
    password,
  });
}

export async function fetchProfile(token: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), authRequestTimeoutMs);

  try {
    const response = await fetch("/api/user/profile", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(extractErrorMessage(payload) || "Failed to load profile.");
    }

    return payload as { profile: UserProfile };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Profile request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function updateProfile(
  token: string,
  payload: Partial<
    Pick<
      UserProfile,
      | "firstName"
      | "lastName"
      | "photoUrl"
      | "bannerUrl"
      | "course"
      | "school"
      | "organizationPart"
      | "organizationRole"
      | "rfidNumber"
    >
  >,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), authRequestTimeoutMs);

  try {
    const response = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(extractErrorMessage(result) || "Failed to update profile.");
    }

    return result as { profile: UserProfile; message: string };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Profile update timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function changePassword(
  token: string,
  payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), authRequestTimeoutMs);

  try {
    const response = await fetch("/api/user/profile/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(extractErrorMessage(result) || "Failed to change password.");
    }

    return result as { message: string };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Password change timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function saveAuthSession(token: string, user: UserProfile) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(authStorageKey, JSON.stringify({ token, user }));
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(authStorageKey);
}

export function readAuthSession(): { token: string; user: UserProfile } | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(authStorageKey);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as { token: string; user: UserProfile };
  } catch {
    return null;
  }
}

export function syncProfileToLegacyStorage(profile: UserProfile) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem("dcspaceFirstName", profile.firstName || "");
  window.localStorage.setItem("dcspaceLastName", profile.lastName || "");
  window.localStorage.setItem("dcspaceStudentNumber", profile.studentNumber || "");
  window.localStorage.setItem("dcspaceStudentEmail", profile.email || "");
  window.localStorage.setItem("dcspaceCourse", profile.course || "");
  window.localStorage.setItem("dcspaceSchool", profile.school || "");
  window.localStorage.setItem("dcspaceOrganizationPart", profile.organizationPart || "");
  window.localStorage.setItem("dcspaceOrganizationRole", profile.organizationRole || "");
  window.localStorage.setItem("dcspaceRfidNumber", profile.rfidNumber || "");
  if (profile.role) {
    window.localStorage.setItem(
      "dcspaceAccountType",
      profile.role.toLowerCase() === "faculty" ? "faculty" : "student",
    );
  }
  window.sessionStorage.setItem("dcspaceLoggedIn", "true");
  window.sessionStorage.setItem(
    "dcspaceCurrentUser",
    JSON.stringify({
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: profile.fullName,
      studentNumber: profile.studentNumber,
      role: profile.role,
      organizationRole: profile.organizationRole || "",
      organizationPart: profile.organizationPart || "",
    }),
  );

  window.dispatchEvent(new CustomEvent("dcspace-profile-updated"));

  void import("@/lib/profile-images").then((mod) => {
    mod.cacheAccountImages(profile);
  });
}

export function readRegistrationDraft(): RegistrationDraft {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const sessionRaw = window.sessionStorage.getItem(registrationDraftKey);
    if (sessionRaw) {
      return JSON.parse(sessionRaw) as RegistrationDraft;
    }
    const localRaw = window.localStorage.getItem(registrationDraftKey);
    return localRaw ? (JSON.parse(localRaw) as RegistrationDraft) : {};
  } catch {
    return {};
  }
}

export function writeRegistrationDraft(patch: RegistrationDraft) {
  if (typeof window === "undefined") {
    return;
  }
  const next = { ...readRegistrationDraft(), ...patch };
  const raw = JSON.stringify(next);
  window.sessionStorage.setItem(registrationDraftKey, raw);
  try {
    window.localStorage.setItem(registrationDraftKey, raw);
  } catch {
    /* ignore quota */
  }
}

export function clearRegistrationDraft() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(registrationDraftKey);
  window.localStorage.removeItem(registrationDraftKey);
}
