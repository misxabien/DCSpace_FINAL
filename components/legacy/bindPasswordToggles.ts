const OPEN_EYE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/>
</svg>`;

const CLOSED_EYE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="16" height="16">
  <path d="M3 3l18 18M10.6 10.6A2.5 2.5 0 0012 14.5a2.5 2.5 0 001.9-.8M9.9 5.2A10.4 10.4 0 0112 5c5 0 9.3 3.1 11 7.5a11.7 11.7 0 01-4.2 5.1M6.1 6.1A11.6 11.6 0 001 12.5C2.7 16.9 7 20 12 20c1.7 0 3.3-.4 4.7-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * Toggle password visibility for legacy forms:
 * - #toggle-password / button.icon-right (login02)
 * - button.toggle-password[data-target] (fpp11, pass07, …)
 */
export function bindPasswordToggles(root: ParentNode): () => void {
  const onClick = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const btn = target.closest(
      "#toggle-password, button.toggle-password, button.icon-right, [data-toggle-password]"
    ) as HTMLButtonElement | null;
    if (!btn || !(root as Node).contains(btn)) return;

    let passwordInput: HTMLInputElement | null = null;

    const targetId = btn.getAttribute("data-target");
    if (targetId) {
      passwordInput = document.getElementById(targetId) as HTMLInputElement | null;
    }

    if (!passwordInput) {
      const wrap = btn.closest(".input-wrap");
      if (!wrap) return;
      const inputs = Array.from(wrap.querySelectorAll<HTMLInputElement>("input"));
      passwordInput =
        inputs.find((el) => el.type === "password") ||
        inputs.find(
          (el) =>
            el.type === "text" && /password/i.test(`${el.id} ${el.name}`)
        ) ||
        null;
    }

    if (!passwordInput) return;
    if (passwordInput.type !== "password" && passwordInput.type !== "text") return;

    event.preventDefault();
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    btn.setAttribute("aria-pressed", showing ? "false" : "true");
    btn.innerHTML = showing ? CLOSED_EYE : OPEN_EYE;
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}
