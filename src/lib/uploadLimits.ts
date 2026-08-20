// Single source of truth for file-upload caps used across:
//  - authenticated task attachments + Email customer
//  - the public tracking-page reply and intake form
//
// MAX_TOTAL_SIZE is deliberately well under Resend's ~40MB inbound email
// ceiling (files travel inline as base64, ~33% inflation), which is what
// actually constrains the "how much can we attach to one email" question.
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
export const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB combined
export const MAX_FILE_MB = 10;
export const MAX_TOTAL_MB = 25;

export const ALLOWED_MIME_TYPES = new Set<string>([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Matches the ALLOWED_MIME_TYPES set — kept in the shared file so the
// picker UI and the server-side check never drift apart.
export const FILE_INPUT_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx";
