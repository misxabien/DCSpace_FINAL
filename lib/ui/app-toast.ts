type AppToastTone = "success" | "error" | "info";

const HOST_ID = "dc-app-toast-host";
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureHost() {
  if (typeof document === "undefined") return null;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.className = "dc-app-toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

/** Lightweight global toast for legacy student pages (join, save, etc.). */
export function showAppToast(
  message: string,
  tone: AppToastTone = "success",
  durationMs = 3200,
) {
  if (typeof document === "undefined") return;
  const host = ensureHost();
  if (!host) return;

  host.innerHTML = "";
  const toast = document.createElement("div");
  toast.className = `dc-app-toast dc-app-toast--${tone}`;
  toast.setAttribute("role", "status");

  const icon = document.createElement("span");
  icon.className = "dc-app-toast__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = tone === "error" ? "!" : "✓";

  const text = document.createElement("p");
  text.className = "dc-app-toast__message";
  text.textContent = message;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "dc-app-toast__close";
  close.setAttribute("aria-label", "Dismiss notification");
  close.textContent = "×";
  close.onclick = () => {
    toast.remove();
  };

  toast.append(icon, text, close);
  host.appendChild(toast);

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.remove();
    hideTimer = null;
  }, durationMs);
}
