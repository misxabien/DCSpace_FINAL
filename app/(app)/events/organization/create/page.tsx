"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { canOrganizeEvents } from "@/lib/organize-access";

/** Legacy path — send organizers to the main create-event wizard. */
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    if (!canOrganizeEvents()) {
      router.replace("/events");
      return;
    }
    router.replace("/organized/create");
  }, [router]);

  return null;
}
