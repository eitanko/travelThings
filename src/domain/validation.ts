import { AppError } from './errors';
import { isValidISODate } from './dates';
import { TYPE_INFO, fallbackType, normalizeLegacyType } from './classification';
import { CATEGORIES, type Category, type DocumentMetadata, type DocumentType, type StagedFile } from './types';

const IMAGE_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
};

export const extensionOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
};

/** Resolves a supported mime type (PDF or image) or throws UNSUPPORTED_FORMAT. */
export function resolveMimeType(name: string, reported?: string | null): string {
  const ext = extensionOf(name);
  const r = (reported ?? '').toLowerCase();
  if (r === 'application/pdf' || ext === 'pdf') return 'application/pdf';
  if (r.startsWith('image/')) return r === 'image/jpg' ? 'image/jpeg' : r;
  const fromExt = IMAGE_EXT[ext];
  if (fromExt) return fromExt;
  throw new AppError('UNSUPPORTED_FORMAT', undefined, `“${name}” can’t be saved. TravelThings supports PDF files and images.`);
}

export function normalizeStaged(files: StagedFile[]): StagedFile[] {
  return files.map((f) => ({ ...f, mimeType: resolveMimeType(f.name, f.mimeType) }));
}

/** Makes a filename safe to use inside the app's storage directory. Display name is kept separately. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();
  return (cleaned || fallback).slice(0, 120);
}

export const isDocumentType = (v: unknown): v is DocumentType => typeof v === 'string' && v in TYPE_INFO;
export const isCategory = (v: unknown): v is Category => typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);

/** All metadata is optional; this only normalizes values and drops anything invalid. */
export function sanitizeMetadata(input: {
  title?: string | null;
  category?: string | null;
  type?: string | null;
  activityDate?: string | null;
  expirationDate?: string | null;
}): DocumentMetadata {
  const title = input.title?.trim() ? input.title.trim().slice(0, 200) : null;
  // A valid type decides the category (they can never disagree). A category alone gets that category's catch-all type.
  // Legacy type keys are accepted. Neither → null/null (new entries then default to Other / General file).
  const type = normalizeLegacyType(input.type);
  const cat = isCategory(input.category) ? input.category : null;
  const category = type ? TYPE_INFO[type].category : cat;
  return {
    title,
    category,
    type: type ?? (category ? fallbackType(category) : null),
    activityDate: isValidISODate(input.activityDate) ? input.activityDate : null,
    expirationDate: isValidISODate(input.expirationDate) ? input.expirationDate : null,
  };
}
