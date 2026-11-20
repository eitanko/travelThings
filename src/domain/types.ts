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
  /**
   * Path of the untouched original capture, when the user rotated this file before saving. `relativePath` then holds
   * the corrected copy. Null when the file was never rotated. Never shown in the library; kept so nothing is lost.
   */
  originalRelativePath: string | null;
  /** Clockwise quarter turns (0–3) applied to the original to get `relativePath`. 0 when never rotated. */
  rotationTurns: number;
}

/** A user-created folder for documents. `My Documents` is the permanent default trip. */
export interface Trip {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface Document {
  id: string;
  /** Trip (folder) this entry belongs to. Required; every entry has exactly one trip. */
  tripId: string;
  /** Original filename of the first attachment; display fallback when title is empty. */
  originalName: string;
  title: string | null;
  type: DocumentType | null;
  /** Local calendar date, `YYYY-MM-DD`. */
  activityDate: string | null;
  /** Optional expiry of the document itself (passport, licence, ID…), `YYYY-MM-DD`. Separate from `activityDate`. */
  expirationDate: string | null;
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
  expirationDate: string | null;
}

/** A file selected by the user and still sitting in a temporary location. */
export interface StagedFile {
  uri: string;
  name: string;
  mimeType: string;
  /** Size reported by the picker, if any. The real size is re-read from disk before copying. */
  size?: number;
  /** Untouched capture, set once the user starts rotating this file. `uri` then points at the rotated copy. */
  originalUri?: string;
  /** Clockwise quarter turns applied to `originalUri` (0–3). Undefined or 0 means `uri` is the original. */
  turns?: number;
  /** Name and type of the untouched capture, kept so the original is stored with its real format. */
  originalName?: string;
  originalMimeType?: string;
}

export const EMPTY_METADATA: DocumentMetadata = {
  title: null,
  type: null,
  activityDate: null,
  expirationDate: null,
};
