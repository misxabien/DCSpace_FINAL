"use client";

import { useEffect, useRef, type RefObject } from "react";
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
      const hydration = (
        window as Window & { __dcEventsHydration?: Promise<void> }
      ).__dcEventsHydration;
      if (hydration) {
        await hydration.catch(() => undefined);
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

const COURSE_TO_SCHOOL: Record<string, string> = {
  "bs-accountancy": "sase",
  "bs-accounting-information-system": "sase",
  "bs-psychology": "sase",
  beed: "sase",
  bsed: "sase",
  "bs-information-technology": "scmcs",
  bma: "scmcs",
  "ba-communication": "scmcs",
  "bsba-financial-management": "sihtm",
  "bsba-marketing-management": "sihtm",
  "bsba-human-resource-development-management": "sihtm",
  "bsba-operations-management": "sihtm",
  "bs-tourism-management": "sihtm",
  bshm: "sihtm",
  "bshm-cruiseline-operations": "sihtm",
  "bshm-culinary-arts-kitchen-operations": "sihtm",
  "bs-nursing": "snahs",
  "bs-physical-therapy": "snahs",
  "bs-radiologic-technology": "snahs",
  "bs-pharmacy": "smls",
  "bs-medical-laboratory-science": "smls",
  "bs-biology": "smls",
};

function syncSelectPlaceholder(select: HTMLSelectElement) {
  select.classList.toggle("is-placeholder", select.value === "");
}

function useCourseSchoolAutoFill(pageId: string, html: string) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const courseSelect = root.querySelector<HTMLSelectElement>("#course");
    const schoolSelect = root.querySelector<HTMLSelectElement>("#schoolDepartment");
    if (!courseSelect || !schoolSelect) {
      return;
    }

    root.querySelectorAll<HTMLSelectElement>(".form-group select").forEach(syncSelectPlaceholder);

    const applySchoolFromCourse = () => {
      const school = COURSE_TO_SCHOOL[courseSelect.value];
      if (!school) {
        return;
      }
      schoolSelect.value = school;
      syncSelectPlaceholder(schoolSelect);
    };

    const onCourseChange = () => {
      applySchoolFromCourse();
    };

    const onSchoolChange = () => {
      syncSelectPlaceholder(schoolSelect);
    };

    applySchoolFromCourse();

    courseSelect.addEventListener("change", onCourseChange);
    schoolSelect.addEventListener("change", onSchoolChange);

    return () => {
      courseSelect.removeEventListener("change", onCourseChange);
      schoolSelect.removeEventListener("change", onSchoolChange);
    };
  }, [pageId, html]);

  return rootRef;
}

function usePasswordVisibilityToggles(
  rootRef: RefObject<HTMLDivElement | null>,
  pageId: string,
  html: string,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest?.(".toggle-password") as HTMLButtonElement | null;
      if (!button || !root.contains(button)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const inputId = button.getAttribute("data-target");
      if (!inputId) {
        return;
      }

      const input = root.querySelector<HTMLInputElement>(`#${CSS.escape(inputId)}`);
      if (!input) {
        return;
      }

      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.classList.toggle("is-visible", !showing);
      button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      button.setAttribute("aria-pressed", showing ? "false" : "true");
    };

    root.addEventListener("click", onClick, true);
    return () => {
      root.removeEventListener("click", onClick, true);
    };
  }, [rootRef, pageId, html]);
}

export function LegacyContent({
  data,
  className,
}: {
  data: LegacyPageData;
  className?: string;
}) {
  const contentRef = useCourseSchoolAutoFill(data.id, data.html);
  usePasswordVisibilityToggles(contentRef, data.id, data.html);
  useLegacyScripts(data.scripts);

  useEffect(() => {
    document.title = data.title ? `DC Space — ${data.title}` : "DC Space";
  }, [data.title]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: data.styles }} />
      <div
        ref={contentRef}
        className={className}
        dangerouslySetInnerHTML={{ __html: data.html }}
      />
    </>
  );
}
