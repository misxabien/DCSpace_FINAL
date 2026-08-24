/** Warm browser image cache for instant card/detail rendering. */
export function preloadImageUrls(urls: Array<string | undefined | null>) {
  if (typeof window === "undefined") return;

  const seen = new Set<string>();
  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}
