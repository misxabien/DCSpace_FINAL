"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  formatEventDateParts,
  type OrganizedEvent,
} from "@/components/organized/OrganizedShell";
import { authFetch } from "@/lib/user-api";
import styles from "@/components/organized/CreateEvent.module.css";
import detailStyles from "@/components/organized/OrganizedDetail.module.css";

const DEFAULT_REVIEW_IMAGE =
  "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=480&fit=crop&q=80";

const STEPS = [
  "Event Details",
  "Attendance Setup",
  "Requirements & Files",
  "Review & Submit",
] as const;

const TOAST_DURATION_MS = 4500;

type MissingField = {
  label: string;
  focusId: string;
  step: number;
};

type Visibility = "everyone" | "organizers";

function RequiredMark() {
  return (
    <span className={styles.requiredMark} aria-hidden="true">
      *
    </span>
  );
}

function readFileAsBase64(file: File) {
  return new Promise<{ name: string; mimeType: string; base64: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        base64: result.includes(",") ? result.split(",")[1] || "" : result,
      });
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

const COURSE_OPTIONS = [
  "BSA",
  "BSAIS",
  "BS PSYCH",
  "BEED",
  "BSED",
  "BSIT",
  "BMMA",
  "BA COMM",
  "BSBA",
  "BSBA-FM",
  "BSBA-MM",
  "BSBA-HRDM",
  "BSBA-OM",
  "BSTM",
  "BSHM",
  "BSHM-CLO",
  "BSHM-CAKO",
  "BSN",
  "BSPT",
  "BSRT",
  "BS PHARM",
  "BSMLS",
  "BS BIO",
] as const;

const ALL_COURSE_OPTION = "ALL PROGRAM";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function FilePlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 11v6M9 14h6" />
    </svg>
  );
}

const PROGRESS_VIEWBOX_WIDTH = 1306;
const STEP_NODE_CENTERS = [22.8455, 437.871, 860.513, 1283.15];

