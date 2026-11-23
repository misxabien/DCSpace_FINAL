/** Parse human attendance strings like "2 hours", "90 minutes", or "90" into minutes. */
export function parseDurationToMinutes(value: string): number | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;

  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hour|hours|hr|hrs)\b/);
  const minutesMatch = text.match(/(\d+)\s*(?:minute|minutes|min|mins)\b/);

  let total = 0;
  if (hoursMatch) total += Math.round(Number(hoursMatch[1]) * 60);
  if (minutesMatch) total += Number(minutesMatch[1]);

  if (total > 0) return total;

  const numeric = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return text.includes("hour") || text.includes("hr")
    ? Math.round(numeric * 60)
    : Math.round(numeric);
}

export function formatMinutesLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours && mins) {
    return `${hours}h ${mins}m`;
  }
  if (hours) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

export function inferCertificateCategory(dateIso: string): string {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "cert-month";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "cert-today";
  const day = date.getDay();
  if (day === 0 || day === 6) return "cert-weekend";
  return "cert-month";
}
