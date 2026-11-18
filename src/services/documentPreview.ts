import { File } from 'expo-file-system';
import { AppError } from '@/domain/errors';

/**
 * Presents the native iOS Quick Look viewer (via expo-file-system) for the given local files.
 *
 * - Works offline: Quick Look reads the stored file directly. Pinch-zoom, multi-page scrolling and swiping
 *   between several files of the same entry are provided by the system viewer.
 * - Resolves once the viewer is presented, not when it closes. The user's Done button therefore returns them
 *   to the screen they tapped from, which is why this is called from that screen rather than from a route.
 *
 * Resolves 'unsupported' when Quick Look can't show these files; the caller then uses the in-app viewer.
 * Throws AppError('FILE_MISSING') when a stored file is no longer on disk.
 */
export async function presentQuickLook(uris: string[], initialIndex: number): Promise<'shown' | 'unsupported'> {
  const files = uris.map((uri) => new File(uri));
  if (files.length === 0) throw new AppError('FILE_MISSING');
  if (files.some((f) => !f.exists)) throw new AppError('FILE_MISSING');
  if (!(await File.canPreview(files))) return 'unsupported';
  await File.preview(files, { initialIndex });
  return 'shown';
}

/**
 * Opens the preview for `index`, falling back to the in-app viewer when Quick Look is unavailable.
 * Errors (for example a missing file) are thrown so the calling screen can show its own error sheet.
 */
export async function openPreview(uris: string[], index: number, fallback: () => void): Promise<void> {
  const result = await presentQuickLook(uris, index);
  if (result === 'unsupported') fallback();
}
