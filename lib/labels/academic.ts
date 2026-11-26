/**
 * Display names for the codes stored on accounts (course, school, organization
 * role, account role). Sign-up saves codes such as "bs-information-technology"
 * or "scmcs"; screens must show "BS Information Technology" / "SCEMC".
 * Safe on server and client. Unknown values are tidied, never dropped.
 */

/** Official course list (same as the sign-up form). */
export const COURSE_LABELS: Record<string, string> = {
  "bs-medical-laboratory-science": "BS Medical Laboratory Science (Medical Technology)",
  "bs-biology": "BS Biology",
  "bs-pharmacy": "BS Pharmacy",
  "bs-accountancy": "BS Accountancy",
  "bs-accounting-information-system": "BS Accounting Information System",
  "bs-psychology": "BS Psychology",
  beed: "Bachelor of Elementary Education",
  bsed: "Bachelor of Secondary Education",
  "bs-information-technology": "BS Information Technology",
  bma: "Bachelor of Multimedia Arts",
  "ba-communication": "BA Communication",
  "bsba-financial-management": "BSBA Financial Management",
  "bsba-marketing-management": "BSBA Marketing Management",
  "bsba-human-resource-development-management": "BSBA Human Resource Development Management",
  "bsba-human-resource-management": "BSBA Human Resource Management",
  "bsba-operations-management": "BSBA Operations Management",
  "bs-tourism-management": "BS Tourism Management",
  bshm: "BS Hospitality Management",
  "bshm-cruiseline-operations": "BSHM Cruiseline Operations",
  "bshm-culinary-arts-kitchen-operations": "BSHM Culinary Arts and Kitchen Operations",
  bstm: "BS Tourism Management",
  "bs-nursing": "BS Nursing",
  "bs-physical-therapy": "BS Physical Therapy",
  "bs-radiologic-technology": "BS Radiologic Technology",
  // Short codes used by the admin "Add user" form.
  bsit: "BS Information Technology",
  bacomm: "BA Communication",
  bmma: "Bachelor of Multimedia Arts",
  bsn: "BS Nursing",
};

/** School codes → short names (scmcs is the old key for SCEMC). */
export const SCHOOL_LABELS: Record<string, string> = {
  sase: "SASE",
  scemc: "SCEMC",
  scmcs: "SCEMC",
  sihtm: "SIHTM",
  snahs: "SNAHS",
  smls: "SMLS",
  shs: "SHS",
};

const ROLE_LABELS: Record<string, string> = {
  student: "Student",
  faculty: "Faculty",
  admin: "Admin",
  "super-admin": "Super Admin",
  superadmin: "Super Admin",
  organizer: "Organizer",
  officer: "Officer",
  member: "Member",
  president: "President",
  "vice-president": "Vice President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  auditor: "Auditor",
  none: "None",
};

const UPPER_WORDS = new Set(["bs", "ba", "bsba", "bshm", "bstm", "beed", "bsed", "bma", "it", "hm", "tm", "ma", "ms", "phd", "shs"]);

/** "bs-information-technology" → "BS Information Technology"; other text is kept. */
export function humanizeCode(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  // Only reshape values that look like codes (lowercase words joined by - or _).
  if (!/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(text)) return text;
  return text
    .split(/[-_]+/)
    .map((word) => (UPPER_WORDS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function courseLabel(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return COURSE_LABELS[text.toLowerCase()] || humanizeCode(text);
}

export function schoolLabel(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const known = SCHOOL_LABELS[text.toLowerCase()];
  if (known) return known;
  // A short lowercase code ("scemc") → upper case; full names stay as typed.
  if (/^[a-z]{2,6}$/.test(text)) return text.toUpperCase();
  return humanizeCode(text);
}

export function roleLabel(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return ROLE_LABELS[text.toLowerCase()] || humanizeCode(text);
}

/** "officer:Vice President" → { role: "Officer", position: "Vice President" }. */
export function organizationRoleParts(value: unknown): { role: string; position: string } {
  const text = String(value ?? "").trim();
  if (!text) return { role: "", position: "" };
  const colon = text.indexOf(":");
  const role = colon >= 0 ? text.slice(0, colon) : text;
  const position = colon >= 0 ? text.slice(colon + 1) : "";
  return { role: roleLabel(role), position: humanizeCode(position.trim()) };
}

/** "officer:vice-president" → "Officer (Vice President)" for one-line displays. */
export function organizationRoleText(value: unknown): string {
  const { role, position } = organizationRoleParts(value);
  return position ? `${role} (${position})` : role;
}

/** Back to the stored code when an edit form shows a display name (keeps data consistent). */
export function courseCode(value: unknown): string {
  const text = String(value ?? "").trim();
  const hit = Object.entries(COURSE_LABELS).find(([, label]) => label.toLowerCase() === text.toLowerCase());
  return hit ? hit[0] : text;
}

export function schoolCode(value: unknown): string {
  const text = String(value ?? "").trim();
  const hit = Object.entries(SCHOOL_LABELS).find(([code, label]) => label.toLowerCase() === text.toLowerCase() && code !== "scmcs");
  return hit ? hit[0] : text;
}

/** Organization role as typed/shown ("Officer", "Vice President") → stored key ("officer"). */
export function organizationRoleCode(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || text === "—" || text.toLowerCase() === "none") return "";
  return text.toLowerCase().replace(/\s+/g, "-");
}
