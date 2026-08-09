"use client";

import { Suspense } from "react";
import { TopLoadingBar } from "@/components/navigation/TopLoadingBar";

/** Suspense boundary required because TopLoadingBar reads searchParams. */
export function TopLoadingBarHost() {
  return (
    <Suspense fallback={null}>
      <TopLoadingBar />
    </Suspense>
  );
}
