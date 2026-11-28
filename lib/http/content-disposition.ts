/**
 * Content-Disposition header that is safe for any file name. HTTP headers only
 * carry Latin-1, so a name with "–", "→" or an emoji (event titles, uploaded
 * files) would make the response throw. Send a plain-ASCII fallback plus the
 * real name encoded per RFC 6266, which every current browser uses.
 */
export function contentDisposition(type: "inline" | "attachment", fileName: string, fallback = "download") {
  const clean = String(fileName || "").replace(/[\r\n"\\]/g, "").trim() || fallback;
  const ascii =
    clean
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/\s+/g, " ")
      .trim() || fallback;
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
