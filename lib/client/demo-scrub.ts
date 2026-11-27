/**
 * The admin pages are built from Figma HTML that ships with sample values
 * (fake dates, ratings, progress, "+3" trends, a sample activity log…). The data
 * bridges overwrite the fields they know, but anything they don't fill stayed fake.
 *
 * This runs right after the page HTML is placed and right after the page's own
 * script runs — always BEFORE real data arrives — and blanks the known sample
 * values ("—"), hides fake trend badges / activity items / notes, and empties fake
 * progress bars. Real data written later simply replaces the blank.
 */

/** Exact sample values from the Figma pages (never real data at this point). */
const SAMPLE_VALUES = new Set([
  "07 / 01 / 2026",
  "July 1, 2026",
  "JULY 1, 2026 1:00 PM",
  "00:00 AM/PM",
  "5 minutes ago",
  "1:00 PM",
  "5:00 PM",
  "8:00 AM",
  "8:30 AM",
  "10:00 AM",
  "12:00 PM",
  "12:00 PM - 12:30 PM",
  "4 HOURS",
  "2 HOURS 30 MINS",
  "30 MINS",
  "21/100",
  "20/100",
  "120/200",
  "180/200",
  "4.5/5",
  "5/5",
  "First Name Last Name",
  // Feedback details / responses sample event and comments.
  "Mental Health and Wellness Awareness Seminar",
  "DRA HALL",
  "DOMINIXODE",
  "Detailed comment mentioned here",
  "EVENT NAME",
  "Event Name",
]);

/** Sample activity-log times: the whole activity item is fake. */
const SAMPLE_ACTIVITY_TIMES = new Set([
  "5 seconds ago",
  "10 minutes ago",
  "15 minutes ago",
  "45 minutes ago",
  "1 hr ago",
]);

/** Sample sentences under the certificate rings. */
const SAMPLE_NOTES = /^(\d+ participants (validated|have passed)|\d+ certificates have been successfully generated|\d+ of \d+ certificates have been released)/i;

const BLANK = "—";

export function scrubSampleContent(root: ParentNode | null | undefined) {
  if (!root) return;

  // Trend badges ("+3", "-2") are never computed: hide them.
  root.querySelectorAll<HTMLElement>(".delta").forEach((el) => {
    if (/^[+\-−]?\s*\d+(\.\d+)?%?$/.test((el.textContent || "").trim())) {
      el.textContent = "";
      el.style.setProperty("display", "none", "important");
    }
  });

  // Fake progress bars: empty until real data sets them.
  root.querySelectorAll<HTMLElement>(".progress-fill").forEach((el) => {
    if (/^\d+%$/.test((el.textContent || "").trim())) {
      el.textContent = "";
      el.style.width = "0%";
    }
  });
  root.querySelectorAll<HTMLElement>(".pct").forEach((el) => {
    if (/^\d+%$/.test((el.textContent || "").trim())) el.textContent = BLANK;
  });

  // Report wizard "Review Collected Event Data": every value there is sample data
  // until the selected event's real numbers load.
  root.querySelectorAll<HTMLElement>(".rg-kv .v").forEach((el) => {
    el.textContent = BLANK;
  });

  // Certificate page overview numbers ("Manual Reviews 2"…) and the admin
  // profile "Account Summary" (20 / 3 / 0): real values replace these blanks.
  root.querySelectorAll<HTMLElement>(".fd-overview-row .v, .summary-list .val").forEach((el) => {
    if (/^\d+$/.test((el.textContent || "").trim())) el.textContent = BLANK;
  });

  // Event analytics (registration status, capacity, risk pills, AI conclusions):
  // filled by the event-insights request, which can take 10s+ (AI). Until then the
  // design's samples ("50 Users", "400 People", "Critical Risk", "…92%…") showed.
  root.querySelectorAll<HTMLElement>(".metric-row .progress-fill").forEach((el) => {
    el.textContent = "";
    el.style.width = "0%";
  });
  root.querySelectorAll<HTMLElement>(".metric-row .metric-value, .metric-row .flow-pill").forEach((el) => {
    el.textContent = BLANK;
    el.classList.remove("bad", "warn", "good", "alert");
  });
  root.querySelectorAll<HTMLElement>(".ai-conclusion-box, .ai-reco-box").forEach((el) => {
    el.textContent = "";
  });

  // Admin profile "Last Password Change" shipped the placeholder word "Date".
  root.querySelectorAll<HTMLElement>(".security-sub").forEach((el) => {
    if ((el.textContent || "").trim() === "Date") el.textContent = BLANK;
  });

  // Report preview: the design's sample report text; the generated Smart Report
  // (or a "generate it first" note) replaces it.
  root.querySelectorAll<HTMLElement>(".rg-preview-doc p").forEach((el) => {
    el.textContent = "";
  });

  // Sample activity log entries.
  root.querySelectorAll<HTMLElement>("time").forEach((el) => {
    if (!SAMPLE_ACTIVITY_TIMES.has((el.textContent || "").trim())) return;
    const item = el.closest<HTMLElement>("li, article, .activity-item, .activity-row") || el.parentElement;
    if (item) item.style.setProperty("display", "none", "important");
  });
  root.querySelectorAll<HTMLElement>(".activity-list").forEach((list) => {
    const items = Array.from(list.children) as HTMLElement[];
    const anyShown = items.some((item) => item.style.display !== "none" && !item.classList.contains("dc-empty-activity"));
    if (!anyShown && !list.querySelector(".dc-empty-activity")) {
      const empty = (list.ownerDocument || document).createElement("p");
      empty.className = "dc-empty-activity";
      empty.textContent = "No recent activity yet.";
      empty.style.cssText = "margin:8px 0 0;color:#64748b;font-size:13px;";
      list.appendChild(empty);
    }
  });

  // Sample sentences under rings.
  root.querySelectorAll<HTMLElement>("p.note, .note").forEach((el) => {
    if (SAMPLE_NOTES.test((el.textContent || "").trim())) {
      el.textContent = "";
      el.style.setProperty("display", "none", "important");
    }
  });

  // Exact sample values anywhere (skip real column headers / controls).
  const doc = (root as Node).ownerDocument || document;
  const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || "").trim();
    if (!text || !SAMPLE_VALUES.has(text)) continue;
    const parent = (node as Text).parentElement;
    if (!parent || parent.closest("th, thead, label, option, button, script, style, select")) continue;
    hits.push(node as Text);
  }
  hits.forEach((text) => {
    text.textContent = BLANK;
  });

  // Pager counts from the design ("Show 6 out of 6 entries"): start at 0; the
  // page's data sets the real count when there are entries.
  const pagerWalker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  while ((node = pagerWalker.nextNode())) {
    const text = (node.textContent || "").trim();
    if (/^(Show )?(\d+ )?out of \d+ entries$/.test(text)) {
      node.textContent = text.replace(/\d+/g, "0");
    }
  }
}
