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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: data.styles }} />
      <div className={className} dangerouslySetInnerHTML={{ __html: data.html }} />
    </>
  );
}
