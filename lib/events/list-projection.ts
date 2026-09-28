/** Exclude large attachment blobs from list queries. */
export const HEAVY_ATTACHMENT_PROJECTION = {
  conceptPaperBase64: 0,
  certificateTemplateBase64: 0,
  programFileBase64: 0,
} as const;

/** Browse/list queries — skip posters and heavy attachments. */
export const EVENT_LIST_PROJECTION = {
  ...HEAVY_ATTACHMENT_PROJECTION,
  posterImageBase64: 0,
} as const;

/**
 * Portal browse payload — skip all base64 blobs; clients use /attachments/* URLs.
 * Keep mime/name fields so hasPoster / hasConceptPaper still resolve.
 */
export const PORTAL_EVENT_PROJECTION = {
  ...HEAVY_ATTACHMENT_PROJECTION,
  posterImageBase64: 0,
} as const;

/** Auth + metadata fields needed to authorize attachment downloads. */
const ATTACHMENT_AUTH_FIELDS = {
  status: 1,
  organizerEmail: 1,
  organizerId: 1,
  programFileVisibility: 1,
} as const;

/**
 * Projection that fetches only one attachment blob — posters used to take
 * 30–90s because they also pulled the multi‑MB certificate PDF.
 */
export function attachmentKindProjection(kind: string): Record<string, 0 | 1> {
  if (kind === "poster") {
    return {
      ...ATTACHMENT_AUTH_FIELDS,
      posterImageBase64: 1,
      posterImageMimeType: 1,
      hasPoster: 1,
    };
  }
  if (kind === "certificate-template") {
    return {
      ...ATTACHMENT_AUTH_FIELDS,
      certificateTemplateBase64: 1,
      certificateTemplateMimeType: 1,
      certificateTemplateName: 1,
    };
  }
  if (kind === "concept-paper") {
    return {
      ...ATTACHMENT_AUTH_FIELDS,
      conceptPaperBase64: 1,
      conceptPaperMimeType: 1,
      conceptPaperName: 1,
    };
  }
  if (kind === "program-file") {
    return {
      ...ATTACHMENT_AUTH_FIELDS,
      programFileBase64: 1,
      programFileMimeType: 1,
      programFileName: 1,
      programFileVisibility: 1,
    };
  }
  return { ...ATTACHMENT_AUTH_FIELDS };
}
