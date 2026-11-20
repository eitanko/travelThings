import * as ImageManipulator from 'expo-image-manipulator';
import { extensionOf } from '@/domain/validation';
import type { StagedFile } from '@/domain/types';
import { removeTempFile } from './importer';

const withExtension = (name: string, ext: string): string => {
  const e = extensionOf(name);
  const base = e ? name.slice(0, -(e.length + 1)) : name;
  return `${base}.${ext}`;
};

/**
 * Turns one staged image 90° clockwise and returns the updated staged file.
 *
 * - Always re-renders from the untouched original, so several turns never stack lossy re-encodes.
 * - Four turns bring the file back to the original (no corrected copy is kept then).
 * - The original capture is recorded in `originalUri` and is never modified.
 * - The corrected copy is a temporary file; it is written to permanent storage only when the document is saved.
 */
export async function rotateStagedImage(file: StagedFile): Promise<StagedFile> {
  const originalUri = file.originalUri ?? file.uri;
  const originalName = file.originalName ?? file.name;
  const turns = ((file.turns ?? 0) + 1) % 4;
  const previousCopy = file.uri !== originalUri ? file.uri : null;

  if (turns === 0) {
    if (previousCopy) removeTempFile(previousCopy);
    return { ...file, uri: originalUri, originalUri, originalName, turns: 0, name: originalName, mimeType: file.originalMimeType ?? file.mimeType };
  }

  // Keep PNG as PNG (transparency survives); everything else becomes JPEG, which every viewer in the app reads.
  const png = (file.originalMimeType ?? file.mimeType) === 'image/png';
  const result = await ImageManipulator.manipulateAsync(originalUri, [{ rotate: turns * 90 }], {
    compress: 1,
    format: png ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
  });
  if (previousCopy) removeTempFile(previousCopy);

  return {
    ...file,
    uri: result.uri,
    originalUri,
    originalName,
    originalMimeType: file.originalMimeType ?? file.mimeType,
    turns,
    name: withExtension(file.name, png ? 'png' : 'jpg'),
    mimeType: png ? 'image/png' : 'image/jpeg',
    size: undefined,
  };
}

/**
 * Renders a copy of an image turned `turns` clockwise quarter turns (1–3) into a temporary file.
 * `sourceUri` is read only. The caller decides what to do with the copy (the service stores it on save).
 */
export async function renderRotatedCopy(
  sourceUri: string,
  turns: number,
  name: string,
  mimeType: string,
): Promise<{ uri: string; name: string; mimeType: string }> {
  const png = mimeType === 'image/png';
  const result = await ImageManipulator.manipulateAsync(sourceUri, [{ rotate: turns * 90 }], {
    compress: 1,
    format: png ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, name: withExtension(name, png ? 'png' : 'jpg'), mimeType: png ? 'image/png' : 'image/jpeg' };
}
