import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // Certificate layout analysis uses pdf-lib only (lib/certificates/layout.ts);
  // pdf.js is not loaded on the server, so nothing needs externalizing here.
  // Keep the Next.js "N" badge off the sidebar Log out button
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
