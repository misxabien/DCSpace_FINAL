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
