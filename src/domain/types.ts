/** Phase 1 domain model: a Document is an opaque stored file set with optional metadata. */

export const DOCUMENT_TYPES = [
  'flight',
  'hotel',
  'transport',
  'attraction',
  'passport',
  'visa',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type FilterCategory = 'all' | 'bookings' | 'ids' | 'other';

export type AttachmentKind = 'pdf' | 'image';

export interface Attachment {
  id: string;
  documentId: string;
  position: number;
  originalName: string;
  /** Path relative to the app's document directory. Never an absolute URI (container paths change between launches/updates). */
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  /** SHA-256 hex of the stored bytes. */
  checksum: string;
}

export interface Document {
  id: string;
  /** Original filename of the first attachment; display fallback when title is empty. */
  originalName: string;
  title: string | null;
  type: DocumentType | null;
  /** Local calendar date, `YYYY-MM-DD`. */
  activityDate: string | null;
  importedAt: number;
  /** Stable identity of the file content (see fingerprintOf). Used for duplicate detection. */
  fingerprint: string;
  /** Directory (relative) that holds this document's files; swapped atomically on Replace. */
  storageKey: string;
  attachments: Attachment[];
}

export interface DocumentMetadata {
  title: string | null;
  type: DocumentType | null;
  activityDate: string | null;
}

/** A file selected by the user and still sitting in a temporary location. */
export interface StagedFile {
  uri: string;
  name: string;
  mimeType: string;
  /** Size reported by the picker, if any. The real size is re-read from disk before copying. */
  size?: number;
}

export const EMPTY_METADATA: DocumentMetadata = {
  title: null,
  type: null,
  activityDate: null,
};
