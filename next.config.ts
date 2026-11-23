import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // Do not list pdfjs-dist here: its legacy `.mjs` entry is ESM-only and Next
  // warns/fails when trying to externalize it. Certificate code loads it via
  // Node createRequire + file URL import instead.
  // Keep the Next.js "N" badge off the sidebar Log out button
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
