"use client";

import { useEffect, useState } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { bindPasswordToggles } from "@/components/legacy/bindPasswordToggles";
import { bindRegisterRoleControls } from "@/lib/auth/registerRole";

function normalizeLegacyText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Legacy JSON still ships shell CSS, but the React layout owns sidebar + main spacing. */
function stripLegacyShellCss(css: string) {
  return css
    .replace(/\.sidebar__/g, ".legacy-dead-sidebar__")
    .replace(/\.sidebar\b/g, ".legacy-dead-sidebar")
    .replace(/\.legacy-dead-sidebar\s*\{[^}]*\}/g, "")
    .replace(/\.app\s*\{[^}]*\}/g, "")
    .replace(/\.main\s*\{[^}]*\}/g, "")
    .replace(/\.event-grid[^{]*\{[^}]*\}/g, "")
    .replace(/\.event-card[^{]*\{[^}]*\}/g, "")
    .replace(/\.event-card__bookmark,\s*/g, "")
    .replace(/\.event-card__bookmark\s*\{[^}]*\}/g, "")
    .replace(/\.event-card__body\s*\{[^}]*\}/g, "")
    .replace(/\.back-btn\s*\{[^}]*\}/g, "")
    .replace(/\.back-btn:hover\s*\{[^}]*\}/g, "")
    .replace(/\.back-btn svg\s*\{[^}]*\}/g, "");
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-legacy-src="${src}"]`);
    if (existing) {
      if ((existing as HTMLScriptElement).dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true },
      );
      return;
    }
    const el = document.createElement("script");
    el.src = `/legacy/${src}`;
    el.async = false;
    el.dataset.legacySrc = src;
    el.onload = () => {
      el.dataset.loaded = "1";
      resolve();
    };
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(el);
  });
}

export function useLegacyScripts(
  scripts: LegacyPageData["scripts"],
  pageKey?: string,
) {
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
    // Re-bind when navigating between legacy pages (soft nav)
  }, [scripts, pageKey]);
}

export function LegacyContent({
  data,
  className,
}: {
  data: LegacyPageData;
  className?: string;
}) {
  // Legacy HTML is patched client-side (profile name, event grids). Defer innerHTML
  // until mount so server HTML and the first client render stay identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(false);
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, [data.id]);

  useLegacyScripts(mounted ? data.scripts : [], mounted ? data.id : undefined);
  const pageStyles = stripLegacyShellCss(normalizeLegacyText(data.styles));
  const pageHtml = normalizeLegacyText(data.html);

  useEffect(() => {
    document.title = data.title ? `DC Space — ${data.title}` : "DC Space";
  }, [data.title]);

  useEffect(() => {
    if (!mounted) return;
    const host = document.querySelector("[data-legacy-content]");
    if (!host) return;
    const unbindPassword = bindPasswordToggles(host);
    const unbindRole = bindRegisterRoleControls(host);
    return () => {
      unbindPassword();
      unbindRole();
    };
  }, [data.id, mounted]);

  // Tell header/profile bridges the static HTML (with placeholders) is in the DOM.
  useEffect(() => {
    if (!mounted) return;
    window.dispatchEvent(
      new CustomEvent("dc-legacy-content-ready", { detail: { id: data.id } }),
    );
  }, [data.id, mounted, pageHtml]);

  return (
    <>
      {mounted ? (
        <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
      ) : null}
      <div
        key={data.id}
        data-legacy-content=""
        data-legacy-page={data.id}
        className={className}
        suppressHydrationWarning
        {...(mounted
          ? { dangerouslySetInnerHTML: { __html: pageHtml } }
          : { "aria-busy": "true" })}
      />
    </>
  );
}
