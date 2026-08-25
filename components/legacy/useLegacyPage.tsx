"use client";

import { useEffect, useState } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { bindPasswordToggles } from "@/components/legacy/bindPasswordToggles";

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
    setMounted(true);
  }, []);

  useLegacyScripts(mounted ? data.scripts : [], mounted ? data.id : undefined);
  const pageStyles = data.styles.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const pageHtml = data.html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  useEffect(() => {
    document.title = data.title ? `DC Space — ${data.title}` : "DC Space";
  }, [data.title]);

  useEffect(() => {
    if (!mounted) return;
    const host = document.querySelector("[data-legacy-content]");
    if (!host) return;
    return bindPasswordToggles(host);
  }, [data.id, mounted]);

  return (
    <>
      {mounted ? (
        <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
      ) : null}
      <div
        data-legacy-content=""
        className={className}
        suppressHydrationWarning
        {...(mounted
          ? { dangerouslySetInnerHTML: { __html: pageHtml } }
          : { "aria-busy": "true" })}
      />
    </>
  );
}
