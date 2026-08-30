"use client";

import { useEffect } from "react";
import type { LegacyPageData } from "@/lib/navigation";
import { bindPasswordToggles } from "@/components/legacy/bindPasswordToggles";

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

export function useLegacyScripts(
  scripts: LegacyPageData["scripts"],
  ready = true,
) {
  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function run() {
      // Legacy inline scripts bind to #app, sidebar, etc. — wait until injected HTML exists.
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        if (
          document.getElementById("app") ||
          document.querySelector("[data-legacy-content]")
        ) {
          break;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      for (const script of scripts) {
        if (cancelled) return;
        if (script.type === "src") {
          await loadScript(script.value);
        } else {
          try {
            // eslint-disable-next-line no-new-func
            new Function(script.value)();
          } catch (err) {
            console.warn("Legacy inline script error:", err);
          }
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [scripts, ready]);
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
    const host = document.querySelector("[data-legacy-content]");
    if (!host) return;
    const unbind = bindPasswordToggles(host);
    document.dispatchEvent(
      new CustomEvent("dc-legacy-content-ready", { detail: { pageId: data.id } }),
    );
    return unbind;
  }, [data.id]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: data.styles }} />
      <div
        data-legacy-content=""
        className={className}
        dangerouslySetInnerHTML={{ __html: data.html }}
      />
    </>
  );
}
