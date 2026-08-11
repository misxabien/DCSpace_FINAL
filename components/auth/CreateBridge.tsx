"use client";

import { useEffect } from "react";
import { applyIdNumberField, readRegisterRole } from "@/lib/auth/registerRole";

export function CreateBridge() {
  useEffect(() => {
    applyIdNumberField(readRegisterRole());
  }, []);

  return null;
}
