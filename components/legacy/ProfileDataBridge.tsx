"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  applyAvatarToDom,
  applyBannerToDom,
  getProfileInfoStorageKey,
  safeSetLocalStorage,
} from "@/lib/profile-images";
import { readAuthSession, saveAuthSession, syncProfileToLegacyStorage, type UserProfile } from "@/lib/user-api";

type AttendanceRow = {
  eventTitle?: string;
  action?: string;
  createdAt?: string;
};

type CertificateRow = {
  eventName?: string;
  createdAt?: string;
  dateIssued?: string;
};

type FeedbackRow = {
  title?: string;
  eventName?: string;
  createdAt?: string;
};

function setInputValue(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) return;
  input.value = value;
  input.setAttribute("value", value);
}

function setText(selector: string, value: string) {
  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.textContent = value;
  });
}

function setStatValue(label: string, value: number) {
  document.querySelectorAll<HTMLLIElement>(".stat-list li").forEach((item) => {
    const labelEl = item.querySelector("span");
    const valueEl = item.querySelector(".stat-list__value");
    if (!labelEl || !valueEl) return;
    if ((labelEl.textContent || "").trim().toLowerCase() !== label.toLowerCase()) return;
    valueEl.textContent = String(value);
  });
}

function setRecentActivity(items: string[]) {
  const list = document.querySelector(".activity-list");
  if (!list) return;
  list.innerHTML = "";
  const values = items.length ? items : ["No recent activity yet."];
  values.slice(0, 4).forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  });
}

function buildActivityFeed(input: {
  attendance: AttendanceRow[];
  certificates: CertificateRow[];
  feedback: FeedbackRow[];
}) {
  const feed = [
    ...input.attendance.map((row) => ({
      at: row.createdAt || "",
      text: `${row.action === "out" ? "Tapped out from" : "Tapped into"} ${
        row.eventTitle || "an event"
      }`,
    })),
    ...input.certificates.map((row) => ({
      at: row.createdAt || row.dateIssued || "",
      text: `Received certificate for ${row.eventName || "an event"}`,
    })),
    ...input.feedback.map((row) => ({
      at: row.createdAt || "",
      text: `Submitted feedback for ${row.eventName || row.title || "an event"}`,
    })),
  ];

  return feed
    .filter((item) => item.at || item.text)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((item) => item.text);
}

function applyProfile(profile: UserProfile) {
  const displayName = profile.fullName || `${profile.firstName} ${profile.lastName}`.trim();
  setText(".main__user-name", displayName || profile.email);
  setInputValue("#profile-name", displayName);
  setInputValue("#profile-email", profile.email || "");
  setInputValue("#profile-student-number", profile.studentNumber || "");
  setInputValue("#profile-course", profile.course || "");
  setInputValue("#profile-department", profile.school || "");
  setInputValue("#profile-organization", profile.organizationPart || "None");
  setInputValue("#profile-org-role", profile.organizationRole || "None");
  setInputValue("#profile-org-position", profile.role || "Student");
  setText(
    "#profile-about-title",
    `About ${profile.firstName?.trim() || displayName.split(/\s+/)[0] || "Student"}`,
  );
  applyAvatarToDom(profile.photoUrl || "");
  applyBannerToDom(profile.bannerUrl || "");

  const info = {
    name: displayName,
    email: profile.email || "",
    studentNumber: profile.studentNumber || "",
    course: profile.course || "",
    department: profile.school || "",
    organization: profile.organizationPart || "None",
    orgRole: profile.organizationRole || "None",
    orgPosition: profile.role || "Student",
  };
  safeSetLocalStorage(getProfileInfoStorageKey(profile.id || profile.email), JSON.stringify(info));
  syncProfileToLegacyStorage(profile);
}

