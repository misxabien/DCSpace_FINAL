import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // pdf.js (certificate template layout analysis) loads its own worker module at
  // runtime; keep it as a plain Node dependency instead of bundling it.
  serverExternalPackages: ["pdfjs-dist"],
  // Keep the Next.js "N" badge off the sidebar Log out button
  devIndicators: {
    position: "bottom-right",
  },
};

export default nextConfig;
