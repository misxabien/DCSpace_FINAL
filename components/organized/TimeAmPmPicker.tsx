"use client";

import styles from "@/components/organized/CreateEvent.module.css";

type Meridiem = "AM" | "PM";

type ParsedTime12 = {
  hour12: number;
  minute: string;
  meridiem: Meridiem;
};

function parseTime24(value: string): ParsedTime12 | null {
  if (!value) return null;
  const [hoursRaw, minutesRaw = "00"] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return {
    hour12: hours % 12 || 12,
    minute: String(Math.min(59, Math.max(0, minutes))).padStart(2, "0"),
    meridiem: hours >= 12 ? "PM" : "AM",
  };
}

function toTime24(hour12: number, minute: string, meridiem: Meridiem) {
  let hours = hour12 % 12;
  if (meridiem === "PM") hours += 12;
  return `${String(hours).padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

/**
 * Same compact time field as before, with AM/PM toggles beside the clock value.
 * Stores HH:mm (24h) for the rest of the create-event flow.
 */
export function TimeAmPmPicker({
  id,
  value,
  onChange,
  ariaLabel,
  showLeadingIcon = false,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  showLeadingIcon?: boolean;
}) {
  const parsed = parseTime24(value);
  const hour12 = parsed?.hour12 ?? "";
  const minute = parsed?.minute ?? "";
  const meridiem = parsed?.meridiem ?? "";

  const commit = (
    nextHour: number | "",
    nextMinute: string,
    nextMeridiem: Meridiem | "",
  ) => {
    const h = nextHour === "" ? 12 : nextHour;
    const m = nextMinute || "00";
    const period = nextMeridiem || "AM";
    onChange(toTime24(h, m, period));
  };

  return (
    <div className={styles.timeField} role="group" aria-label={ariaLabel}>
      {showLeadingIcon ? (
        <span className={styles.timeIcon} aria-hidden="true">
          <ClockGlyph />
        </span>
      ) : null}

      <select
        id={id}
        className={styles.timeHourSelect}
        value={hour12}
        aria-label={`${ariaLabel} hour`}
        onChange={(e) =>
          commit(Number(e.target.value), minute || "00", meridiem || "AM")
        }
      >
        <option value="" disabled>
          --
        </option>
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {String(hour).padStart(2, "0")}
          </option>
        ))}
      </select>

      <span className={styles.timeColon} aria-hidden="true">
        :
      </span>

      <select
        className={styles.timeMinuteSelect}
        value={minute}
        aria-label={`${ariaLabel} minutes`}
        onChange={(e) =>
          commit(hour12 === "" ? 12 : hour12, e.target.value, meridiem || "AM")
        }
      >
        <option value="" disabled>
          --
        </option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <div className={styles.ampmBeside} role="group" aria-label={`${ariaLabel} AM or PM`}>
        <button
          type="button"
          className={`${styles.ampmChoice} ${meridiem === "AM" ? styles.ampmChoiceActive : ""}`}
          aria-pressed={meridiem === "AM"}
          onClick={() =>
            commit(hour12 === "" ? 12 : hour12, minute || "00", "AM")
          }
        >
          AM
        </button>
        <button
          type="button"
          className={`${styles.ampmChoice} ${meridiem === "PM" ? styles.ampmChoiceActive : ""}`}
          aria-pressed={meridiem === "PM"}
          onClick={() =>
            commit(hour12 === "" ? 12 : hour12, minute || "00", "PM")
          }
        >
          PM
        </button>
      </div>
    </div>
  );
}