export function ProfileDataBridge() {
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const profileRes = await fetch("/api/user/profile", {
          cache: "no-store",
          headers: (() => {
            const session = readAuthSession();
            return session?.token ? { Authorization: `Bearer ${session.token}` } : undefined;
          })(),
        });
        if (!profileRes.ok || cancelled) return;

        const { profile } = (await profileRes.json()) as { profile: UserProfile };
        if (cancelled) return;
        applyProfile(profile);

        const authSession = readAuthSession();
        if (authSession?.token) {
          saveAuthSession(authSession.token, profile);
        }

        const [attendanceRes, certificatesRes, feedbackRes] = await Promise.all([
          fetch("/api/user/attendance", { cache: "no-store" }),
          fetch("/api/user/certificates", { cache: "no-store" }),
          fetch("/api/user/feedback?mine=1", { cache: "no-store" }),
        ]);

        if (cancelled) return;

        const attendance = attendanceRes.ok
          ? ((await attendanceRes.json()) as { attendance?: AttendanceRow[] }).attendance || []
          : [];
        const certificates = certificatesRes.ok
          ? ((await certificatesRes.json()) as { certificates?: CertificateRow[] }).certificates || []
          : [];
        const feedback = feedbackRes.ok
          ? ((await feedbackRes.json()) as { feedback?: FeedbackRow[] }).feedback || []
          : [];

        setStatValue("Events Attended", new Set(attendance.map((row) => row.eventTitle || "").filter(Boolean)).size);
        setStatValue("Certificates Earned", certificates.length);
        setStatValue("Feedback Submitted", feedback.length);
        setRecentActivity(buildActivityFeed({ attendance, certificates, feedback }));

        wireProfileSave();
      } catch {
        const session = readAuthSession();
        if (session?.user) {
          applyProfile(session.user);
          wireProfileSave();
        } else if (user?.name) {
          setText(".main__user-name", user.name);
          setInputValue("#profile-name", user.name);
          setInputValue("#profile-org-position", user.role || "Student");
        }
      }
    };

    const authHeaders = () => {
      const session = readAuthSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.token) headers.Authorization = `Bearer ${session.token}`;
      return headers;
    };

    const persistProfile = async (extra: Record<string, string> = {}) => {
      const name = (document.getElementById("profile-name") as HTMLInputElement | null)?.value || "";
      const course = (document.getElementById("profile-course") as HTMLInputElement | null)?.value || "";
      const school = (document.getElementById("profile-department") as HTMLInputElement | null)?.value || "";
      const organizationPart =
        (document.getElementById("profile-organization") as HTMLInputElement | null)?.value || "";
      const organizationRole =
        (document.getElementById("profile-org-role") as HTMLInputElement | null)?.value || "";
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          fullName: name,
          course,
          school,
          organizationPart: organizationPart === "None" ? "" : organizationPart,
          organizationRole: organizationRole === "None" ? "" : organizationRole,
          ...extra,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save profile.");
      if (data.profile) {
        applyProfile(data.profile);
        const session = readAuthSession();
        if (session?.token) saveAuthSession(session.token, data.profile);
      }
    };

    const wireProfileSave = () => {
      const saveBtn = document.getElementById("save-profile-btn");
      if (saveBtn && saveBtn.dataset.dcWired !== "1") {
        saveBtn.dataset.dcWired = "1";
        saveBtn.addEventListener("click", () => {
          window.setTimeout(() => {
            if ((saveBtn.textContent || "").trim().toLowerCase() !== "edit") return;
            void persistProfile().catch((error) => {
              window.alert(error instanceof Error ? error.message : "Failed to save profile.");
            });
          }, 0);
        });
      }

      const avatarInput = document.getElementById("avatar-photo-input") as HTMLInputElement | null;
      if (avatarInput && avatarInput.dataset.dcWired !== "1") {
        avatarInput.dataset.dcWired = "1";
        avatarInput.addEventListener("change", () => {
          window.setTimeout(() => {
            const photoUrl = document.getElementById("profile-avatar")?.style.backgroundImage || "";
            const match = photoUrl.match(/url\(["']?(.*?)["']?\)/);
            if (match?.[1]) {
              void persistProfile({ photoUrl: match[1] }).catch(() => undefined);
            }
          }, 250);
        });
      }

      const bannerInput = document.getElementById("banner-photo-input") as HTMLInputElement | null;
      if (bannerInput && bannerInput.dataset.dcWired !== "1") {
        bannerInput.dataset.dcWired = "1";
        bannerInput.addEventListener("change", () => {
          window.setTimeout(() => {
            const bannerUrl = document.getElementById("profile-banner")?.style.backgroundImage || "";
            const match = bannerUrl.match(/url\(["']?(.*?)["']?\)/);
            if (match?.[1]) {
              void persistProfile({ bannerUrl: match[1] }).catch(() => undefined);
            }
          }, 250);
        });
      }
    };

    const t1 = window.setTimeout(run, 120);
    const t2 = window.setTimeout(run, 500);
    const onProfileUpdated = () => {
      void run();
    };
    window.addEventListener("dcspace-profile-updated", onProfileUpdated);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("dcspace-profile-updated", onProfileUpdated);
    };
  }, [user]);

  return null;
}
