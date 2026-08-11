"use client";

import { useEffect } from "react";
import type { LegacyPageData } from "@/lib/navigation";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-legacy-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = `/legacy/${src}`;
    el.async = false;
    el.dataset.legacySrc = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(el);
  });
}

export function useLegacyScripts(scripts: LegacyPageData["scripts"]) {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      for (const script of scripts) {
        if (cancelled) return;
        if (script.type === "src") {
          await loadScript(script.value);
        } else {
          try {
            // eslint-disable-next-line no-new-func
            new Function(script.value)();
          } catch (err) {
            console.error("Legacy inline script error:", err);
          }
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [scripts]);
}

const OPEN_EYE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/></svg>`;
const CLOSED_EYE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6A2.5 2.5 0 0012 14.5a2.5 2.5 0 001.9-.8M9.9 5.2A10.4 10.4 0 0112 5c5 0 9.3 3.1 11 7.5a11.7 11.7 0 01-4.2 5.1M6.1 6.1A11.6 11.6 0 001 12.5C2.7 16.9 7 20 12 20c1.7 0 3.3-.4 4.7-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function bindPasswordToggles(root: ParentNode) {
  const buttons = root.querySelectorAll<HTMLButtonElement>(
    "#toggle-password, button.toggle-password"
  );

  const onClick = (event: Event) => {
    const btn = (event.currentTarget as HTMLButtonElement | null) ?? null;
    if (!btn) return;
    event.preventDefault();
    const input = document.getElementById(
      btn.getAttribute("data-target") || "password"
    ) as HTMLInputElement | null;
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.classList.toggle("is-visible", !showing);
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
    btn.innerHTML = showing ? CLOSED_EYE : OPEN_EYE;
  };

  buttons.forEach((btn) => {
    if (btn.dataset.pwBound === "1") return;
    btn.dataset.pwBound = "1";
    btn.addEventListener("click", onClick);
  });
}

export function LegacyContent({
  data,
  className,
}: {
  data: LegacyPageData;
  className?: string;
}) {
  useLegacyScripts(data.scripts);

  useEffect(() => {
    document.title = data.title ? `DC Space — ${data.title}` : "DC Space";
  }, [data.title]);

  useEffect(() => {
    if (data.route !== "/login") return;
    bindPasswordToggles(document);
  }, [data.html, data.route]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: data.styles }} />
      <div className={className} dangerouslySetInnerHTML={{ __html: data.html }} />
    </>
  );
}