function ProgressMeter({ currentStep }: { currentStep: number }) {
  const active = "#448AFF";
  const inactive = "#F5D29D";
  const track = "#604D18";

  const centers = STEP_NODE_CENTERS;
  const segments = [
    { x1: 33.4609, x2: 427.257 },
    { x1: 452.295, x2: 846.091 },
    { x1: 878.744, x2: 1272.54 },
  ];

  // Partial fill on the active segment (matches Figma midpoint on step 0)
  const progressEndX =
    currentStep <= 0
      ? 244.493
      : currentStep === 1
        ? 649.193
        : currentStep === 2
          ? 1075.642
          : 1272.54;

  return (
    <div className={styles.stepper}>
      <svg
        className={styles.progressSvg}
        width="1306"
        height="43"
        viewBox="0 0 1306 43"
        fill="none"
        aria-hidden="true"
      >
        {segments.map((segment) => (
          <line
            key={`track-${segment.x1}`}
            x1={segment.x1}
            y1="22.0117"
            x2={segment.x2}
            y2="22.0117"
            stroke={track}
            strokeWidth="6"
            strokeLinecap="round"
          />
        ))}

        <line
          x1="33.4609"
          y1="22.0117"
          x2={progressEndX}
          y2="22.0117"
          stroke={active}
          strokeWidth="6"
          strokeLinecap="round"
        />

        {centers.map((cx, index) => {
          const filled = index <= currentStep;
          return (
            <g key={cx}>
              <ellipse
                cx={cx}
                cy="21.4375"
                rx="22.8455"
                ry="21.4375"
                fill={filled ? active : inactive}
              />
              <ellipse
                cx={cx}
                cy="21.4388"
                rx="7.61516"
                ry="7.14583"
                fill="white"
              />
            </g>
          );
        })}
      </svg>

      <div className={styles.stepLabels} aria-label="Create event progress">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`${styles.stepLabel}${index === currentStep ? ` ${styles.stepLabelActive}` : ""}`}
            style={{
              left: `${(STEP_NODE_CENTERS[index] / PROGRESS_VIEWBOX_WIDTH) * 100}%`,
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CreateEventView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get("id") || "";
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const programInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<{
    id: number;
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigateAfterToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAiBanner, setShowAiBanner] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiError, setAiError] = useState("");
  const [saving, setSaving] = useState(false);

  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("");
  const [description, setDescription] = useState("");
  const [bannerName, setBannerName] = useState("");
  const [bannerPreview, setBannerPreview] = useState("");
  const [bannerBase64, setBannerBase64] = useState("");
  const [bannerMime, setBannerMime] = useState("");
  const [status, setStatus] = useState<OrganizedEvent["status"] | "">("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venue, setVenue] = useState("");
  const [venueType, setVenueType] = useState("");

  const [announcements, setAnnouncements] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("everyone");
  const [activityDraft, setActivityDraft] = useState("");
  const [activities, setActivities] = useState<string[]>([]);

  const [minAttendance, setMinAttendance] = useState("");
  const [gracePeriod, setGracePeriod] = useState("");
  const [attendSelect, setAttendSelect] = useState("");
  const [attendTags, setAttendTags] = useState<string[]>([]);
  const [collaboration, setCollaboration] = useState<"yes" | "no">("no");
  const [collabSelect, setCollabSelect] = useState("");
  const [collabTags, setCollabTags] = useState<string[]>([]);
  const [hasSpeakers, setHasSpeakers] = useState<"yes" | "no">("no");
  const [speakerDraft, setSpeakerDraft] = useState("");
  const [speakers, setSpeakers] = useState<string[]>([]);

  const conceptPaperRef = useRef<HTMLInputElement>(null);
  const certificateRef = useRef<HTMLInputElement>(null);
  const [conceptPaperName, setConceptPaperName] = useState("");
  const [conceptPaperBase64, setConceptPaperBase64] = useState("");
  const [conceptPaperMimeType, setConceptPaperMimeType] = useState("");
  const [hasExistingConceptPaper, setHasExistingConceptPaper] = useState(false);
  const [certificateName, setCertificateName] = useState("");
  const [certificateTemplateBase64, setCertificateTemplateBase64] = useState("");
  const [certificateTemplateMimeType, setCertificateTemplateMimeType] = useState("");
  const [eCertificateEnabled, setECertificateEnabled] = useState(true);
  const [hasExistingCertificate, setHasExistingCertificate] = useState(false);
  const [programFileName, setProgramFileName] = useState("");
  const [programFileBase64, setProgramFileBase64] = useState("");
  const [programFileMimeType, setProgramFileMimeType] = useState("");
  const [hasExistingProgramFile, setHasExistingProgramFile] = useState(false);
  const [filesRequired, setFilesRequired] = useState<"yes" | "no">("yes");
  const [requiredFileDraft, setRequiredFileDraft] = useState("");
  const [requiredFiles, setRequiredFiles] = useState<string[]>([]);
  const [photoSharing, setPhotoSharing] = useState<"yes" | "organizers">("yes");

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    const load = async () => {
      const res = await authFetch(`/api/events/${encodeURIComponent(editingId)}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const payload = (await res.json()) as {
        event?: {
          title?: string;
          description?: string;
          category?: string;
          location?: string;
          startsAt?: string;
          endsAt?: string;
          attendanceRequired?: string;
          gracePeriod?: string;
          venueType?: string;
          announcements?: string;
          allowedCourses?: string[];
          requiredFiles?: string[];
          speakers?: string[];
          collaboratingDepartments?: string[];
          programActivities?: string[];
          posterImage?: string;
          conceptPaperName?: string;
          hasConceptPaper?: boolean;
          certificateTemplateName?: string;
          hasCertificateTemplate?: boolean;
          programFileName?: string;
          hasProgramFile?: boolean;
          programFileVisibility?: "everyone" | "organizers";
        };
      };
      const event = payload.event;
      if (!event || cancelled) return;
      setEventName(event.title || "");
      setEventType(event.category || "");
      setDescription(event.description || "");
      setVenue(event.location || "");
      setVenueType(event.venueType || "");
      setAnnouncements(event.announcements || "");
      setMinAttendance(event.attendanceRequired || "");
      setGracePeriod(event.gracePeriod || "");
      setAttendTags(Array.isArray(event.allowedCourses) ? event.allowedCourses : []);
      setRequiredFiles(Array.isArray(event.requiredFiles) ? event.requiredFiles : []);
      setFilesRequired(event.requiredFiles && event.requiredFiles.length ? "yes" : "no");
      setSpeakers(Array.isArray(event.speakers) ? event.speakers : []);
      setHasSpeakers(event.speakers && event.speakers.length ? "yes" : "no");
      setCollabTags(Array.isArray(event.collaboratingDepartments) ? event.collaboratingDepartments : []);
      setCollaboration(
        event.collaboratingDepartments && event.collaboratingDepartments.length ? "yes" : "no",
      );
      setActivities(Array.isArray(event.programActivities) ? event.programActivities : []);
      if (event.conceptPaperName || event.hasConceptPaper) {
        setConceptPaperName(event.conceptPaperName || "Uploaded concept paper");
        setHasExistingConceptPaper(Boolean(event.hasConceptPaper));
      }
      if (event.certificateTemplateName || event.hasCertificateTemplate) {
        setCertificateName(event.certificateTemplateName || "Uploaded e-certificate");
        setECertificateEnabled(true);
        setHasExistingCertificate(Boolean(event.hasCertificateTemplate));
      }
      if (event.programFileName || event.hasProgramFile) {
        setProgramFileName(event.programFileName || "Uploaded program flow");
        setHasExistingProgramFile(Boolean(event.hasProgramFile));
      }
      if (event.programFileVisibility === "organizers" || event.programFileVisibility === "everyone") {
        setVisibility(event.programFileVisibility);
      }
      if (event.startsAt) {
        const start = new Date(event.startsAt);
        if (!Number.isNaN(start.getTime())) {
          setStartDate(start.toISOString().slice(0, 10));
          setStartTime(start.toISOString().slice(11, 16));
        }
      }
      if (event.endsAt) {
        const end = new Date(event.endsAt);
        if (!Number.isNaN(end.getTime())) {
          setEndDate(end.toISOString().slice(0, 10));
          setEndTime(end.toISOString().slice(11, 16));
        }
      }
      if (event.posterImage) {
        setBannerPreview(event.posterImage);
        setBannerBase64(event.posterImage.includes(",") ? event.posterImage.split(",")[1] : event.posterImage);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  const removeTag = (tag: string, list: string[], setList: (next: string[]) => void) => {
    setList(list.filter((item) => item !== tag));
  };

  const addSpeaker = () => {
    const value = speakerDraft.trim();
    if (!value) return;
    setSpeakers((current) => [...current, value]);
    setSpeakerDraft("");
  };

  const addRequiredFile = () => {
    const value = requiredFileDraft.trim();
    if (!value) return;
    setRequiredFiles((current) => [...current, value]);
    setRequiredFileDraft("");
  };

  const validateDetails = (): MissingField[] => {
    const missing: MissingField[] = [];
    if (!eventName.trim()) missing.push({ label: "Event Name", focusId: "event-name", step: 0 });
    if (!eventType.trim()) missing.push({ label: "Event Type", focusId: "event-type", step: 0 });
    if (!description.trim()) {
      missing.push({ label: "Event Description", focusId: "event-description", step: 0 });
    }
    if (!bannerBase64 && !bannerPreview) {
      missing.push({ label: "Event Banner", focusId: "event-banner-upload", step: 0 });
    }
    if (!startDate || !endDate) {
      missing.push({
        label: "Start & End Date",
        focusId: !startDate ? "start-date" : "end-date",
        step: 0,
      });
    }
    if (!startTime || !endTime) {
      missing.push({
        label: "Start & End Time",
        focusId: !startTime ? "start-time" : "end-time",
        step: 0,
      });
    }
    if (!venue.trim()) missing.push({ label: "Venue", focusId: "venue", step: 0 });
    if (!venueType) missing.push({ label: "Venue Type", focusId: "venue-type", step: 0 });
    if (!activities.length && !programFileBase64 && !hasExistingProgramFile) {
      missing.push({ label: "Event Program Flow", focusId: "activity-name", step: 0 });
    }
    return missing;
  };

  const validateAttendance = (
    nextAttendTags = attendTags,
    nextCollabTags = collabTags,
    nextSpeakers = speakers,
  ): MissingField[] => {
    const missing: MissingField[] = [];
    if (!minAttendance.trim()) {
      missing.push({
        label: "Minimum Attendance Time Required",
        focusId: "min-attendance",
        step: 1,
      });
    }
    if (!gracePeriod.trim()) {
      missing.push({ label: "Grace Period", focusId: "grace-period", step: 1 });
    }
    if (!nextAttendTags.length) {
      missing.push({
        label: "Who can attend this Event",
        focusId: "attend-select",
        step: 1,
      });
    }
    if (collaboration === "yes" && !nextCollabTags.length) {
      missing.push({
        label: "Collaborating organization/course",
        focusId: "collab-select",
        step: 1,
      });
    }
    if (hasSpeakers === "yes" && nextSpeakers.length === 0) {
      missing.push({ label: "Speaker name", focusId: "speaker-name", step: 1 });
    }
    return missing;
  };

  const validateRequirements = (): MissingField[] => {
    const missing: MissingField[] = [];
    if (!conceptPaperBase64 && !hasExistingConceptPaper) {
      missing.push({
        label: "Approved Concept Paper",
        focusId: "concept-paper-choose",
        step: 2,
      });
    }
    if (eCertificateEnabled && !certificateTemplateBase64 && !hasExistingCertificate) {
      missing.push({
        label: "E-Certificate Template",
        focusId: "certificate-choose",
        step: 2,
      });
    }
    if (filesRequired === "yes" && requiredFiles.length === 0 && !requiredFileDraft.trim()) {
      missing.push({
        label: "Required file name",
        focusId: "required-file-name",
        step: 2,
      });
    }
    return missing;
  };

  const formatMissingToast = (missing: MissingField[], requiredCount: number) => {
    if (!missing.length) return "";
    if (missing.length >= requiredCount) {
      return "Please answer all fields.";
    }
    const labels = missing.map((field) => field.label);
    if (labels.length === 1) {
      return `Please complete the required field: ${labels[0]}.`;
    }
    return `Please complete the required fields: ${labels.join(", ")}.`;
  };

  const showToast = (
    message: string,
    tone: "error" | "success" = "error",
    options?: { durationMs?: number },
  ) => {
    if (!message) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, options?.durationMs ?? TOAST_DURATION_MS);
  };

  const focusMissingField = (field: MissingField | undefined) => {
    if (!field) return;
    const goToField = () => {
      const el = document.getElementById(field.focusId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLButtonElement
      ) {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }
    };

    if (field.step !== step) {
      setStep(field.step);
      window.setTimeout(goToField, 120);
      return;
    }
    goToField();
  };

  const failValidation = (missing: MissingField[], requiredCount: number) => {
    showToast(formatMissingToast(missing, requiredCount), "error");
    focusMissingField(missing[0]);
  };

  const detailsRequiredCount = 9;
  const attendanceRequiredCount =
    3 + (collaboration === "yes" ? 1 : 0) + (hasSpeakers === "yes" ? 1 : 0);
  const requirementsRequiredCount =
    1 + (eCertificateEnabled ? 1 : 0) + (filesRequired === "yes" ? 1 : 0);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (navigateAfterToastRef.current) clearTimeout(navigateAfterToastRef.current);
    };
  }, []);

  const addActivity = () => {
    const value = activityDraft.trim();
    if (!value) return;
    setActivities((current) => [...current, value]);
    setActivityDraft("");
  };

  const suggestProgramFlow = async () => {
    if (!eventName.trim()) {
      setAiError("Enter an event name first so AI can suggest a program flow.");
      return;
    }
    setAiLoading(true);
    setAiError("");
    setAiNote("");
    try {
      const res = await fetch("/api/ai/program-flow", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: eventName.trim(),
          eventType,
          venue,
          venueType,
          startDate,
          endDate,
          startTime,
          endTime,
          courses: attendTags,
          description,
          announcements,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        notes?: string;
        activities?: unknown;
        pdf?: { fileName?: string; mimeType?: string; base64?: string };
      };
      if (!res.ok) {
        throw new Error(payload.error || payload.details || "Could not generate suggestions.");
      }
      const next = Array.isArray(payload.activities)
        ? payload.activities.map((item: unknown) => String(item).trim()).filter(Boolean)
        : [];
      if (!next.length) throw new Error("No activities were returned.");
      setActivities(next);

      if (payload.pdf?.base64) {
        setProgramFileName(payload.pdf.fileName || `${eventName.trim()}-program-flow.pdf`);
        setProgramFileMimeType(payload.pdf.mimeType || "application/pdf");
        setProgramFileBase64(payload.pdf.base64);
        setHasExistingProgramFile(false);
      }

      setAiNote(
        payload.pdf?.base64
          ? `${payload.notes || "Timed program flow generated."} A PDF with suggested times was attached.`
          : String(payload.notes || "Suggestions added to the program flow."),
      );
      document.getElementById("event-program-flow")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Could not generate suggestions.");
    } finally {
      setAiLoading(false);
    }
  };

  const saveEvent = async () => {
    if (saving) return;

    const missing = [
      ...validateDetails(),
      ...validateAttendance(),
      ...validateRequirements(),
    ];
    if (missing.length) {
      failValidation(
        missing,
        detailsRequiredCount + attendanceRequiredCount + requirementsRequiredCount,
      );
      return;
    }

    setSaving(true);

    const next: OrganizedEvent = {
      id: editingId || `evt-${Date.now()}`,
      title: eventName.trim(),
      date: startDate,
      venue: venue.trim() || "Event Venue",
      time:
        startTime && endTime
          ? `${formatTimeDisplay(startTime)} - ${formatTimeDisplay(endTime)}`
          : "Event Time",
      status: status || "draft",
      submissions: 0,
      reviewNote: "Pending for approval",
    };

    const payload: Record<string, unknown> = {
      title: next.title,
      description: description.trim(),
      category: eventType.trim() || "organization",
      location: next.venue,
      startsAt: startDate ? `${startDate}T${startTime || "00:00"}` : "",
      endsAt: endDate ? `${endDate}T${endTime || "23:59"}` : "",
      attendanceRequired: minAttendance.trim(),
      gracePeriod: gracePeriod.trim(),
      venueType: venueType.trim(),
      announcements: announcements.trim(),
      allowedCourses: attendTags,
      speakers,
      collaboratingDepartments: collaboration === "yes" ? collabTags : [],
      audienceSchools: collaboration === "yes" ? collabTags : [],
      programActivities: activities,
      requiredFiles: filesRequired === "yes" ? requiredFiles : [],
      posterImageBase64: bannerBase64.startsWith("data:")
        ? bannerBase64
        : bannerBase64
          ? `data:${bannerMime || "image/jpeg"};base64,${bannerBase64}`
          : "",
      posterImageMimeType: bannerMime,
      programFileVisibility: visibility,
      status: "pending" as const,
    };

    if (conceptPaperBase64) {
      payload.conceptPaperName = conceptPaperName;
      payload.conceptPaperMimeType = conceptPaperMimeType;
      payload.conceptPaperBase64 = conceptPaperBase64;
    }

    if (eCertificateEnabled) {
      if (certificateTemplateBase64) {
        payload.certificateTemplateName = certificateName;
        payload.certificateTemplateMimeType = certificateTemplateMimeType;
        payload.certificateTemplateBase64 = certificateTemplateBase64;
      }
    } else {
      payload.certificateTemplateName = "";
      payload.certificateTemplateMimeType = "";
      payload.certificateTemplateBase64 = "";
    }

    if (programFileBase64) {
      payload.programFileName = programFileName;
      payload.programFileMimeType = programFileMimeType;
      payload.programFileBase64 = programFileBase64;
    }

    const endpoint = editingId ? `/api/events/${encodeURIComponent(editingId)}` : "/api/events";
    try {
      const res = await authFetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        event?: { id?: string };
      };
      if (!res.ok) {
        throw new Error(data.error || "Failed to save event to the server.");
      }

      window.dispatchEvent(new Event("dc-organized-changed"));
      showToast(
        editingId ? "Event updated successfully." : "Event created successfully.",
        "success",
        { durationMs: 1800 },
      );
      if (navigateAfterToastRef.current) clearTimeout(navigateAfterToastRef.current);
      navigateAfterToastRef.current = setTimeout(() => {
        navigateAfterToastRef.current = null;
        router.push("/organized");
      }, 1400);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save event.";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const reviewTime =
    startTime && endTime
      ? `${formatTimeDisplay(startTime)} - ${formatTimeDisplay(endTime)}`
      : "Event Time";
  const dateParts = formatEventDateParts(startDate);
  const announcementParagraphs = announcements.trim()
    ? announcements.split(/\n+/).filter(Boolean)
    : ["No announcements yet."];
  const descriptionParagraphs = description.trim()
    ? description.split(/\n+/).filter(Boolean)
    : ["No description provided."];
  const hostedCourse = attendTags.length ? attendTags.join(", ") : "Course";
  const hostedOrganization =
    collaboration === "yes" && collabTags.length ? collabTags.join(", ") : "Organization Name";
  const requiredFilesLabel =
    filesRequired === "yes"
      ? requiredFiles.length
        ? requiredFiles.join(", ")
        : "Parent's Consent Form"
      : "None";

  const onContinue = (event: FormEvent) => {
    event.preventDefault();

    if (step === 0) {
      const missing = validateDetails();
      if (missing.length) {
        failValidation(missing, detailsRequiredCount);
        return;
      }
      showToast("Saved successfully.", "success");
      setStep(1);
      return;
    }

    if (step === 1) {
      const nextAttendTags =
        attendSelect && !attendTags.includes(attendSelect)
          ? [...attendTags, attendSelect]
          : attendTags;
      const nextCollabTags =
        collaboration === "yes" && collabSelect && !collabTags.includes(collabSelect)
          ? [...collabTags, collabSelect]
          : collabTags;
      const nextSpeakers =
        hasSpeakers === "yes" && speakerDraft.trim()
          ? [...speakers, speakerDraft.trim()]
          : speakers;

      if (nextAttendTags !== attendTags) setAttendTags(nextAttendTags);
      if (nextCollabTags !== collabTags) setCollabTags(nextCollabTags);
      if (nextSpeakers !== speakers) {
        setSpeakers(nextSpeakers);
        setSpeakerDraft("");
      }

      const missing = validateAttendance(nextAttendTags, nextCollabTags, nextSpeakers);
      if (missing.length) {
        failValidation(missing, attendanceRequiredCount);
        return;
      }
      showToast("Saved successfully.", "success");
      setStep(2);
      return;
    }

    if (step === 2) {
      const missing = validateRequirements();
      if (missing.length) {
        failValidation(missing, requirementsRequiredCount);
        return;
      }
      if (filesRequired === "yes" && requiredFileDraft.trim()) {
        setRequiredFiles((current) => [...current, requiredFileDraft.trim()]);
        setRequiredFileDraft("");
      }
      showToast("Saved successfully.", "success");
      setStep(3);
      return;
    }

    if (step < STEPS.length - 1) {
      setStep((current) => current + 1);
      return;
    }

    void saveEvent();
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.subtitle}>Create an Event with DC Space</h2>

      {toast ? (
        <div
          key={toast.id}
          className={`${styles.toast}${toast.tone === "success" ? ` ${styles.toastSuccess}` : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className={styles.toastIcon} aria-hidden="true">
            {toast.tone === "success" ? "✓" : "!"}
          </span>
          <p className={styles.toastMessage}>{toast.message}</p>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Dismiss notification"
            onClick={() => {
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              toastTimerRef.current = null;
              setToast(null);
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      <ProgressMeter currentStep={step} />

      <form onSubmit={onContinue}>
        {step === 0 ? (
          <>
            <section className={styles.section} aria-labelledby="basic-info">
              <h3 className={styles.sectionTitle} id="basic-info">
                Basic Info
              </h3>
              <div className={styles.card}>
                <div className={styles.stack}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="event-name">
                      Event Name<RequiredMark />
                    </label>
                    <input
                      id="event-name"
                      className={styles.input}
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="event-type">
                      Event Type<RequiredMark />
                    </label>
                    <input
                      id="event-type"
                      className={styles.input}
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      placeholder="Seminar / Outreach / Party"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="event-description">
                      Event Description<RequiredMark />
                    </label>
                    <textarea
                      id="event-description"
                      className={styles.textarea}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className={styles.bannerRow}>
                    <div>
                      <span className={styles.fieldLabel}>Event Banner<RequiredMark /></span>
                      <span className={styles.hint}>
                        Files must be in acceptable format, such as PNG, JPEG, PDF, or similar
                        supported types.
                      </span>
                      {bannerName ? (
                        <span className={styles.hint}>Selected: {bannerName}</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      id="event-banner-upload"
                      className={styles.iconBtn}
                      aria-label="Upload event banner"
                      onClick={() => bannerInputRef.current?.click()}
                    >
                      <FilePlusIcon />
                    </button>
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      className={styles.hiddenFile}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setBannerName(file.name);
                          if (file.type.startsWith("image/")) {
                            setBannerPreview(URL.createObjectURL(file));
                            setBannerMime(file.type);
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result !== "string") return;
                              setBannerBase64(reader.result);
                            };
                            reader.readAsDataURL(file);
                          }
                        }
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <div className={styles.row}>
                    <label className={styles.fieldLabel} htmlFor="event-status">
                      Event Status
                    </label>
                    <div className={styles.rowEnd}>
                      <select
                        id="event-status"
                        className={styles.selectCompact}
                        value={status}
                        onChange={(e) => setStatus(e.target.value as OrganizedEvent["status"] | "")}
                      >
                        <option value="">Select</option>
                        <option value="draft">Draft</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="schedule-venue">
              <h3 className={styles.sectionTitle} id="schedule-venue">
                Schedule &amp; Venue
              </h3>
              <div className={styles.card}>
                <div className={styles.stack}>
                  <div className={styles.row}>
                    <span className={styles.fieldLabel}>Start &amp; End Date<RequiredMark /></span>
                    <div className={styles.rowEnd}>
                      <div className={styles.dateField}>
                        <span className={styles.dateIcon}>
                          <CalendarIcon />
                        </span>
                        <input
                          id="start-date"
                          className={styles.dateInput}
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            const nextStart = e.target.value;
                            setStartDate(nextStart);
                            // Clear end only if it becomes before start
                            if (endDate && nextStart && endDate < nextStart) {
                              setEndDate("");
                            }
                          }}
                          aria-label="Start date"
                        />
                      </div>
                      <span className={styles.rangeSep} aria-hidden="true">
                        →
                      </span>
                      <div className={styles.dateField}>
                        <input
                          id="end-date"
                          className={styles.dateInput}
                          type="date"
                          value={endDate}
                          min={startDate || undefined}
                          onFocus={() => {
                            // Seed start date so the calendar opens on that day (same-day events allowed).
                            if (!endDate && startDate) {
                              setEndDate(startDate);
                            }
                          }}
                          onChange={(e) => setEndDate(e.target.value)}
                          aria-label="End date"
                        />
                      </div>
                    </div>
                  </div>

                  <div className={styles.row}>
                    <span className={styles.fieldLabel}>Start &amp; End Time<RequiredMark /></span>
                    <div className={styles.rowEnd}>
                      <div className={styles.timeField}>
                        <span className={styles.timeIcon}>
                          <ClockIcon />
                        </span>
                        <input
                          id="start-time"
                          className={styles.timeInput}
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          aria-label="Start time"
                        />
                      </div>
                      <span className={styles.rangeSep} aria-hidden="true">
                        →
                      </span>
                      <div className={styles.timeField}>
                        <input
                          id="end-time"
                          className={styles.timeInput}
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          aria-label="End time"
                        />
                      </div>
                    </div>
                  </div>

                  <div className={styles.row}>
                    <label className={styles.fieldLabel} htmlFor="registration-deadline">
                      Event Registration Deadline
                    </label>
                    <div className={styles.rowEnd}>
                      <div className={styles.dateField}>
                        <span className={styles.dateIcon}>
                          <CalendarIcon />
                        </span>
                        <input
                          id="registration-deadline"
                          className={styles.dateInput}
                          type="date"
                          value={registrationDeadline}
                          onChange={(e) => setRegistrationDeadline(e.target.value)}
                          aria-label="Registration deadline"
                        />
                      </div>
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="venue">
                      Venue<RequiredMark />
                    </label>
                    <input
                      id="venue"
                      className={styles.input}
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                    />
                  </div>

                  <div className={styles.row}>
                    <label className={styles.fieldLabel} htmlFor="venue-type">
                      Venue Type<RequiredMark />
                    </label>
                    <div className={styles.rowEnd}>
                      <select
                        id="venue-type"
                        className={styles.selectCompact}
                        value={venueType}
                        onChange={(e) => setVenueType(e.target.value)}
                      >
                        <option value="">On/Off Campus</option>
                        <option value="On Campus">On Campus</option>
                        <option value="Off Campus">Off Campus</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="additional-info">
              <h3 className={styles.sectionTitle} id="additional-info">
                Additional Information
              </h3>
              <div className={styles.card}>
                <div className={styles.stack}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="announcements">
                      Announcements
                    </label>
                    <textarea
                      id="announcements"
                      className={styles.textarea}
                      value={announcements}
                      onChange={(e) => setAnnouncements(e.target.value)}
                    />
                  </div>

                  <div id="event-program-flow">
                    <div className={styles.programHead}>
                      <div>
                        <span className={styles.fieldLabel}>Event Program Flow<RequiredMark /></span>
                        <span className={styles.hint}>
                          Files must be in acceptable format, such as PNG, JPEG, PDF, or similar
                          supported types.
                        </span>
                        {programFileName ? (
                          <span className={styles.hint}>Selected: {programFileName}</span>
                        ) : null}
                      </div>
                      <div className={styles.visibility}>
                        <span className={styles.visibilityLabel}>Visibility:</span>
                        <div className={styles.visibilityToggle} role="group" aria-label="Program flow visibility">
                          <button
                            type="button"
                            className={`${styles.visibilityBtn}${visibility === "everyone" ? ` ${styles.visibilityBtnActive}` : ""}`}
                            aria-pressed={visibility === "everyone"}
                            onClick={() => setVisibility("everyone")}
                          >
                            Everyone
                          </button>
                          <button
                            type="button"
                            className={`${styles.visibilityBtn}${visibility === "organizers" ? ` ${styles.visibilityBtnActive}` : ""}`}
                            aria-pressed={visibility === "organizers"}
                            onClick={() => setVisibility("organizers")}
                          >
                            Organizers Only
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className={styles.programActions}>
                      <button
                        type="button"
                        className={styles.fileUploadBtn}
                        onClick={() => programInputRef.current?.click()}
                      >
                        <FilePlusIcon />
                        File Upload
                      </button>
                      <input
                        ref={programInputRef}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx"
                        className={styles.hiddenFile}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setProgramFileName(file.name);
                            void readFileAsBase64(file).then((payload) => {
                              setProgramFileName(payload.name);
                              setProgramFileMimeType(payload.mimeType);
                              setProgramFileBase64(payload.base64);
                            });
                          }
                          e.target.value = "";
                        }}
                      />

                      <div className={styles.addActivity}>
                        <button type="button" className={styles.addActivityBtn} onClick={addActivity}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 8v8M8 12h8" />
                          </svg>
                          Add Activity
                        </button>
                        <input
                          id="activity-name"
                          className={styles.activityInput}
                          value={activityDraft}
                          onChange={(e) => setActivityDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addActivity();
                            }
                          }}
                          aria-label="Activity name"
                        />
                      </div>
                    </div>

                    {showAiBanner ? (
                      <div className={styles.aiBanner}>
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M12 2l1.4 4.2L18 8l-4.6 1.8L12 14l-1.4-4.2L6 8l4.6-1.8L12 2zm7 9l.8 2.4L22 14l-2.2.8L19 17l-.8-2.2L16 14l2.2-.8L19 11zM5 13l.9 2.7L9 17l-3.1.9L5 21l-.9-3.1L1 17l3.1-.9L5 13z" />
                        </svg>
                        <button
                          type="button"
                          className={styles.aiSuggestBtn}
                          onClick={() => void suggestProgramFlow()}
                          disabled={aiLoading}
                        >
                          {aiLoading ? "Generating program flow with Gemini…" : "Generate program flow with Gemini"}
                        </button>
                        <button
                          type="button"
                          className={styles.aiClose}
                          aria-label="Dismiss AI suggestions"
                          onClick={() => setShowAiBanner(false)}
                        >
                          ×
                        </button>
                      </div>
                    ) : null}

                    {activities.length > 0 ? (
                      <ul className={styles.activityList}>
                        {activities.map((activity) => (
                          <li key={activity} className={styles.activityItem}>
                            <span>{activity}</span>
                            <button
                              type="button"
                              className={styles.activityRemove}
                              aria-label={`Remove ${activity}`}
                              onClick={() =>
                                setActivities((current) => current.filter((item) => item !== activity))
                              }
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className={styles.aiHint}>
                        No activities yet. Enter an event name at the top, then click Generate program flow with Gemini.
                      </p>
                    )}
                    {programFileBase64 ? (
                      <a
                        className={styles.programDownloadBtn}
                        href={`data:${programFileMimeType || "application/pdf"};base64,${programFileBase64}`}
                        download={programFileName || "program-flow.pdf"}
                      >
                        Download PDF
                      </a>
                    ) : null}
                    {aiNote ? <p className={styles.aiHint}>{aiNote}</p> : null}
                    {aiError ? <p className={styles.aiError}>{aiError}</p> : null}
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {step === 1 ? (
          <section className={styles.section} aria-labelledby="attendance-requirements">
            <h3 className={styles.sectionTitle} id="attendance-requirements">
              Attendance Requirements
            </h3>
            <div className={styles.card}>
              <div className={styles.stack}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="min-attendance">
                    Minimum Attendance Time Required<RequiredMark />
                  </label>
                  <input
                    id="min-attendance"
                    className={`${styles.input} ${styles.inputPill}`}
                    value={minAttendance}
                    onChange={(e) => setMinAttendance(e.target.value)}
                    placeholder="e.g. 1 hour"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="grace-period">
                    Grace Period<RequiredMark />
                  </label>
                  <input
                    id="grace-period"
                    className={`${styles.input} ${styles.inputPill}`}
                    value={gracePeriod}
                    onChange={(e) => setGracePeriod(e.target.value)}
                    placeholder="e.g. 15 minutes"
                  />
                </div>

                <div className={styles.field}>
                  <div className={styles.attendHead}>
                    <label className={styles.fieldLabel} htmlFor="attend-select">
                      Who can attend this Event?<RequiredMark />
                    </label>
                    <select
                      id="attend-select"
                      className={styles.selectCompact}
                      value={attendSelect}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) {
                          setAttendSelect("");
                          return;
                        }
                        if (value === ALL_COURSE_OPTION) {
                          setAttendTags([ALL_COURSE_OPTION]);
                        } else {
                          setAttendTags((current) => {
                            const withoutAll = current.filter((tag) => tag !== ALL_COURSE_OPTION);
                            if (withoutAll.includes(value)) return withoutAll;
                            return [...withoutAll, value];
                          });
                        }
                        setAttendSelect("");
                      }}
                    >
                      <option value="">Select</option>
                      {!attendTags.includes(ALL_COURSE_OPTION) ? (
                        <option value={ALL_COURSE_OPTION}>{ALL_COURSE_OPTION}</option>
                      ) : null}
                      {!attendTags.includes(ALL_COURSE_OPTION)
                        ? COURSE_OPTIONS.filter((option) => !attendTags.includes(option)).map(
                            (option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            )
                          )
                        : null}
                    </select>
                  </div>
                  <div className={styles.tagRow}>
                    {attendTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={styles.tag}
                        aria-label={`Remove ${tag} from who can attend`}
                        onClick={() => removeTag(tag, attendTags, setAttendTags)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Will this event be conducted in collaboration with another organization/course?<RequiredMark />
                  </span>
                  <div className={styles.radioRow} role="radiogroup" aria-label="Collaboration">
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name="collaboration"
                        checked={collaboration === "yes"}
                        onChange={() => setCollaboration("yes")}
                      />
                      <span>Yes</span>
                    </label>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name="collaboration"
                        checked={collaboration === "no"}
                        onChange={() => setCollaboration("no")}
                      />
                      <span>No</span>
                    </label>
                  </div>
                  <div className={styles.collabRow}>
                    <select
                      id="collab-select"
                      className={styles.selectCompact}
                      value={collabSelect}
                      disabled={collaboration === "no"}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value && !collabTags.includes(value)) {
                          setCollabTags((current) => [...current, value]);
                        }
                        setCollabSelect("");
                      }}
                      aria-label="Select collaboration course"
                    >
                      <option value="">Select</option>
                      {COURSE_OPTIONS.filter((option) => !collabTags.includes(option)).map(
                        (option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        )
                      )}
                    </select>
                    <div className={styles.tagRow}>
                      {collabTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={styles.tag}
                          aria-label={`Remove ${tag} from collaboration`}
                          disabled={collaboration === "no"}
                          onClick={() => removeTag(tag, collabTags, setCollabTags)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Are there any speakers for this event?<RequiredMark /></span>
                  <div className={styles.radioRow} role="radiogroup" aria-label="Speakers">
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name="speakers"
                        checked={hasSpeakers === "yes"}
                        onChange={() => setHasSpeakers("yes")}
                      />
                      <span>Yes</span>
                    </label>
                    <label className={styles.radio}>
                      <input
                        type="radio"
                        name="speakers"
                        checked={hasSpeakers === "no"}
                        onChange={() => setHasSpeakers("no")}
                      />
                      <span>No</span>
                    </label>
                  </div>

                  <div className={styles.speakerField}>
                    <input
                      id="speaker-name"
                      className={`${styles.input} ${styles.inputPill} ${styles.speakerInput}`}
                      value={speakerDraft}
                      onChange={(e) => setSpeakerDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (hasSpeakers === "yes") addSpeaker();
                        }
                      }}
                      placeholder="Type the name of speaker"
                      disabled={hasSpeakers === "no"}
                      aria-label="Speaker name"
                    />
                    <div className={styles.speakerActions}>
                      <button
                        type="button"
                        className={styles.speakerConfirm}
                        aria-label="Confirm speaker"
                        disabled={hasSpeakers === "no"}
                        onClick={addSpeaker}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M8 12l3 3 5-5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className={styles.speakerCount}>Total Speakers Attending: {speakers.length}</p>

                  {speakers.length > 0 ? (
                    <ul className={styles.activityList}>
                      {speakers.map((speaker) => (
                        <li key={speaker} className={styles.activityItem}>
                          <span>{speaker}</span>
                          <button
                            type="button"
                            className={styles.activityRemove}
                            aria-label={`Remove ${speaker}`}
                            onClick={() =>
                              setSpeakers((current) => current.filter((item) => item !== speaker))
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <>
            <section className={styles.section} aria-labelledby="event-documents">
              <h3 className={styles.sectionTitle} id="event-documents">
                Event Documents
              </h3>
              <div className={styles.card}>
                <div className={styles.stack}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="concept-paper-file">
                      Approved Concept Paper<RequiredMark />
                    </label>
                    <div className={styles.filePicker}>
                      <button
                        type="button"
                        id="concept-paper-choose"
                        className={styles.chooseFileBtn}
                        onClick={() => conceptPaperRef.current?.click()}
                      >
                        Choose File
                      </button>
                      <span className={styles.filePickerName}>
                        {conceptPaperName || "No file chosen"}
                      </span>
                      <input
                        ref={conceptPaperRef}
                        id="concept-paper-file"
                        type="file"
                        accept="image/*,.pdf"
                        className={styles.hiddenFile}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setConceptPaperName(file.name);
                            void readFileAsBase64(file).then((payload) => {
                              setConceptPaperName(payload.name);
                              setConceptPaperMimeType(payload.mimeType);
                              setConceptPaperBase64(payload.base64);
                            });
                          }
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <span className={styles.hint}>
                      Files must be in a viewable format, such as PNG, JPEG, PDF, or similar
                      supported types only.
                    </span>
                  </div>

                  <div className={styles.field}>
                    <div className={styles.docHead}>
                      <label className={styles.fieldLabel} htmlFor="certificate-file">
                        E-Certificate Template{eCertificateEnabled ? <RequiredMark /> : null}
                      </label>
                      <button
                        type="button"
                        id="certificate-toggle"
                        role="switch"
                        aria-checked={eCertificateEnabled}
                        aria-label="Enable E-Certificate Template"
                        className={`${styles.toggle}${eCertificateEnabled ? ` ${styles.toggleOn}` : ""}`}
                        onClick={() => setECertificateEnabled((v) => !v)}
                      >
                        <span className={styles.toggleKnob} />
                      </button>
                    </div>
                    <div className={styles.filePicker}>
                      <button
                        type="button"
                        id="certificate-choose"
                        className={styles.chooseFileBtn}
                        disabled={!eCertificateEnabled}
                        onClick={() => certificateRef.current?.click()}
                      >
                        Choose File
                      </button>
                      <span className={styles.filePickerName}>
                        {certificateName || "No file chosen"}
                      </span>
                      <input
                        ref={certificateRef}
                        id="certificate-file"
                        type="file"
                        accept=".pdf,application/pdf"
                        className={styles.hiddenFile}
                        disabled={!eCertificateEnabled}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setCertificateName(file.name);
                            void readFileAsBase64(file).then((payload) => {
                              setCertificateName(payload.name);
                              setCertificateTemplateMimeType(payload.mimeType);
                              setCertificateTemplateBase64(payload.base64);
                            });
                          }
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <span className={styles.hint}>
                      Files must be in a viewable format, such as PNG, JPEG, PDF, or similar
                      supported types only.
                    </span>
                  </div>

                  <div className={styles.docHead}>
                    <span className={styles.fieldLabel}>Room Reservation Form<RequiredMark /></span>
                    <a
                      className={styles.iroomBtn}
                      href="https://eroomreserve.vercel.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      e-RoomReserve
                      <span className={styles.iroomArrow} aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </span>
                    </a>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="file-requirements">
              <h3 className={styles.sectionTitle} id="file-requirements">
                File Requirements
              </h3>
              <div className={styles.card}>
                <div className={styles.stack}>
                  <div className={styles.field}>
                    <div className={styles.questionRow}>
                      <span className={styles.fieldLabel}>
                        Are participants required to submit any files before joining the event?<RequiredMark />
                      </span>
                      <div className={styles.radioRow} role="radiogroup" aria-label="Files required">
                        <label className={styles.radio}>
                          <input
                            type="radio"
                            name="files-required"
                            checked={filesRequired === "yes"}
                            onChange={() => setFilesRequired("yes")}
                          />
                          <span>Yes</span>
                        </label>
                        <label className={styles.radio}>
                          <input
                            type="radio"
                            name="files-required"
                            checked={filesRequired === "no"}
                            onChange={() => setFilesRequired("no")}
                          />
                          <span>No</span>
                        </label>
                      </div>
                    </div>

                    {filesRequired === "yes" ? (
                      <>
                        <div className={styles.speakerField}>
                          <input
                            id="required-file-name"
                            className={`${styles.input} ${styles.inputPill} ${styles.speakerInput}`}
                            value={requiredFileDraft}
                            onChange={(e) => setRequiredFileDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addRequiredFile();
                              }
                            }}
                            placeholder="Type File Name"
                            aria-label="Required file name"
                          />
                          <div className={styles.speakerActions}>
                            <button
                              type="button"
                              className={styles.speakerConfirm}
                              aria-label="Confirm file name"
                              onClick={addRequiredFile}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M8 12l3 3 5-5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className={styles.speakerAdd}
                              aria-label="Add file name"
                              onClick={addRequiredFile}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 8v8M8 12h8" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {requiredFiles.length > 0 ? (
                          <ul className={styles.activityList}>
                            {requiredFiles.map((fileName) => (
                              <li key={fileName} className={styles.activityItem}>
                                <span>{fileName}</span>
                                <button
                                  type="button"
                                  className={styles.activityRemove}
                                  aria-label={`Remove ${fileName}`}
                                  onClick={() =>
                                    setRequiredFiles((current) =>
                                      current.filter((item) => item !== fileName)
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className={styles.field}>
                    <div className={styles.questionRow}>
                      <span className={styles.fieldLabel}>
                        Allow participants to share photos from the event?<RequiredMark />
                      </span>
                      <div
                        className={styles.visibilityToggle}
                        role="group"
                        aria-label="Photo sharing"
                      >
                        <button
                          type="button"
                          className={`${styles.visibilityBtn}${photoSharing === "yes" ? ` ${styles.visibilityBtnActive}` : ""}`}
                          aria-pressed={photoSharing === "yes"}
                          onClick={() => setPhotoSharing("yes")}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className={`${styles.visibilityBtn}${photoSharing === "organizers" ? ` ${styles.visibilityBtnActive}` : ""}`}
                          aria-pressed={photoSharing === "organizers"}
                          onClick={() => setPhotoSharing("organizers")}
                        >
                          Organizers Only
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className={styles.reviewMessage}>Nearly there! Check if everything&apos;s correct.</p>

            <article className={styles.reviewCard}>
              <div className={`${detailStyles.hero} ${styles.reviewHero}`}>
                <img src={bannerPreview || DEFAULT_REVIEW_IMAGE} alt="" />
              </div>

              <div className={styles.reviewBody}>
                <div className={detailStyles.head}>
                  <div className={detailStyles.date}>
                    <span className={detailStyles.dateMonth}>{dateParts.month}</span>
                    <span className={detailStyles.dateDay}>{dateParts.day}</span>
                    <span className={detailStyles.dateYear}>{dateParts.year}</span>
                  </div>
                  <div className={detailStyles.info}>
                    <h2>{eventName || "Event Name"}</h2>
                    <div className={detailStyles.meta}>
                      <span className={`${detailStyles.metaRow} ${detailStyles.metaVenue}`}>
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1118 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {venue || "Event Venue"}
                      </span>
                      <span className={`${detailStyles.metaRow} ${detailStyles.metaTime}`}>
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        {reviewTime}
                      </span>
                    </div>
                  </div>
                  <div className={detailStyles.actions}>
                    <button type="button" className={detailStyles.iconBtn} aria-label="Save event">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                      </svg>
                    </button>
                    <button type="button" className={detailStyles.iconBtn} aria-label="Share event">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
                      </svg>
                    </button>
                  </div>
                </div>

                <hr className={detailStyles.divider} />

                <section className={detailStyles.section}>
                  <h3>Event Announcements</h3>
                  {announcementParagraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                  ))}
                </section>

                <section className={detailStyles.section}>
                  <h3>Event Description</h3>
                  {descriptionParagraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                  ))}
                  <div className={detailStyles.types}>
                    <div className={detailStyles.listItem}>
                      <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
                      </svg>
                      <span>Venue Type ({venueType || "On/Off Campus"})</span>
                    </div>
                    <div className={detailStyles.listItem}>
                      <svg viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      <span>Event Type ({eventType || "Seminar/Outreach/Party"})</span>
                    </div>
                  </div>
                </section>

                <section className={detailStyles.section}>
                  <h3>Hosted By</h3>
                  <div className={detailStyles.list}>
                    <div className={detailStyles.listItem}>
                      <svg viewBox="0 0 24 24" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                      </svg>
                      <span>{hostedOrganization}</span>
                    </div>
                    <div className={detailStyles.listItem}>
                      <svg viewBox="0 0 24 24" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                      </svg>
                      <span>{hostedCourse}</span>
                    </div>
                    <div className={detailStyles.listItem}>
                      <svg viewBox="0 0 24 24" strokeWidth="2">
                        <path d="M3 21h18M6 21V7h12v14" />
                        <path d="M9 21v-4h6v4" />
                      </svg>
                      <span>School/Department</span>
                    </div>
                  </div>
                </section>

                <section className={detailStyles.section}>
                  <h3>Event Requirements</h3>
                  <div className={detailStyles.list}>
                    <div className={detailStyles.listItem}>
                      <svg viewBox="0 0 24 24" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      <span>Attendance Time Required: {minAttendance || "—"}</span>
                    </div>
                    <div className={detailStyles.listItem}>
                      <svg viewBox="0 0 24 24" strokeWidth="2">
                        <path d="M5 3v4M19 3v4M5 7h14v14H5z" />
                        <path d="M9 11h6" />
                      </svg>
                      <span>Grace Period: {gracePeriod || "—"}</span>
                    </div>
                    <div className={detailStyles.listItem}>
                      <svg viewBox="0 0 24 24" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      <span>Required File(s): {requiredFilesLabel}</span>
                    </div>
                  </div>
                </section>

                <section className={detailStyles.section}>
                  <h3>Event Program Flow</h3>
                  <p className={styles.programNote}>
                    Only members of the organizing section can view this information.
                  </p>
                  <div className={styles.programPanel}>
                    {activities.length > 0 ? (
                      <ul className={styles.programList}>
                        {activities.map((activity) => (
                          <li key={activity}>{activity}</li>
                        ))}
                      </ul>
                    ) : programFileName ? (
                      <p className={styles.programFile}>{programFileName}</p>
                    ) : null}
                  </div>
                </section>
              </div>
            </article>
          </>
        ) : null}

        {step === 3 ? (
          <div className={styles.reviewFooter}>
            <button
              type="button"
              className={styles.goBackBtn}
              onClick={() => {
                setStep(2);
              }}
            >
              Go Back
            </button>
            <button type="submit" className={styles.createEventBtn}>
              Create Event
            </button>
          </div>
        ) : (
          <div className={styles.footer}>
            {step === 0 ? (
              <Link href="/organized" className={styles.backLink}>
                Go back to Events Organize
              </Link>
            ) : (
              <button
                type="button"
                className={styles.backLink}
                onClick={() => {
                  setStep((current) => Math.max(0, current - 1));
                }}
              >
                {step === 1
                  ? "Go back to Event Detail"
                  : step === 2
                    ? "Go back to Attendance Setup"
                    : "Go back"}
              </button>
            )}
            <button type="submit" className={styles.continueBtn}>
              Save &amp; Continue
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function formatTimeDisplay(value: string) {
  if (!value) return "";
  const [hoursRaw, minutes] = value.split(":");
  const hours = Number(hoursRaw);
  if (Number.isNaN(hours)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}
